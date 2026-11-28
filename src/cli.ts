#!/usr/bin/env node
import { parseArgs } from "node:util";
import serverPackage from "../apps/server/package.json" with { type: "json" };
import { SERVER_COMMANDS } from "../apps/server/src/commandNames.ts";
import { releaseRepository } from "../apps/server/src/update/releaseRepository.ts";
import { createGitHubClient, REPO_NAME, resolveToken } from "./github/github-client.ts";
import { renderHost } from "./host/render-host.ts";
import { checkMachine, isReady } from "./setup/check-machine.ts";
import { FIXES, fixScript, isFixId } from "./setup/fixes.ts";
import { formatSetup } from "./setup/format-setup.ts";
import { runFix } from "./setup/run-fix.ts";
import { createLocalProbe } from "./setup/probe.ts";
import { loadLauncherConfig } from "./launcher/launcher-config.ts";
import { startRunners } from "./launcher/start-runners.ts";
import { formatStepComparison, formatSummary } from "./tracking/format-report.ts";
import { readInstallLogs } from "./tracking/install-logs.ts";
import { machineDuringJobs } from "./tracking/job-machine.ts";
import { LauncherEventRecord } from "./tracking/launcher-event.ts";
import { summarizeLauncher } from "./tracking/launcher-summary.ts";
import { summarizeMachines } from "./tracking/machine-summary.ts";
import { createRedactor, loadRedactionKey } from "./tracking/redactor.ts";
import { formatWeeklySummary, redactSummary } from "./tracking/weekly-summary.ts";
import { createJobLog, defaultLogPath } from "./tracking/job-log.ts";
import { readSamples } from "./tracking/sample-log.ts";
import { stateDir } from "./tracking/state-dir.ts";
import { compareSteps, summarizeJobs } from "./tracking/report.ts";
import { DAY_MS, syncJobs } from "./tracking/sync-jobs.ts";
import { renderVm } from "./vm/render-vm.ts";
import { loadVmConfig } from "./vm/vm-config.ts";

const USAGE = `Usage:
  runnerbox up --config <file>
  runnerbox setup check [--json]
  runnerbox setup fix <fix> [--print]
  runnerbox vm render --config <file> --out <dir>
  runnerbox host render --config <file> --out <dir>
  runnerbox report --repo <owner/name> [options]
  runnerbox summary --repo <owner/name> [--since <days>d] [--by labels|runner] [--redact]
  runnerbox serve | pair | mcp-token | link | unlink | link-status | codex-login   (see runnerbox serve --help)
  runnerbox --version

up: keeps runners waiting for jobs in the VM until stopped.
setup check: reads whether this machine is ready to host runnerbox's VM, and why not. Changes nothing.
setup fix: runs one fix that setup check names, as root through sudo. --print shows its script instead.
  Without a terminal, the first line of stdin is the sudo password, or empty when sudo needs none.
vm render: writes the VM's cloud-init seed, firewall and a create.sh to run on the host.
host render: for an install whose jobs run on this Mac's own OS, writes a setup.sh to run with sudo.
summary: markdown from the local logs alone: the slowest jobs, what \`up\` did, and how close
  the machines came to running out. --redact hashes every name with a key kept on this host.
report: copies job history from GitHub to a local log, then summarizes it.
serve: answers the desktop app and agents with this host's history and runner state, read-only.

Report options:
  --repo <owner/name>  Repository to report on
  --since <days>d      How far back to report (default: 7d)
  --workflow <name>    Only include this workflow
  --job <name>         Compare one job's steps across runner types
  --by labels|runner   Group by the labels jobs asked for (default), or by runner name
                       without its trailing numbers, which tells launchers apart
  --offline            Report from the local log without calling GitHub
  --help               Show this message`;

