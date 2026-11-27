import { SettingsPageContainer, SettingsRow, SettingsSection } from "../../components/settings/settingsLayout.tsx";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../../components/ui/select.tsx";
import { setTheme, THEMES, type Theme, useTheme } from "../../hooks/useTheme.ts";

const isTheme = (value: string | null): value is Theme => THEMES.some(([theme]) => theme === value);

// How the app looks in this browser, as T3 Code's Appearance page starts: the theme.
export function AppearanceSettings() {
  const theme = useTheme();
  return (
    <SettingsPageContainer>
      <SettingsSection title="Theme">
        <SettingsRow
          title="Appearance"
          description="Kept in this browser or app, not on the server."
          control={
            <Select value={theme} onValueChange={(next) => isTheme(next) && setTheme(next)}>
              <SelectTrigger className="w-44" aria-label="Theme">
                <SelectValue>{(picked: Theme) => THEMES.find(([value]) => value === picked)?.[1]}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {THEMES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
