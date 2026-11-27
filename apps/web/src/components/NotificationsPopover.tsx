import { useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { useInboxEverywhere } from "../hooks/useInboxEverywhere.ts";
import { InboxList } from "./inbox/InboxList.tsx";
import { Popover, PopoverPopup } from "./ui/popover.tsx";

// The notification open in full, if any: the list marks it.
export const openNotificationId = (path: string) => (path.startsWith("/inbox/") ? decodeURIComponent(path.slice("/inbox/".length)) : undefined);

// Asked only while the list is open, so a closed trigger costs no more than its count.
function Notifications({ selectedId }: { selectedId: string | undefined }) {
  const { machines, rows } = useInboxEverywhere();
  return (
    <div className="max-h-[70vh] w-80 max-w-full overflow-y-auto">
      <InboxList rows={rows} machines={machines} selectedId={selectedId} />
    </div>
  );
}

// What's wrong and what could be faster, as a list that opens over the page rather than a page of
// its own. `children` holds the PopoverTrigger. Picking one opens it in full and closes the list.
export function NotificationsPopover({ side, children }: { side: "right" | "top"; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (state) => state.location.pathname });
  // Closing on a route change is synchronizing with the router: a picked row has done its job.
  useEffect(() => setOpen(false), [path]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {children}
      <PopoverPopup side={side} align="end" padding="none">
        {open ? <Notifications selectedId={openNotificationId(path)} /> : null}
      </PopoverPopup>
    </Popover>
  );
}
