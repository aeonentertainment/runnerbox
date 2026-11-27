import { useRouterState } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { NotificationsPopover, openNotificationId } from "./NotificationsPopover.tsx";
import { PopoverTrigger } from "./ui/popover.tsx";
import { SidebarMenuButton, SidebarMenuItem } from "./ui/sidebar.tsx";

// The rail's Notifications button, with a dot while something is waiting.
export function NotificationsRow({ count }: { count: number }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  return (
    <NotificationsPopover side="right">
      <SidebarMenuItem>
        <SidebarMenuButton isActive={path === "/inbox" || openNotificationId(path) !== undefined} tooltip="Notifications" render={<PopoverTrigger />}>
          <Bell />
          <span className="sr-only">Notifications</span>
        </SidebarMenuButton>
        {count > 0 ? <span className="pointer-events-none absolute top-1.5 left-5 size-1.5 rounded-full bg-destructive" /> : null}
      </SidebarMenuItem>
    </NotificationsPopover>
  );
}
