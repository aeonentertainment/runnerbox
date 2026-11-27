import type { MemoryRule } from "@runnerbox/contracts";
import { X } from "lucide-react";
import { useState } from "react";
import { PageBar } from "../components/PageBar.tsx";
import { PageBody } from "../components/PageBody.tsx";
import { SettingsRow, SettingsSection } from "../components/settings/settingsLayout.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { useActiveEnvironment } from "../hooks/useEnvironment.ts";
import { useReviewMemory } from "../hooks/useReviewMemory.ts";
import { useReviews } from "../hooks/useReviews.ts";

const words = (cause: unknown) => (cause instanceof Error ? cause.message : "That didn't work.");

function AddRule({ onAdd }: { onAdd: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const add = () => {
    if (text.trim() === "") return;
    void onAdd(text.trim()).then(() => setText(""));
  };
  return (
    <form
      className="flex gap-2 px-3 py-3 sm:px-4"
      onSubmit={(event) => {
        event.preventDefault();
        add();
      }}
    >
      <Input size="sm" value={text} maxLength={500} placeholder="Generated files under gen/ are fine." aria-label="A rule for this repository's reviewer" onChange={(event) => setText(event.target.value)} />
      <Button type="submit" size="sm" variant="outline" disabled={text.trim() === ""}>
        Add
      </Button>
    </form>
  );
}

function Rule({ rule, canChange, onForget }: { rule: MemoryRule; canChange: boolean; onForget: () => void }) {
  return (
    <SettingsRow
      title={<span className="font-normal">{rule.text}</span>}
      description={`Added ${new Date(rule.addedAt).toLocaleDateString()}`}
      control={
        canChange ? (
          <Button size="icon-sm" variant="ghost-muted" aria-label="Remove this rule" onClick={onForget}>
            <X />
          </Button>
        ) : null
      }
    />
  );
}

// What each repository's reviewer always keeps in mind: rules the owner wrote, and findings the
// owner said weren't problems. Every review of the repository is told them.
export function MemoryPage() {
  const environmentId = useActiveEnvironment().environment?.environmentId ?? "";
  const { view } = useReviews();
  const { available, memory, remember, forget } = useReviewMemory(environmentId);
  const [error, setError] = useState<string | null>(null);
  const bar = <PageBar title="Memory" />;
  if (!available) {
    return (
      <>
        {bar}
        <PageBody>
          <p className="text-muted-foreground">This server is older than review memory. Update it under Settings, About.</p>
        </PageBody>
      </>
    );
  }
  if (memory === null || view === null) return bar;
  const act = (work: Promise<void>) => {
    setError(null);
    return work.catch((cause: unknown) => setError(words(cause)));
  };
  const repos = [...new Set([...view.repos.filter((repo) => repo.review).map((repo) => repo.repo), ...memory.map((each) => each.repo)])].toSorted();
  return (
    <>
      {bar}
      <PageBody className="gap-8">
        <p className="text-muted-foreground">
          Rules every review of a repository follows. Add your own, or press "Not a problem" on a finding to keep it from being reported again.
        </p>
        {error ? <p className="text-destructive">{error}</p> : null}
        {repos.length === 0 ? <p className="text-muted-foreground">Turn reviews on for a repository under Settings, Reviews.</p> : null}
        {repos.map((repo) => {
          const rules = memory.find((each) => each.repo === repo)?.rules ?? [];
          return (
            <SettingsSection key={repo} title={repo}>
              {rules.map((rule) => (
                <Rule key={rule.id} rule={rule} canChange={view.canConfigure} onForget={() => void act(forget(repo, rule.id))} />
              ))}
              {rules.length === 0 ? <SettingsRow title={<span className="font-normal text-muted-foreground">No rules yet.</span>} /> : null}
              {view.canConfigure ? <AddRule onAdd={(text) => act(remember(repo, text))} /> : null}
            </SettingsSection>
          );
        })}
      </PageBody>
    </>
  );
}
