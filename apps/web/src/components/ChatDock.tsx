import { useAtom } from "@effect/atom-react";
import type { ThreadSubject } from "@runnerbox/contracts";
import { X } from "lucide-react";
import { useActiveEnvironment } from "../hooks/useEnvironment.ts";
import { useServerCapabilities } from "../hooks/useServerCapabilities.ts";
import { chatDockOpenAtom } from "../state/chatDock.ts";
import { ThreadColumn } from "./ThreadColumn.tsx";
import { Button } from "./ui/button.tsx";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip.tsx";

const CHAT: ThreadSubject = { _tag: "general" };

// A chat on no subject, docked beside whatever page is open, so a question never needs a trip to
// another page. It's the same thread on every page and for every window on the environment. Below
// the sidebar's breakpoint there's no room beside a page, so it covers it.
export function ChatDock() {
  const [open, setOpen] = useAtom(chatDockOpenAtom);
  const { environment } = useActiveEnvironment();
  const { chat } = useServerCapabilities();
  if (!open || !chat || !environment) return null;
  return (
    <aside aria-label="Chat" className="flex min-h-0 w-full shrink-0 flex-col border-l bg-background max-md:fixed max-md:inset-0 max-md:z-40 md:w-[26rem]">
      <ThreadColumn key={environment.environmentId} subject={CHAT} placeholder="Ask anything">
        {(thread) => (
          <>
            <div className="flex h-(--workspace-topbar-height) shrink-0 items-center gap-1 pr-3 pl-6">
              <h2 className="min-w-0 flex-1 truncate font-medium text-sm">Chat</h2>
              <Tooltip>
                <TooltipTrigger render={<Button aria-label="Close chat" size="icon-sm" variant="ghost" onClick={() => setOpen(false)} />}>
                  <X />
                </TooltipTrigger>
                <TooltipPopup>Close</TooltipPopup>
              </Tooltip>
            </div>
            {thread.view.items.length === 0 ? <p className="px-6 pb-4 text-muted-foreground text-sm">Ask about your runs, runners or reviews. It reads the same history these pages show.</p> : null}
          </>
        )}
      </ThreadColumn>
    </aside>
  );
}
