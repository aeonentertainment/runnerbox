import assert from "node:assert/strict";
import { test } from "node:test";
import { checkMachine, isReady } from "./check-machine.ts";
import type { Probe } from "./probe.ts";
import type { SetupStep } from "./setup-check.ts";

type Machine = { files?: Record<string, string>; commands?: Record<string, { code?: number; stdout?: string; stderr?: string }> };

// A machine described by its files and its commands' output, keyed by the full command line.
function probe({ files = {}, commands = {} }: Machine): Probe {
  return {
    user: "owner",
    run: async (command, args) => {
      const result = commands[[command, ...args].join(" ")];
      return result ? { code: result.code ?? 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" } : { code: 127, stdout: "", stderr: "" };
    },
    read: async (path) => files[path] ?? null,
    list: async (dir) => [...new Set(Object.keys(files).flatMap((path) => (path.startsWith(`${dir}/`) ? [path.slice(dir.length + 1).split("/")[0] ?? ""] : [])))],
    exists: async (path) => path in files || Object.keys(files).some((file) => file.startsWith(`${path}/`)),
  };
}

const verdicts = (steps: SetupStep[]) => Object.fromEntries(steps.flatMap((step) => step.checks.map((check) => [check.id, check.verdict])));

const READY: Machine = {
  files: {
    "/etc/os-release": 'ID=ubuntu\nVERSION_ID="24.04"\n',
    "/dev/kvm": "",
    "/sys/module/br_netfilter/refcnt": "0",
    "/proc/sys/net/bridge/bridge-nf-call-iptables": "1\n",
    "/etc/modules-load.d/runnerbox.conf": "br_netfilter\n",
    "/etc/sysctl.d/90-runnerbox.conf": "net.bridge.bridge-nf-call-iptables=1\n",
    "/etc/apt/apt.conf.d/20auto-upgrades": 'APT::Periodic::Unattended-Upgrade "1";\n',
    "/etc/apt/apt.conf.d/50unattended-upgrades": '//Unattended-Upgrade::Automatic-Reboot "true";\n',
    "/etc/apt/apt.conf.d/52reboot": "Unattended-Upgrade::Automatic-Reboot true;\n",
  },
  commands: {
    "uname -m": { stdout: "x86_64\n" },
    "df -B1 --output=avail /home/owner": { stdout: "Avail\n900000000000\n" },
    "systemctl is-enabled sleep.target suspend.target hibernate.target hybrid-sleep.target": { stdout: "masked\nmasked\nmasked\nmasked\n" },
    "nmcli -t -f DEVICE,TYPE device": { stdout: "eno1:ethernet\nlo:loopback\n" },
    ...Object.fromEntries(["qemu-system-x86", "qemu-utils", "libvirt-daemon-system", "virtinst", "xorriso", "curl"].map((name) => [`dpkg-query -W -f=\${Status} ${name}`, { stdout: "install ok installed" }])),
    "id -nG owner": { stdout: "owner sudo libvirt kvm\n" },
    "virsh -c qemu:///system pool-info default": { stdout: "Name:           default\nState:          running\nAutostart:      yes\n" },
    "loginctl show-user owner -p Linger": { stdout: "Linger=yes\n" },
  },
};

test("a set-up machine is ready, and one without Wi-Fi skips the Wi-Fi checks", async () => {
  const steps = await checkMachine(probe(READY), "/home/owner");
  assert.ok(isReady(steps));
  assert.equal(verdicts(steps)["wifi-powersave"], "skipped");
});

test("a fresh install names a fix for each missing piece, and only sudo fixes need sudo", async () => {
  const steps = await checkMachine(
    probe({
      files: { "/etc/os-release": READY.files?.["/etc/os-release"] ?? "", "/dev/kvm": "" },
      commands: {
        "uname -m": { stdout: "x86_64\n" },
        "df -B1 --output=avail /home/owner": { stdout: "Avail\n900000000000\n" },
        "systemctl is-enabled sleep.target suspend.target hibernate.target hybrid-sleep.target": { stdout: "static\nstatic\nstatic\nstatic\n" },
        "id -nG owner": { stdout: "owner sudo\n" },
        "loginctl show-user owner -p Linger": { stdout: "Linger=no\n" },
      },
    }),
    "/home/owner",
  );
  assert.ok(!isReady(steps));
  const fixes = steps.flatMap((step) => step.checks.flatMap((check) => (check.fix ? [check.fix.id] : [])));
  assert.deepEqual(new Set(fixes), new Set(["mask-sleep", "vm-tools", "linger", "unattended-upgrades", "auto-reboot"]));
  // virsh isn't installed yet, so the pool waits on the packages instead of reading as missing.
  assert.equal(verdicts(steps).pool, "skipped");
});

test("Wi-Fi settings resolve the way NetworkManager reads them: the last file by name wins", async () => {
  const wifi = (files: Record<string, string>, permissions = "") =>
    checkMachine(
      probe({
        ...READY,
        files: { ...READY.files, ...files },
        commands: {
          ...READY.commands,
          "nmcli -t -f DEVICE,TYPE device": { stdout: "wlp3s0:wifi\n" },
          "nmcli -t -f NAME,TYPE connection show --active": { stdout: "home\\:5g:802-11-wireless\n" },
          "nmcli -g connection.permissions connection show home:5g": { stdout: permissions },
        },
      }),
      "/home/owner",
    ).then(verdicts);

  const distro = { "/etc/NetworkManager/conf.d/default-wifi-powersave-on.conf": "[connection]\nwifi.powersave = 3\n" };
  assert.equal((await wifi(distro))["wifi-powersave"], "fixable");
  assert.equal((await wifi({ ...distro, "/etc/NetworkManager/conf.d/wifi-powersave-off.conf": "[connection]\nwifi.powersave = 2\n" }))["wifi-powersave"], "ok");
  // A file in /etc replaces the one of the same name in /usr/lib.
  assert.equal((await wifi({ "/usr/lib/NetworkManager/conf.d/a.conf": "wifi.powersave = 2\n", "/etc/NetworkManager/conf.d/a.conf": "wifi.powersave = 3\n" }))["wifi-powersave"], "fixable");
  assert.equal((await wifi({}, "user:owner\n"))["wifi-all-users"], "fixable");
});

test("advice only a person can act on never blocks setup", async () => {
  const steps = await checkMachine(
    probe({
      ...READY,
      files: {
        ...READY.files,
        "/etc/crypttab": "# <name> <device> <key> <options>\ndm_crypt-0 UUID=1234 none luks\n",
        "/etc/gdm3/custom.conf": "[daemon]\nAutomaticLoginEnable=true\n",
        "/sys/class/drm/card0/device/mem_info_vram_total": String(6 * 1024 ** 3),
      },
    }),
    "/home/owner",
  );
  const all = verdicts(steps);
  assert.deepEqual([all["boot-passphrase"], all["auto-login"], all["graphics-memory"]], ["manual", "manual", "manual"]);
  assert.ok(isReady(steps));
});

test("libvirt refusing a session that predates the group reads as waiting, not as a missing pool", async () => {
  const steps = await checkMachine(
    probe({ ...READY, commands: { ...READY.commands, "virsh -c qemu:///system pool-info default": { code: 1, stderr: "error: authentication unavailable: no polkit agent" } } }),
    "/home/owner",
  );
  assert.equal(verdicts(steps).pool, "skipped");
});
