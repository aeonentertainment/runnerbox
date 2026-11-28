import { fixFor } from "./fixes.ts";
import type { Probe } from "./probe.ts";
import { ok, type SetupCheck, type SetupStep } from "./setup-check.ts";
import { networkManagerSetting } from "./settings-files.ts";

// Wi-Fi only: power saving adds latency and drops, and a connection saved for one user doesn't
// join until they log in. A machine without Wi-Fi skips both.
export async function networkStep(probe: Probe): Promise<SetupStep> {
  const devices = (await probe.run("nmcli", ["-t", "-f", "DEVICE,TYPE", "device"])).stdout;
  const hasWifi = devices.split("\n").some((line) => line.endsWith(":wifi"));
  return { id: "network", title: "Network", checks: [await powerSave(probe, hasWifi), await joinsAtBoot(probe, hasWifi)] };
}

const skipped = (id: string, title: string): SetupCheck => ({ id, title, verdict: "skipped", detail: "No Wi-Fi on this machine." });

async function powerSave(probe: Probe, hasWifi: boolean): Promise<SetupCheck> {
  const title = "Wi-Fi power saving off";
  if (!hasWifi) return skipped("wifi-powersave", title);
  // 2 is NetworkManager's "disable".
  if ((await networkManagerSetting(probe, "wifi.powersave")) === "2") return ok("wifi-powersave", title);
  return { id: "wifi-powersave", title, verdict: "fixable", detail: "Power saving can add 100 ms or more to every packet and drop SSH sessions.", fix: fixFor("wifi-powersave-off") };
}

async function joinsAtBoot(probe: Probe, hasWifi: boolean): Promise<SetupCheck> {
  const title = "Wi-Fi joins before anyone logs in";
  if (!hasWifi) return skipped("wifi-all-users", title);
  const active = (await probe.run("nmcli", ["-t", "-f", "NAME,TYPE", "connection", "show", "--active"])).stdout;
  const names = active.split("\n").flatMap((line) => (line.endsWith(":802-11-wireless") ? [line.slice(0, line.lastIndexOf(":")).replaceAll("\\:", ":")] : []));
  if (names.length === 0) return { id: "wifi-all-users", title, verdict: "skipped", detail: "No Wi-Fi connection is active." };
  for (const name of names) {
    const { stdout } = await probe.run("nmcli", ["-g", "connection.permissions", "connection", "show", name]);
    if (stdout.trim() !== "") {
      return { id: "wifi-all-users", title, verdict: "fixable", detail: `"${name}" is saved for one user, so it joins only after they log in.`, fix: fixFor("wifi-all-users") };
    }
  }
  return ok("wifi-all-users", title);
}
