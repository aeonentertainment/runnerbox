import { Outlet, useRouterState } from "@tanstack/react-router";
import { useAtom } from "@effect/atom-react";
import { type CSSProperties, useEffect } from "react";
import { useStore } from "zustand";
import { useActiveEnvironment } from "../hooks/useEnvironment.ts";
import { useNeedsYouNotifications } from "../hooks/useNeedsYouNotifications.ts";
import { ConnectPage } from "../pages/ConnectPage.tsx";
import { PanelAnimationSuppressionProvider, usePanelAnimationSettings, usePanelNavigationSuppression } from "../panelAnimations.ts";
import { appAtomRegistry } from "../rpc/atomRegistry.ts";
import { runtime } from "../runtime.ts";
import { AppSidebar } from "./AppSidebar.tsx";
import { ChatDock } from "./ChatDock.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { ConnectionNotice } from "./ConnectionNotice.tsx";
import { chatDockOpenAtom } from "../state/chatDock.ts";
import { commandPaletteOpenAtom } from "../state/commandPalette.ts";
import { SidebarInset, SidebarProvider } from "./ui/sidebar.tsx";
import { ToastProvider } from "./ui/toast.tsx";
import { TooltipProvider } from "./ui/tooltip.tsx";

// T3 Code's layout, with its sidebar held at the rail: the products on the left, and the open page in
// the main column, which draws its own bar with the product's pages as tabs.
export function AppShell() {
  const loaded = useStore(runtime.store, (state) => state.loaded);
  const { environment } = useActiveEnvironment();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const [commandOpen, setCommandOpen] = useAtom(commandPaletteOpenAtom);
  // As T3 Code's AppSidebarLayout: panels ease open and shut, except under reduced motion and for
  // the two frames after a route change, so a new page never animates in.
  const { active: panelAnimationsActive, durationMs: panelAnimationDurationMs } = usePanelAnimationSettings();
  const panelAnimationsSuppressed = usePanelNavigationSuppression(path);
  useNeedsYouNotifications();
  // Cmd+K or Ctrl+K opens the palette from anywhere, and Cmd+J or Ctrl+J the chat: a key press is
  // outside React.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      const toggled = event.key === "k" ? commandPaletteOpenAtom : event.key === "j" ? chatDockOpenAtom : null;
      if (toggled === null) return;
      event.preventDefault();
      appAtomRegistry.update(toggled, (open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!loaded) return null;
  // Pairing comes first: without an environment there's nothing to put in the sidebar.
  if (!environment && !path.startsWith("/settings")) return <ConnectPage />;
  return (
    <TooltipProvider>
      <ToastProvider>
        {/* Held to the window, so a long thread scrolls inside its column and the composer stays in view. */}
        <PanelAnimationSuppressionProvider value={panelAnimationsSuppressed}>
          <SidebarProvider
            className="h-svh"
            data-panel-animations={panelAnimationsActive && !panelAnimationsSuppressed ? "true" : "false"}
            defaultOpen={false}
            style={{ "--panel-animation-duration": `${panelAnimationDurationMs}ms` } as CSSProperties}
          >
            <AppSidebar />
            <SidebarInset>
              <ConnectionNotice />
              {/* The page keeps its own column, and the chat docks beside it. */}
              <div className="flex min-h-0 flex-1">
                <div className="flex min-w-0 flex-1 flex-col">
                  <Outlet />
                </div>
                <ChatDock />
              </div>
            </SidebarInset>
          </SidebarProvider>
        </PanelAnimationSuppressionProvider>
        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      </ToastProvider>
    </TooltipProvider>
  );
}
