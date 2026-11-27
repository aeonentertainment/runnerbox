import { patternsFromText, patternsText, type ReviewRules, type ReviewStrictness } from "@runnerbox/contracts";
import { useState } from "react";
import { DraftInput } from "../ui/draft-input.tsx";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select.tsx";
import { Switch } from "../ui/switch.tsx";
import { Textarea } from "../ui/textarea.tsx";
import { SettingsRow, SettingsSection } from "./settingsLayout.tsx";

const STRICTNESS: Record<ReviewStrictness, string> = { low: "Low", medium: "Medium", high: "High" };

const LISTS = [
  { key: "skipAuthors", title: "Skip these authors", description: "GitHub logins. Bots are always skipped.", placeholder: "someone, renovate[bot]" },
  { key: "skipTitles", title: "Skip if the title contains", description: undefined, placeholder: "wip, do not review" },
  { key: "skipLabels", title: "Skip with these labels", description: undefined, placeholder: "do-not-review" },
  { key: "ignoreFiles", title: "Ignore files", description: "Same syntax as .gitignore. Also applies when you press Review.", placeholder: "dist/, *.snap" },
] as const satisfies ReadonlyArray<{ key: keyof ReviewRules; title: string; description: string | undefined; placeholder: string }>;

function Instructions({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (next: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Textarea
      value={draft ?? value}
      disabled={disabled}
      maxLength={2000}
      placeholder="Be brief. The project uses Effect."
      aria-label="Extra instructions for the reviewer"
      onFocus={() => setDraft(value)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft ?? value;
        setDraft(null);
        if (next !== value) onCommit(next);
      }}
    />
  );
}

// Which pull requests are reviewed unasked, which files are left out, and what the reviewer reports.
export function ReviewRulesSections({ rules, disabled, onChange }: { rules: ReviewRules; disabled: boolean; onChange: (next: ReviewRules) => void }) {
  const set = (changed: Partial<ReviewRules>) => onChange({ ...rules, ...changed });
  return (
    <>
      <SettingsSection title="When to review">
        <SettingsRow title="On every push" description="Review again when new commits land. Off, only a pull request's first commit is reviewed on its own." control={<Switch checked={rules.onPush} disabled={disabled} onCheckedChange={(onPush) => set({ onPush })} aria-label="Review on every push" />} />
        <SettingsRow title="Draft pull requests" control={<Switch checked={rules.drafts} disabled={disabled} onCheckedChange={(drafts) => set({ drafts })} aria-label="Review drafts" />} />
      </SettingsSection>
      <SettingsSection title="Which pull requests">
        {LISTS.map(({ key, title, description, placeholder }) => (
          <SettingsRow
            key={key}
            title={title}
            description={description}
            control={<DraftInput className="w-64" size="sm" value={patternsText(rules[key])} placeholder={placeholder} disabled={disabled} aria-label={title} onCommit={(text) => set({ [key]: patternsFromText(text) })} />}
          />
        ))}
      </SettingsSection>
      <SettingsSection title="Comments">
        <SettingsRow
          title="Strictness"
          description="Low reports narrow problems too. High reports only what should be fixed before merging."
          control={
            <Select value={rules.strictness} disabled={disabled} onValueChange={(strictness) => strictness && set({ strictness })}>
              <SelectTrigger className="w-32" aria-label="Strictness">
                <SelectValue>{(value: ReviewStrictness) => STRICTNESS[value]}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {Object.entries(STRICTNESS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow title="On the changed lines" description="When a review is posted, each finding is also left on the lines it points at, once per pull request." control={<Switch checked={rules.inline} disabled={disabled} onCheckedChange={(inline) => set({ inline })} aria-label="Leave findings on the changed lines" />} />
        <SettingsRow title="Status check" description="When a review is posted, its commit gets a RunnerBox review check: pending while it runs, failing while there's something to fix before merging. Needs the App's Commit statuses permission." control={<Switch checked={rules.status} disabled={disabled} onCheckedChange={(status) => set({ status })} aria-label="Set a status check on the commit" />} />
        <SettingsRow title="Extra instructions" description="Told to the reviewer on every review.">
          <div className="pb-3">
            <Instructions value={rules.instructions} disabled={disabled} onCommit={(instructions) => set({ instructions })} />
          </div>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
