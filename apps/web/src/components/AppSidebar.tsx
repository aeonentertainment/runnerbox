import { isInboxItemHidden } from "@runnerbox/contracts";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Gauge, GitPullRequest, LayoutDashboard, ListTree, MessageSquareText, Server, Settings } from "lucide-react";
import type * as React from "react";
import { useRange } from "../hooks/useRange.ts";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { chatDockOpenAtom } from "../state/chatDock.ts";
import { inboxesAtom } from "../state/inbox.ts";
import { runnerStateEverywhereAtom } from "../state/runnerMachines.ts";
import { useServerCapabilities } from "../hooks/useServerCapabilities.ts";
import { useSidebarShortcut } from "../hooks/useSidebarShortcut.ts";
import { needsYouEverywhere } from "../lib/needsYouEverywhere.ts";
import type { RootSearch } from "../lib/search.ts";
import { cn } from "../lib/utils.ts";
import { EnvironmentMenu } from "./EnvironmentMenu.tsx";
import { railFade } from "./railFade.ts";
import { useChatDockAvailable } from "./ChatDock.tsx";
import { NotificationsRow } from "./NotificationsRow.tsx";
import { SidebarUpdateSlot } from "./SidebarUpdateSlot.tsx";
import { Kbd } from "./ui/kbd.tsx";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "./ui/sidebar.tsx";
import { Toggle, ToggleGroup } from "./ui/toggle-group.tsx";

const keep = (previous: RootSearch) => previous;

// The app is two products in one window. The open page says which one is showing.
type Product = "ci" | "review";
const productOf = (path: string): Product => (path === "/pulls" || path.startsWith("/pulls/") ? "review" : "ci");
const PRODUCT_HOME = { ci: "/", review: "/pulls" } as const;

type Page = { readonly to: "/" | "/runs" | "/pulls" | "/speed" | "/runners" | "/settings"; readonly label: string; readonly icon: React.ComponentType; readonly count?: string | null; readonly alert?: boolean };

// One row per page, as in Codex: an icon, its name and a count. The pages' own lists live on the
// pages. Collapsed to its rail, a row keeps its icon, a tooltip and, for Inbox, a dot.
function PageRow({ page, path }: { page: Page; path: string }) {
  const Icon = page.icon;
  // Overview, at "/", is active only there.
  const active = path === page.to || (page.to !== "/" && path.startsWith(`${page.to}/`));
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={active} tooltip={page.label} render={<Link to={page.to} search={keep} />}>
        <Icon />
        <span className={railFade}>{page.label}</span>
      </SidebarMenuButton>
      {page.count ? <span className={cn("pointer-events-none absolute top-1.5 right-2 text-muted-foreground text-xs tabular-nums", railFade)}>{page.count}</span> : null}
      {page.alert ? <span className="pointer-events-none absolute top-1.5 left-5 hidden size-1.5 rounded-full bg-destructive group-data-[collapsible=icon]:block" /> : null}
    </SidebarMenuItem>
  );
}

// T3 Code's segmented control, switching the sidebar between the two products' pages. It goes with
// the labels when the sidebar narrows to its rail, where every page's icon shows instead.
function ProductSwitch({ product }: { product: Product }) {
  const navigate = useNavigate();
  return (
    <ToggleGroup
      aria-label="Product"
      className={cn("w-full group-data-[collapsible=icon]:hidden", railFade)}
      value={[product]}
      // Pressing the open product again would clear the group; there's always one showing.
      onValueChange={([next]) => (next === "ci" || next === "review" ? void navigate({ to: PRODUCT_HOME[next], search: keep }) : undefined)}
    >
      <Toggle className="flex-1" value="ci">
        CI
      </Toggle>
      <Toggle className="flex-1" value="review">
        Code Review
      </Toggle>
    </ToggleGroup>
  );
}

// Opens and closes the docked chat. A button, not a page: the chat sits beside whichever page is open.
function ChatRow() {
  const [open, setOpen] = useAtom(chatDockOpenAtom);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={open} tooltip="Chat" onClick={() => setOpen(!open)}>
        <MessageSquareText />
        <span className={railFade}>Chat</span>
      </SidebarMenuButton>
      <Kbd className={cn("pointer-events-none absolute top-1.5 right-2", railFade)}>⌘J</Kbd>
    </SidebarMenuItem>
  );
}

// The counts cover every connected machine, not only the one picked in the switcher.
export function AppSidebar() {
  useSidebarShortcut();
  const { days } = useRange();
  const inboxes = useAtomValue(inboxesAtom(days));
  const path = useRouterState({ select: (state) => state.location.pathname });
  const machines = useAtomValue(runnerStateEverywhereAtom);
  const slots = [...machines.values()].flat().filter((install) => !install.stale).flatMap((install) => install.kinds.flatMap((kind) => kind.slots));
  const busy = slots.filter((slot) => slot.phase === "busy").length;
  const waiting = needsYouEverywhere(inboxes).filter((item) => !isInboxItemHidden(item)).length;
  const { reviews } = useServerCapabilities();
  const chat = useChatDockAvailable();

  const product = productOf(path);
  const pages: Record<Product, ReadonlyArray<Page>> = {
    ci: [
      { to: "/", label: "Overview", icon: LayoutDashboard },
      { to: "/runs", label: "Runs", icon: ListTree },
      { to: "/speed", label: "Speed and cost", icon: Gauge },
      { to: "/runners", label: "Runners", icon: Server, count: slots.length > 0 ? `${busy} of ${slots.length} busy` : null },
    ],
    review: [{ to: "/pulls", label: "Pull requests", icon: GitPullRequest }],
  };

  return (
    // A raised surface with no border, like Codex's.
    <Sidebar aria-label="Navigation" collapsible="icon" className="group-data-[side=left]:border-r-0">
      {/* A server older than reviews has one product, so nothing to switch between. */}
      {reviews ? (
        <SidebarHeader className="group-data-[collapsible=icon]:hidden">
          <ProductSwitch product={product} />
        </SidebarHeader>
      ) : null}
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {pages[product].map((page) => (
              <PageRow key={page.to} page={page} path={path} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
        {/* The rail has no switch, so it shows the other product's pages too. */}
        {reviews ? (
          <SidebarGroup className="hidden group-data-[collapsible=icon]:block">
            <SidebarMenu>
              {pages[product === "ci" ? "review" : "ci"].map((page) => (
                <PageRow key={page.to} page={page} path={path} />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {/* Left out where the dock would be empty: a page with no thread, on a server older than the chat. */}
          {chat ? <ChatRow /> : null}
          <NotificationsRow count={waiting} />
          <PageRow page={{ to: "/settings", label: "Settings", icon: Settings }} path={path} />
        </SidebarMenu>
        <SidebarUpdateSlot />
        <SidebarMenu>
          <SidebarMenuItem>
            <EnvironmentMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
