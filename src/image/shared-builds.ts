// Runs one build per tag at a time. Kinds that share a build context get the same tag, so the
// second kind to ask waits on the first kind's build instead of starting its own.
export function createSharedBuilds() {
  const inFlight = new Map<string, Promise<boolean>>();
  return (tag: string, build: () => Promise<boolean>) => {
    const running = inFlight.get(tag);
    if (running) return running;
    const started = build().finally(() => inFlight.delete(tag));
    inFlight.set(tag, started);
    return started;
  };
}
