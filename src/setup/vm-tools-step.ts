import type { Probe } from "./probe.ts";
import { ok, type SetupCheck, type SetupFix, type SetupStep } from "./setup-check.ts";
import { anyFileHas } from "./settings-files.ts";

export const VM_PACKAGES = ["qemu-system-x86", "qemu-utils", "libvirt-daemon-system", "virtinst", "xorriso", "curl"];
const GROUPS = ["libvirt", "kvm"];

// What the README's VM setup asks of the host, plus the storage pool a fresh libvirt lacks and
// linger, which starts the user's services at boot without a login.
export async function vmToolsStep(probe: Probe): Promise<SetupStep> {
  const fix: SetupFix = { id: "vm-tools", sudo: true };
  return { id: "vm-tools", title: "VM tools", checks: [await packages(probe, fix), await bridgeFilter(probe, fix), await groups(probe, fix), await pool(probe), await linger(probe)] };
}

async function packages(probe: Probe, fix: SetupFix): Promise<SetupCheck> {
  const title = "KVM and libvirt packages";
  const missing: string[] = [];
  for (const name of VM_PACKAGES) {
    const { stdout } = await probe.run("dpkg-query", ["-W", "-f=${Status}", name]);
    if (stdout.trim() !== "install ok installed") missing.push(name);
  }
  if (missing.length === 0) return ok("packages", title);
  return { id: "packages", title, verdict: "fixable", detail: `Missing ${missing.join(", ")}.`, fix };
}

// The VM's firewall is a libvirt network filter, which needs bridged traffic to pass iptables.
async function bridgeFilter(probe: Probe, fix: SetupFix): Promise<SetupCheck> {
  const title = "Bridged traffic goes through the firewall";
  const loaded = await probe.exists("/sys/module/br_netfilter");
  const on = ((await probe.read("/proc/sys/net/bridge/bridge-nf-call-iptables")) ?? "").trim() === "1";
  const kept = (await anyFileHas(probe, "/etc/modules-load.d", /^\s*br_netfilter\s*$/)) && (await anyFileHas(probe, "/etc/sysctl.d", /^\s*net\.bridge\.bridge-nf-call-iptables\s*=\s*1\s*$/));
  if (loaded && on && kept) return ok("bridge-filter", title);
  const detail = loaded && on ? "On now, but it won't come back after a restart." : "br_netfilter isn't loaded with bridge-nf-call-iptables on, so the VM's firewall filters nothing.";
  return { id: "bridge-filter", title, verdict: "fixable", detail, fix };
}

async function groups(probe: Probe, fix: SetupFix): Promise<SetupCheck> {
  const title = `${probe.user} is in the ${GROUPS.join(" and ")} groups`;
  const member = (await probe.run("id", ["-nG", probe.user])).stdout.trim().split(/\s+/);
  const missing = GROUPS.filter((group) => !member.includes(group));
  if (missing.length === 0) return ok("groups", title);
  return { id: "groups", title, verdict: "fixable", detail: `Not in ${missing.join(", ")}.`, fix };
}

async function pool(probe: Probe): Promise<SetupCheck> {
  const title = "libvirt's default storage pool runs at boot";
  const { code, stdout, stderr } = await probe.run("virsh", ["-c", "qemu:///system", "pool-info", "default"]);
  if (code === 127) return { id: "pool", title, verdict: "skipped", detail: "Waiting on the packages." };
  // Group membership reaches a process only from a new login, so this can lag the groups check.
  if (/permission denied|authentication (failed|unavailable)/i.test(stderr)) {
    return { id: "pool", title, verdict: "skipped", detail: `libvirt refuses ${probe.user} until a new login picks up the libvirt group.` };
  }
  const field = (name: string) => new RegExp(`^${name}:\\s*(\\S+)`, "m").exec(stdout)?.[1];
  if (code === 0 && field("State") === "running" && field("Autostart") === "yes") return ok("pool", title);
  return { id: "pool", title, verdict: "fixable", detail: code === 0 ? "It exists but isn't running and started at boot." : "There's no default pool, so the VM has nowhere for its disks.", fix: { id: "storage-pool", sudo: true } };
}

async function linger(probe: Probe): Promise<SetupCheck> {
  const title = "Services start at boot without a login";
  const { stdout } = await probe.run("loginctl", ["show-user", probe.user, "-p", "Linger"]);
  if (stdout.trim() === "Linger=yes") return ok("linger", title);
  return { id: "linger", title, verdict: "fixable", detail: "Without linger, runnerbox's services stop when you log out and don't start until you log in.", fix: { id: "linger", sudo: true } };
}
