import { useAtomValue } from "@effect/atom-react";
import type { ThreadSubject } from "@runnerbox/contracts";
import { useActiveEnvironment } from "../hooks/useEnvironment.ts";
import { useRange } from "../hooks/useRange.ts";
import { useServerCapabilities } from "../hooks/useServerCapabilities.ts";
import { useThread } from "../hooks/useThread.ts";
import { appAtomRegistry } from "../rpc/atomRegistry.ts";
import { chatDockNodeAtom, chatDockOpenAtom, pageThreadsAtom } from "../state/chatDock.ts";
import { ThreadPanel } from "./ThreadPanel.tsx";

const CHAT: ThreadSubject = { _tag: "general" };

// The chat on no subject: the same thread on every page and for every window on the environment.
function Chat() {
  const { days } = useRange();
  const thread = useThread(CHAT, days);
  return <ThreadPanel thread={thread} title="Chat" placeholder="Ask anything" empty="Ask about your runs, runners or reviews. It reads the same history these pages show." />;
}

// Whether the dock has anything to hold here: a page's own thread, or the chat on a server that has it.
export function useChatDockAvailable() {
  const pageThreads = useAtomValue(pageThreadsAtom);
  const { chat } = useServerCapabilities();
  return pageThreads > 0 || chat;
}

// A chat docked beside whatever page is open, so a question never needs a trip to another page. A
// page about one thing, a run or an install's runners, draws that thread in here (ThreadColumn);
// every other page gets the chat on no subject. Below the sidebar's breakpoint there's no room
// beside a page, so it covers it.
export function ChatDock() {
  const open = useAtomValue(chatDockOpenAtom);
  const pageThreads = useAtomValue(pageThreadsAtom);
  const { environment } = useActiveEnvironment();
  const available = useChatDockAvailable();
  if (!open || !available || !environment) return null;
  return (
    <aside
      aria-label="Chat"
      ref={(node) => appAtomRegistry.set(chatDockNodeAtom, node)}
      className="flex min-h-0 w-full shrink-0 flex-col border-l bg-background max-md:fixed max-md:inset-0 max-md:z-40 md:w-[26rem]"
    >
      {pageThreads === 0 ? <Chat key={environment.environmentId} /> : null}
    </aside>
  );
}
