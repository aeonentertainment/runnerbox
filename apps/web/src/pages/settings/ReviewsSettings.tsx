import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ReviewRulesSections } from "../../components/settings/ReviewRulesSections.tsx";
import { SettingsIntro } from "../../components/settings/SettingsIntro.tsx";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "../../components/settings/settingsLayout.tsx";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../../components/ui/select.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import { useReviews } from "../../hooks/useReviews.ts";
import type { RootSearch } from "../../lib/search.ts";

const link = "text-foreground underline-offset-4 hover:underline";
const words = (cause: unknown) => (cause instanceof Error ? cause.message : "That didn't work.");

// Reviews: which repositories are read, whether their reviews are posted on the pull request, and
// the model that reviews. The sign-in they read through is GitHub's page.
export function ReviewsSettings() {
  const { view, available, posting, rulesAvailable, setRepo, setPost, setModel, setRules } = useReviews();
  const [error, setError] = useState<string | null>(null);
  if (!available) return <SettingsPageContainer><SettingsIntro>This server is older than reviews. Update it under About.</SettingsIntro></SettingsPageContainer>;
  if (view === null) return null;
  const act = (work: Promise<void>) => {
    setError(null);
    work.catch((cause: unknown) => setError(words(cause)));
  };
  const { app, canConfigure } = view;
  return (
    <SettingsPageContainer>
      <SettingsIntro>
        Runnerbox reads the open pull requests on the repositories you turn on, through the server's sign-in to GitHub. A pull request opened after that is reviewed on its own, and again on every push once it's quiet for a minute, unless the rules below skip it. Bots' and forks' are left for you to ask. Findings show under Pull requests, and on the pull request itself where you turn that on below.
      </SettingsIntro>
      {app === null ? (
        <SettingsIntro>
          The server isn't signed in to GitHub. Sign in under{" "}
          <Link to="/settings/github" search={(previous: RootSearch) => previous} className={link}>
            Settings, GitHub
          </Link>
          .
        </SettingsIntro>
      ) : (
        <>
          <SettingsSection title="Repositories">
            {view.repos.map(({ repo, review }) => (
              <SettingsRow key={repo} title={repo} control={<Switch checked={review} disabled={!canConfigure} onCheckedChange={(next) => act(setRepo(repo, next))} aria-label={`Review ${repo}`} />} />
            ))}
            {view.repos.length === 0 ? (
              <SettingsRow
                title={`${app.name} isn't installed on a repository yet`}
                description={view.problem ?? undefined}
                control={
                  <Link to="/settings/github" search={(previous: RootSearch) => previous} className={link}>
                    Settings, GitHub
                  </Link>
                }
              />
            ) : null}
            {error ? <p className="px-3 py-3 text-destructive text-xs sm:px-4">{error}</p> : null}
          </SettingsSection>
          {/* Only the repositories being reviewed can post, and only a server that knows how. */}
          {posting && view.repos.some(({ review }) => review) ? (
            <SettingsSection title="Post on the pull request">
              {view.repos
                .filter(({ review }) => review)
                .map(({ repo, post }) => (
                  <SettingsRow
                    key={repo}
                    title={repo}
                    description="Off, a review stays in RunnerBox. On, a finished review is left on the pull request as one comment, under your GitHub name, ending with “Posted by RunnerBox”. The next review rewrites it."
                    control={<Switch checked={post === true} disabled={!canConfigure} onCheckedChange={(next) => act(setPost(repo, next))} aria-label={`Post reviews on ${repo}`} />}
                  />
                ))}
            </SettingsSection>
          ) : null}
          {rulesAvailable && view.rules !== undefined ? <ReviewRulesSections rules={view.rules} disabled={!canConfigure} onChange={(next) => act(setRules(next))} /> : null}
          {view.models !== undefined && view.model !== undefined ? (
            <SettingsSection title="Reviewer">
              <SettingsRow
                title="Model"
                description="Reviews run on your Claude account, one at a time, and at most 40 a day start on their own."
                control={
                  <Select value={view.model} disabled={!canConfigure} onValueChange={(value) => value && act(setModel(value))}>
                    <SelectTrigger className="w-32" aria-label="Review model">
                      <SelectValue>{() => view.models?.find((each) => each.id === view.model)?.label ?? view.model}</SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                      {view.models.map((each) => (
                        <SelectItem key={each.id} value={each.id}>
                          {each.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                }
              />
            </SettingsSection>
          ) : null}
        </>
      )}
    </SettingsPageContainer>
  );
}
