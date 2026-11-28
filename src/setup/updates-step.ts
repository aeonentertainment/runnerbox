import type { Probe } from "./probe.ts";
import { ok, type SetupCheck, type SetupStep } from "./setup-check.ts";
import { aptSetting } from "./settings-files.ts";

// Security updates install by themselves. A kernel only takes effect after a restart, and the
// VM's user has no sudo by design, so the host restarting is how both pick one up.
export async function updatesStep(probe: Probe): Promise<SetupStep> {
  return { id: "updates", title: "Updates", checks: [await unattended(probe), await reboot(probe)] };
}

async function unattended(probe: Probe): Promise<SetupCheck> {
  const title = "Security updates install by themselves";
  if ((await aptSetting(probe, "APT::Periodic::Unattended-Upgrade")) === "1") return ok("unattended-upgrades", title);
  return { id: "unattended-upgrades", title, verdict: "fixable", detail: "Unattended upgrades are off.", fix: { id: "unattended-upgrades", sudo: true } };
}

async function reboot(probe: Probe): Promise<SetupCheck> {
  const title = "Restarts for updates at night";
  if ((await aptSetting(probe, "Unattended-Upgrade::Automatic-Reboot")) === "true") {
    const time = await aptSetting(probe, "Unattended-Upgrade::Automatic-Reboot-Time");
    return { ...ok("auto-reboot", title), detail: `At ${time ?? "the time unattended-upgrades picks"} when an update needs it.` };
  }
  return { id: "auto-reboot", title, verdict: "fixable", detail: "A new kernel waits for someone to restart the machine.", fix: { id: "auto-reboot", sudo: true } };
}
