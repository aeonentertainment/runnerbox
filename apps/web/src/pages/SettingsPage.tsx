import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Bell, Eye, GitBranch, GitPullRequest, Info, KeyRound, Plug, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { PaletteButton } from "../components/PaletteButton.tsx";
import { handleSettingsSectionKeyDown } from "../components/settings/settingsSectionNavigation.ts";
import { SidebarToggle } from "../components/SidebarToggle.tsx";
import { SidebarContent, SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../components/ui/sidebar.tsx";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem, WorkspaceBreadcrumbSeparator } from "../components/WorkspaceBreadcrumb.tsx";
import type { RootSearch } from "../lib/search.ts";

// The rail's order, grouped under headings as T3 Code's settings are. A group with no heading is
// set apart by space alone.
const GROUPS = [
  { heading: null, sections: [{ to: "/settings/notifications", label: "Notifications", icon: Bell }] },
  {
    heading: "CI",
    sections: [
      { to: "/settings/monitors", label: "Monitors", icon: Eye },
      { to: "/settings/changes", label: "Changes", icon: SlidersHorizontal },
    ],
  },
  { heading: "Code Review", sections: [{ to: "/settings/reviews", label: "Reviews", icon: GitPullRequest }] },
  { heading: "Agents", sections: [{ to: "/settings/providers", label: "Providers", icon: KeyRound }] },
  {
    heading: "Connections",
    sections: [
      { to: "/settings/connections", label: "Environments", icon: Plug },
      { to: "/settings/github", label: "GitHub", icon: GitBranch },
      { to: "/settings/access", label: "Access", icon: ShieldCheck },
    ],
  },
  { heading: null, sections: [{ to: "/settings/about", label: "About", icon: Info }] },
] as const;
const SECTIONS = GROUPS.flatMap<(typeof GROUPS)[number]["sections"][number]>((group) => [...group.sections]);

// Settings as T3 Code lays them out: the sections in a rail on the left, arrow keys moving between
// them, and the open one on the right under a breadcrumb, which starts with the app sidebar's toggle
// and ends with the palette's button, as every page's bar does.
export function SettingsPage() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const current = SECTIONS.find((section) => section.to === path);
  return (
    <div className="relative flex min-h-0 flex-1">
      <nav aria-label="Settings sections" className="flex w-60 shrink-0 flex-col border-e bg-sidebar text-sidebar-foreground max-md:w-14">
        <SidebarContent className="overflow-x-hidden">
          {/* One key handler over every group, so the arrow keys cross from one group to the next. */}
          <SidebarGroup className="gap-4" onKeyDown={handleSettingsSectionKeyDown}>
            {GROUPS.map((group) => (
              <div key={group.sections[0].to} className="flex flex-col gap-1">
                {group.heading ? <h3 className="px-2 font-medium text-sidebar-muted-foreground/80 text-xs max-md:sr-only">{group.heading}</h3> : null}
                <SidebarMenu>
                  {group.sections.map(({ to, label, icon: Icon }) => (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton
                        data-settings-section={to}
                        aria-current={path === to ? "page" : undefined}
                        isActive={path === to}
                        render={<Link to={to} search={(previous: RootSearch) => previous} />}
                      >
                        <Icon />
                        <span className="truncate max-md:sr-only">{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </div>
            ))}
          </SidebarGroup>
        </SidebarContent>
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b ps-3.5 pe-2">
          <SidebarToggle />
          <WorkspaceBreadcrumb ariaLabel="Settings breadcrumb">
            {current ? (
              <>
                <WorkspaceBreadcrumbItem>Settings</WorkspaceBreadcrumbItem>
                <WorkspaceBreadcrumbSeparator />
              </>
            ) : null}
            <WorkspaceBreadcrumbItem current className="truncate">
              {current?.label ?? "Settings"}
            </WorkspaceBreadcrumbItem>
          </WorkspaceBreadcrumb>
          <div className="min-w-0 flex-1" />
          <PaletteButton />
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
