import { X } from "lucide-react";
import { useState } from "react";
import { AlertLink } from "../../components/AlertLink.tsx";
import { AddAlertRule } from "../../components/settings/AddAlertRule.tsx";
import { SettingsIntro } from "../../components/settings/SettingsIntro.tsx";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "../../components/settings/settingsLayout.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import { useAlerts } from "../../hooks/useAlerts.ts";
import { ruleWords } from "../../lib/alertWords.ts";
import { formatAge } from "../../lib/format.ts";

// Rules about CI and reviews, checked every minute on the server, and what they fired.
export function AlertsSettings() {
  const { available, view, setRules } = useAlerts();
  const [error, setError] = useState<string | null>(null);
  if (!available) return <SettingsPageContainer><SettingsIntro>This server is older than alerts. Update it under About.</SettingsIntro></SettingsPageContainer>;
  if (view === null) return null;
  const save = (rules: Parameters<typeof setRules>[0]) => {
    setError(null);
    setRules(rules).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "That didn't work."));
  };
  return (
    <SettingsPageContainer>
      <SettingsIntro>The server checks these every minute, against jobs as they finish and reviews as they end. A fired alert shows under Notifications, and is kept here.</SettingsIntro>
      <SettingsSection title="Rules">
        {view.rules.map((rule) => (
          <SettingsRow
            key={rule.id}
            title={<span className="font-normal">{ruleWords(rule)}</span>}
            control={
              <span className="flex items-center gap-2">
                <Switch checked={rule.enabled} disabled={!view.canConfigure} aria-label={`${ruleWords(rule)}, on`} onCheckedChange={(enabled) => save(view.rules.map((each) => (each.id === rule.id ? { ...each, enabled } : each)))} />
                {view.canConfigure ? (
                  <Button size="icon-sm" variant="ghost-muted" aria-label="Remove this rule" onClick={() => save(view.rules.filter((each) => each.id !== rule.id))}>
                    <X />
                  </Button>
                ) : null}
              </span>
            }
          />
        ))}
        {view.rules.length === 0 ? <SettingsRow title={<span className="font-normal text-muted-foreground">No rules yet.</span>} /> : null}
        {view.canConfigure ? <AddAlertRule onAdd={(rule) => save([...view.rules, rule])} /> : null}
        {error ? <p className="px-3 pb-3 text-destructive text-xs sm:px-4">{error}</p> : null}
      </SettingsSection>
      <SettingsSection title="Fired recently">
        {view.fired.length === 0 ? <SettingsRow title={<span className="font-normal text-muted-foreground">Nothing yet.</span>} /> : null}
        {view.fired.slice(0, 30).map((alert) => (
          <SettingsRow key={alert.id} title={<AlertLink alert={alert} className="font-normal hover:underline" />} control={<span className="text-muted-foreground text-xs">{formatAge(alert.at)} ago</span>} />
        ))}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
