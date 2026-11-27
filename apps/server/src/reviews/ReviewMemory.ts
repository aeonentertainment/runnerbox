import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { MAX_MEMORY_RULES, MemoryRule, type RepoMemory, ReviewError } from "@runnerbox/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { writeFileAtomic } from "../config/atomicWrite.ts";
import * as ServerPaths from "../config/ServerPaths.ts";

// Each repository's rules for its reviewer, in `.server/review-memory.json`.
const MemoryFile = Schema.Struct({ v: Schema.Literal(1), repos: Schema.Record(Schema.String, Schema.Array(MemoryRule)) });
type MemoryFile = typeof MemoryFile.Type;
const decodeFile = Schema.decodeUnknownEffect(Schema.fromJsonString(MemoryFile));
const NONE: MemoryFile = { v: 1, repos: {} };

export class ReviewMemory extends Context.Service<
  ReviewMemory,
  {
    readonly all: Effect.Effect<ReadonlyArray<RepoMemory>, ReviewError>;
    // The rules a review of `repo` is told, oldest first.
    readonly rulesOf: (repo: string) => Effect.Effect<ReadonlyArray<string>, ReviewError>;
    readonly remember: (repo: string, text: string) => Effect.Effect<ReadonlyArray<RepoMemory>, ReviewError>;
    readonly forget: (repo: string, id: string) => Effect.Effect<ReadonlyArray<RepoMemory>, ReviewError>;
  }
>()("runnerbox/server/reviews/ReviewMemory") {}

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const { serverDir } = yield* ServerPaths.ServerPaths;
  const path = join(serverDir, "review-memory.json");
  const unreadable = () => new ReviewError({ reason: "unreadable" });
  const lock = yield* Semaphore.make(1);

  const read = fs.readFileString(path).pipe(
    Effect.map(Option.some),
    Effect.catchTag("PlatformError", (error) => (error.reason._tag === "NotFound" ? Effect.succeed(Option.none<string>()) : Effect.fail(error))),
    Effect.flatMap((text) => (Option.isSome(text) ? decodeFile(text.value) : Effect.succeed(NONE))),
    Effect.mapError(unreadable),
  );
  const write = (file: MemoryFile) =>
    fs.makeDirectory(serverDir, { recursive: true, mode: 0o700 }).pipe(Effect.andThen(writeFileAtomic(fs, path, `${JSON.stringify(file, null, 2)}\n`)), Effect.mapError(unreadable));
  const listed = (file: MemoryFile): ReadonlyArray<RepoMemory> =>
    Object.entries(file.repos)
      .filter(([, rules]) => rules.length > 0)
      .map(([repo, rules]) => ({ repo, rules }))
      .toSorted((a, b) => a.repo.localeCompare(b.repo));
  const change = (update: (file: MemoryFile) => Effect.Effect<MemoryFile, ReviewError>) =>
    lock.withPermits(1)(read.pipe(Effect.flatMap(update), Effect.tap(write), Effect.map(listed)));

  const remember = Effect.fn("ReviewMemory.remember")(function* (repo: string, text: string) {
    const addedAt = new Date(yield* Clock.currentTimeMillis).toISOString();
    return yield* change((file) => {
      const rules = file.repos[repo] ?? [];
      if (rules.length >= MAX_MEMORY_RULES) return Effect.fail(new ReviewError({ reason: "memory_full" }));
      return Effect.succeed({ ...file, repos: { ...file.repos, [repo]: [...rules, { id: randomUUID(), text: text.trim(), addedAt }] } });
    });
  });

  const forget = Effect.fn("ReviewMemory.forget")(function* (repo: string, id: string) {
    return yield* change((file) => Effect.succeed({ ...file, repos: { ...file.repos, [repo]: (file.repos[repo] ?? []).filter((rule) => rule.id !== id) } }));
  });

  return ReviewMemory.of({
    all: read.pipe(Effect.map(listed)),
    rulesOf: (repo) => read.pipe(Effect.map((file) => (file.repos[repo] ?? []).map((rule) => rule.text))),
    remember,
    forget,
  });
});

export const layer = Layer.effect(ReviewMemory, make);