async function main() {
  // The server's commands take their own options, so they're handed over before parsing ours.
  const args = process.argv.slice(2);
  if (SERVER_COMMANDS.includes(args[0] ?? "")) {
    const { runServerCommand } = await import("../apps/server/src/commands.ts");
    return runServerCommand(args);
  }
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string" },
      out: { type: "string" },
      repo: { type: "string" },
      since: { type: "string", default: "7d" },
      workflow: { type: "string" },
      job: { type: "string" },
      offline: { type: "boolean", default: false },
      by: { type: "string", default: "labels" },
      redact: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      print: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
    },
  });

  if (values.help) return console.log(USAGE);
  // The version is the first word, since an update reads it to check that a download runs here.
  if (values.version) return console.log(releaseRepository === null ? serverPackage.version : `${serverPackage.version} (releases from ${releaseRepository})`);

  if (positionals[0] === "up" && positionals.length === 1 && values.config) {
    return startRunners(values.config);
  }

  if (positionals[0] === "setup" && positionals[1] === "check" && positionals.length === 2) {
    const steps = await checkMachine(createLocalProbe());
    return console.log(values.json ? JSON.stringify({ ready: isReady(steps), steps }) : formatSetup(steps));
  }

  if (positionals[0] === "setup" && positionals[1] === "fix" && positionals.length === 3) {
    const id = positionals[2] ?? "";
    if (!isFixId(id)) throw new Error(`No fix called "${id}". Fixes: ${Object.keys(FIXES).join(", ")}.`);
    const probe = createLocalProbe();
    if (values.print) return process.stdout.write(fixScript(id, probe.user));
    console.error(`${FIXES[id].title}, as root.`);
    const code = await runFix({ id, user: probe.user, input: process.stdin });
    if (code !== 0) {
      process.exitCode = code;
      return console.error(`The fix stopped with exit code ${code}. Nothing after the failed command ran.`);
    }
    return console.log(formatSetup(await checkMachine(probe)));
  }

  if (positionals[0] === "vm" && positionals[1] === "render" && positionals.length === 2 && values.config && values.out) {
    const written = await renderVm(await loadVmConfig(values.config), values.out);
    return console.log(`Wrote ${written.join(", ")} to ${values.out}. Review create.sh, then run it on the host.`);
  }

  if (positionals[0] === "host" && positionals[1] === "render" && positionals.length === 2 && values.config && values.out) {
    const config = await loadLauncherConfig(values.config);
    if (!("host" in config)) throw new Error(`${values.config} has no "host", so its jobs run in a VM. Use vm render.`);
    const written = await renderHost(config, values.out);
    return console.log(`Wrote ${written.join(", ")} to ${values.out}. Review setup.sh and run-job, then run: sudo ${values.out}/setup.sh`);
  }

  const { repo, since: sinceArg, workflow, job, offline, by } = values;
  const command = positionals[0];
  const days = /^(\d+)d$/.exec(sinceArg)?.[1];
  if (
    (command !== "report" && command !== "summary") ||
    positionals.length !== 1 ||
    !repo ||
    !REPO_NAME.test(repo) ||
    !days ||
    (by !== "labels" && by !== "runner")
  ) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  const until = new Date();
  const since = new Date(until.getTime() - Number(days) * DAY_MS);
  const store = createJobLog(defaultLogPath(repo));

  // A summary reads only what's already recorded, so it can run from a timer without a token.
  if (!offline && command === "report") {
    console.error(`Syncing ${repo} since ${since.toISOString().slice(0, 10)}...`);
    const source = createGitHubClient(resolveToken());
    const onRunSynced = (added: number) => {
      if (process.stderr.isTTY) process.stderr.write(`\r${added} jobs added`);
    };
    const added = await syncJobs({ repo, since, until, source, store, onRunSynced });
    if (process.stderr.isTTY) process.stderr.write("\n");
    console.error(`Added ${added} jobs to ${store.path}`);
  }

  const records = (await store.read()).filter(
    (record) =>
      Date.parse(record.createdAt) >= since.getTime() && (workflow === undefined || record.workflow === workflow),
  );

  if (command === "summary") {
    const dir = stateDir();
    const inWindow = (time: string) => Date.parse(time) >= since.getTime();
    const samples = (await readSamples(dir)).filter(({ sample }) => inWindow(sample.time));
    const events = (await readInstallLogs(dir, "events.ndjson", LauncherEventRecord)).filter(({ record }) =>
      inWindow(record.startedAt),
    );
    const summary = {
      repo,
      since,
      until,
      jobs: summarizeJobs(records, { by, machine: machineDuringJobs(samples) }),
      launcher: summarizeLauncher(events),
      machines: summarizeMachines(samples),
    };
    const redact = values.redact ? createRedactor(await loadRedactionKey(dir)) : undefined;
    return console.log(formatWeeklySummary(redact ? redactSummary(summary, redact) : summary));
  }

  if (!job) {
    // Samples exist only where `up` runs, so elsewhere the report has no machine columns.
    const machine = machineDuringJobs(await readSamples(stateDir()));
    return console.log(formatSummary(summarizeJobs(records, { by, machine })));
  }

  const workflows = new Set(records.filter((record) => record.job === job).map((record) => record.workflow));
  if (workflows.size > 1) {
    throw new Error(`Job "${job}" is in ${workflows.size} workflows. Pick one with --workflow.`);
  }
  console.log(formatStepComparison(compareSteps(records, job, by)));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  // Exit outright. Other slots may still be looping, and a service manager needs to restart them.
  process.exit(1);
});
