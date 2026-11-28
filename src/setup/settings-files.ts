import type { Probe } from "./probe.ts";

// A drop-in directory's files in the order their program reads them: by file name, with a file
// in a later directory replacing one of the same name in an earlier one.
async function dropIns(probe: Probe, dirs: string[], suffix: string) {
  const byName = new Map<string, string>();
  for (const dir of dirs) for (const name of await probe.list(dir)) if (name.endsWith(suffix)) byName.set(name, `${dir}/${name}`);
  return [...byName.keys()].sort().map((name) => byName.get(name) ?? "");
}

// The last value a list of files gives a setting, the way programs that read drop-ins resolve it.
async function lastValue(probe: Probe, paths: string[], pattern: RegExp) {
  let value: string | null = null;
  for (const path of paths) {
    for (const line of ((await probe.read(path)) ?? "").split("\n")) {
      const match = pattern.exec(line);
      if (match?.[1] !== undefined) value = match[1];
    }
  }
  return value;
}

// NetworkManager reads its main file, then conf.d from /usr/lib, /run and /etc.
export async function networkManagerSetting(probe: Probe, key: string) {
  const confD = await dropIns(probe, ["/usr/lib/NetworkManager/conf.d", "/run/NetworkManager/conf.d", "/etc/NetworkManager/conf.d"], ".conf");
  return lastValue(probe, ["/etc/NetworkManager/NetworkManager.conf", ...confD], new RegExp(`^\\s*${escape(key)}\\s*=\\s*(\\S+)`));
}

// apt reads apt.conf.d by name; `//` lines are comments, so they never match.
export async function aptSetting(probe: Probe, key: string) {
  const files = await dropIns(probe, ["/etc/apt/apt.conf.d"], "");
  return lastValue(probe, files, new RegExp(`^\\s*${escape(key)}\\s+"?([^";\\s]+)"?\\s*;`));
}

// Whether any file in a directory has a line matching `pattern`, ignoring comments.
export async function anyFileHas(probe: Probe, dir: string, pattern: RegExp) {
  for (const name of await probe.list(dir)) {
    const lines = ((await probe.read(`${dir}/${name}`)) ?? "").split("\n");
    if (lines.some((line) => !/^\s*[#;]/.test(line) && pattern.test(line))) return true;
  }
  return false;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
