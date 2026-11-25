import { useParams } from "@tanstack/react-router";
import { CustomSnoozeDialogHost } from "../components/inbox/CustomSnoozeDialog.tsx";
import { InboxItemView } from "../components/inbox/InboxItemView.tsx";
import { PageBar } from "../components/PageBar.tsx";
import { RangeMenu } from "../components/RangeMenu.tsx";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty.tsx";
import { useActiveEnvironment } from "../hooks/useEnvironment.ts";
import { useInboxEverywhere } from "../hooks/useInboxEverywhere.ts";
import { useInboxWrites } from "../hooks/useInboxWrites.ts";
import { findRow } from "../lib/inboxRows.ts";

// One notification in full, from any connected machine. The list they're picked from is the
// sidebar's Notifications row; with none picked, the costliest is shown.
export function NotificationPage() {
  const { itemId } = useParams({ strict: false });
  const { machines, rows, loaded } = useInboxEverywhere();
  const writes = useInboxWrites(machines);
  const activeId = useActiveEnvironment().environment?.environmentId;
  const shownId = itemId ?? rows.needsYou[0]?.id;
  const shown = shownId === undefined ? undefined : findRow(rows.all, shownId, activeId);
  const bar = (
    <PageBar title={shown?.item.title ?? "Notifications"} trail={shown ? ["Notifications"] : []}>
      <RangeMenu />
    </PageBar>
  );
  if (!loaded) return bar;
  // The inbox also reads launcher events and live runner state, so a machine with no job log can
  // still have something that needs the owner, such as a slot that keeps failing.
  const empty = machines.every((machine) => !machine.inbox || (machine.inbox.summary.jobs === 0 && machine.inbox.items.length === 0 && machine.inbox.quiet.length === 0));
  if (empty && rows.reviews.length === 0) {
    return (
      <>
        {bar}
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No job history yet</EmptyTitle>
            <EmptyDescription>
              Run <code className="font-mono text-foreground">runnerbox report --repo owner/name</code> on a server's machine to sync one.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    );
  }
  return (
    <>
      {bar}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {shown ? (
            <InboxItemView row={shown} machines={machines} writes={writes} />
          ) : itemId ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>This notification is gone</EmptyTitle>
                <EmptyDescription>It may have been fixed, or fallen outside the time range.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Nothing is wrong</EmptyTitle>
                <EmptyDescription>A notification shows here when a job, a runner or a wait needs a look.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
        <CustomSnoozeDialogHost />
      </div>
    </>
  );
}
