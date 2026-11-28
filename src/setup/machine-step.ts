import { fixFor } from "./fixes.ts";
import { ok, type SetupCheck, type SetupStep } from "./setup-check.ts";
import type { Probe } from "./probe.ts";

const GIB = 1024 ** 3;
const MIN_FREE_GIB = 50;
const SLEEP_TARGETS = ["sleep.target", "suspend.target", "hibernate.target", "hybrid-sleep.target"];

// What runnerbox needs from the machine itself, and what it can only explain, such as the BIOS.
export async function machineStep(probe: Probe, home: string): Promise<SetupStep> {
  return {
    id: "machine",
    title: "Machine",
    checks: [
      await system(probe),
      await kvm(probe),
      await graphicsMemory(probe),
      await diskFree(probe, home),
      await bootPassphrase(probe),
      await sleep(probe),
      await autoLogin(probe),
    ],
  };
}

async function system(probe: Probe): Promise<SetupCheck> {
  const title = "Ubuntu 24.04 or newer on x86_64";
  const release = (await probe.read("/etc/os-release")) ?? "";
  const field = (name: string) => new RegExp(`^${name}="?([^"\\n]*)"?$`, "m").exec(release)?.[1];
  const arch = (await probe.run("uname", ["-m"])).stdout.trim();
  const version = Number(field("VERSION_ID"));
  if (field("ID") === "ubuntu" && version >= 24.04 && arch === "x86_64") return ok("system", title);
  return { id: "system", title, verdict: "failed", detail: `This is ${field("PRETTY_NAME") ?? "an unknown system"} on ${arch || "an unknown CPU"}. Runnerbox's VM setup is written for Ubuntu 24.04 or newer on x86_64.` };
}

async function kvm(probe: Probe): Promise<SetupCheck> {
  const title = "KVM available";
  if (await probe.exists("/dev/kvm")) return ok("kvm", title);
  return { id: "kvm", title, verdict: "failed", detail: "There's no /dev/kvm. Turn on virtualization (SVM or VT-x) in the BIOS." };
}

// An integrated GPU's memory comes out of RAM, and some machines reserve gigabytes by default.
async function graphicsMemory(probe: Probe): Promise<SetupCheck> {
  const title = "Graphics reserves at most 1 GiB";
  let reserved = 0;
  for (const card of await probe.list("/sys/class/drm")) {
    if (!/^card\d+$/.test(card)) continue;
    reserved = Math.max(reserved, Number((await probe.read(`/sys/class/drm/${card}/device/mem_info_vram_total`)) ?? 0));
  }
  if (reserved <= GIB) return ok("graphics-memory", title);
  return {
    id: "graphics-memory",
    title,
    verdict: "manual",
    detail: `Graphics reserves ${(reserved / GIB).toFixed(1)} GiB. If that's integrated graphics, it comes out of RAM: set the UMA frame buffer size to 512M in the BIOS. A separate graphics card's memory doesn't count, so ignore this then.`,
  };
}

async function diskFree(probe: Probe, home: string): Promise<SetupCheck> {
  const title = `At least ${MIN_FREE_GIB} GiB free`;
  const { code, stdout } = await probe.run("df", ["-B1", "--output=avail", home]);
  const free = Number(stdout.trim().split("\n").at(-1));
  if (code !== 0 || Number.isNaN(free)) return { id: "disk-free", title, verdict: "failed", detail: `Couldn't read free space for ${home}.` };
  if (free >= MIN_FREE_GIB * GIB) return ok("disk-free", title);
  return { id: "disk-free", title, verdict: "failed", detail: `${Math.floor(free / GIB)} GiB free. The VM's disk and images need ${MIN_FREE_GIB} GiB or more.` };
}

// A passphrase at boot stops every unattended restart, including the nightly one for updates.
async function bootPassphrase(probe: Probe): Promise<SetupCheck> {
  const title = "Boots without a passphrase";
  const entries = ((await probe.read("/etc/crypttab")) ?? "").split("\n").filter((line) => line.trim() && !line.trim().startsWith("#"));
  const asks = entries.filter((line) => {
    const [, , key = "none", options = ""] = line.trim().split(/\s+/);
    return key === "none" && !/tpm2-device|fido2-device/.test(options);
  });
  if (asks.length === 0) return ok("boot-passphrase", title);
  return {
    id: "boot-passphrase",
    title,
    verdict: "manual",
    detail: "The disk asks for a passphrase at boot, so the machine can't come back by itself after a restart. Enroll the TPM with systemd-cryptenroll, or accept that someone types it after each restart.",
  };
}

async function sleep(probe: Probe): Promise<SetupCheck> {
  const title = "Never sleeps";
  const { stdout } = await probe.run("systemctl", ["is-enabled", ...SLEEP_TARGETS]);
  const states = stdout.trim().split("\n");
  if (states.length === SLEEP_TARGETS.length && states.every((state) => state === "masked")) return ok("sleep", title);
  return { id: "sleep", title, verdict: "fixable", detail: "The login screen suspends an idle machine after about 20 minutes, which takes its runners offline.", fix: fixFor("mask-sleep") };
}

// Not needed, since runnerbox's services start at boot with linger, and it hands the desktop to anyone at the keyboard.
async function autoLogin(probe: Probe): Promise<SetupCheck> {
  const title = "No automatic desktop login";
  const gdm = (await probe.read("/etc/gdm3/custom.conf")) ?? "";
  if (!/^\s*AutomaticLoginEnable\s*=\s*true/im.test(gdm)) return ok("auto-login", title);
  return { id: "auto-login", title, verdict: "manual", detail: "The desktop logs in by itself, so anyone at the keyboard gets your session. Runnerbox doesn't need it. Turn it off in Settings, Users." };
}
