import { useRouterState } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useInboxEverywhere } from "../hooks/useInboxEverywhere.ts";
import { cn } from "../lib/utils.ts";
import { InboxList } from "./inbox/InboxList.tsx";
import { railFade } from "./railFade.ts";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover.tsx";
import { SidebarMenuButton, SidebarMenuItem } from "./ui/sidebar.tsx";

// Asked only while the list is open, so a closed row costs no more than its count.
function Notifications({ selectedId }: { selectedId: string | undefined }) {
  const { machines, rows } = useInboxEverywhere();
  return (
    <div className="max-h-[70vh] w-80 max-w-full overflow-y-auto">
      <InboxList rows={rows} machines={machines} selectedId={selectedId} />
    </div>
  );
}

// The sidebar's Notifications row: what's wrong and what could be faster, as a list that opens over
// the page rather than a page of its own. Picking one opens it in full and closes the list.
export function NotificationsRow({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (state) => state.location.pathname });
  const selectedId = path.startsWith("/inbox/") ? decodeURIComponent(path.slice("/inbox/".length)) : undefined;
  // Closing on a route change is synchronizing with the router: a picked row has done its job.
  useEffect(() => setOpen(false), [path]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <SidebarMenuButton isActive={path === "/inbox" || selectedId !== undefined} tooltip="Notifications" render={<PopoverTrigger />}>
          <Bell />
          <span className={railFade}>Notifications</span>
        </SidebarMenuButton>
        {count > 0 ? <span className={cn("pointer-events-none absolute top-1.5 right-2 text-muted-foreground text-xs tabular-nums", railFade)}>{count}</span> : null}
        {count > 0 ? <span className="pointer-events-none absolute top-1.5 left-5 hidden size-1.5 rounded-full bg-destructive group-data-[collapsible=icon]:block" /> : null}
      </SidebarMenuItem>
      <PopoverPopup side="right" align="end" padding="none">
        {open ? <Notifications selectedId={selectedId} /> : null}
      </PopoverPopup>
    </Popover>
  );
}
