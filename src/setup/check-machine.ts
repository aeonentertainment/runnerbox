import { homedir } from "node:os";
import { machineStep } from "./machine-step.ts";
import { networkStep } from "./network-step.ts";
import type { Probe } from "./probe.ts";
import type { SetupStep } from "./setup-check.ts";
import { updatesStep } from "./updates-step.ts";
import { vmToolsStep } from "./vm-tools-step.ts";

// The machine-level steps of setting up a host for runnerbox, in the order a person fixes them.
// Steps that need runnerbox's own config, such as the VM and runners, check it separately.
export async function checkMachine(probe: Probe, home = homedir()): Promise<SetupStep[]> {
  return [await machineStep(probe, home), await networkStep(probe), await vmToolsStep(probe), await updatesStep(probe)];
}

export const isReady = (steps: SetupStep[]) => steps.every((step) => step.checks.every((check) => check.verdict !== "fixable" && check.verdict !== "failed"));
