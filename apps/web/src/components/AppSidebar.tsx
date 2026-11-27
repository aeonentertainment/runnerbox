import { Link, useRouterState } from "@tanstack/react-router";
import { MessageSquareText, Settings } from "lucide-react";
import { useAtom } from "@effect/atom-react";
import { useServerCapabilities } from "../hooks/useServerCapabilities.ts";
import { useWaitingCount } from "../hooks/useWaitingCount.ts";
import { isOpen, type Product, PRODUCTS } from "../lib/products.ts";
import type { RootSearch } from "../lib/search.ts";
import { chatDockOpenAtom } from "../state/chatDock.ts";
import { useChatDockAvailable } from "./ChatDock.tsx";
import { EnvironmentMenu } from "./EnvironmentMenu.tsx";
import { NotificationsRow } from "./NotificationsRow.tsx";
import { SidebarUpdateSlot } from "./SidebarUpdateSlot.tsx";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "./ui/sidebar.tsx";

const keep = (previous: RootSearch) => previous;

// One product: its icon, opening its first page. Its pages are the tabs in the page's bar.
function ProductRow({ product, path }: { product: Product; path: string }) {
  const { label, icon: Icon, pages } = PRODUCTS[product];
  const open = pages.some((page) => isOpen(page.to, path));
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={open} tooltip={label} render={<Link to={pages[0].to} search={keep} />}>
        <Icon />
        <span className="sr-only">{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// Opens and closes the docked chat. A button, not a page: the chat sits beside whichever page is open.
function ChatRow() {
  const [open, setOpen] = useAtom(chatDockOpenAtom);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={open} tooltip="Chat (⌘J)" onClick={() => setOpen(!open)}>
        <MessageSquareText />
        <span className="sr-only">Chat</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// The rail down the window's left edge, as Linear's or VS Code's: the environment, the two
// products, then what works on any page. It never widens, so every page keeps the width.
export function AppSidebar() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const waiting = useWaitingCount();
  const { reviews } = useServerCapabilities();
  const chat = useChatDockAvailable();
  return (
    // A raised surface with no border, like Codex's.
    <Sidebar aria-label="Navigation" collapsible="icon" className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <EnvironmentMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <ProductRow product="ci" path={path} />
            {/* A server older than reviews has one product. */}
            {reviews ? <ProductRow product="review" path={path} /> : null}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {/* Left out where the dock would be empty: a page with no thread, on a server older than the chat. */}
          {chat ? <ChatRow /> : null}
          <NotificationsRow count={waiting} />
          <SidebarMenuItem>
            <SidebarMenuButton isActive={path.startsWith("/settings")} tooltip="Settings" render={<Link to="/settings" search={keep} />}>
              <Settings />
              <span className="sr-only">Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarUpdateSlot />
      </SidebarFooter>
    </Sidebar>
  );
}
