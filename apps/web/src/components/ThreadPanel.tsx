import { X } from "lucide-react";
import { type DragEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { useComposerAttachments } from "../hooks/useComposerAttachments.ts";
import { useServerCapabilities } from "../hooks/useServerCapabilities.ts";
import type { useThread } from "../hooks/useThread.ts";
import { appAtomRegistry } from "../rpc/atomRegistry.ts";
import { chatDockOpenAtom } from "../state/chatDock.ts";
import { ScrollToEndButton } from "./chat/TimelineOverlays.tsx";
import { GhostBar } from "./GhostBar.tsx";
import { Composer } from "./thread/Composer.tsx";
import { ThreadMessages } from "./thread/ThreadMessages.tsx";
import { Button } from "./ui/button.tsx";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip.tsx";

type Thread = ReturnType<typeof useThread>;

// How near the end still counts as at the end, for rounding and a last line half in view.
const END_SLACK_PX = 24;

// What the chat dock holds: a thread's messages with one composer at the bottom, as in T3 Code's
// chat column, under a bar that names what the thread is about. Files dragged anywhere over it are
// attached to the composer's draft, on a server that takes them. `empty` shows until the first
// question.
export function ThreadPanel({ thread, title, placeholder, empty }: { thread: Thread; title: string; placeholder: string; empty?: ReactNode }) {
  const attachments = useComposerAttachments(thread.environmentId, thread.draftKey);
  const capabilities = useServerCapabilities();
  const [dragging, setDragging] = useState(false);
  const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");
  const scroller = useRef<HTMLDivElement>(null);
  // As T3 Code's timeline: a turn that starts follows the end as text streams in, until the owner
  // scrolls up; "Scroll to end" shows whenever they're not at the end, and follows again.
  const following = useRef(false);
  const lastTop = useRef(0);
  const [atEnd, setAtEnd] = useState(true);
  const measure = (element: HTMLElement) => setAtEnd(element.scrollHeight - element.scrollTop - element.clientHeight <= END_SLACK_PX);
  const scrollToEnd = () => {
    const element = scroller.current;
    if (!element) return;
    following.current = true;
    element.scrollTo({ top: element.scrollHeight });
  };
  const running = useRef(thread.view.running);
  useEffect(() => {
    running.current = thread.view.running;
    if (thread.view.running) following.current = true;
  }, [thread.view.running]);
  // Follows content outside React's state: whatever changes the scroller's size or its content's,
  // streamed text, a fold opened, the window resized, keeps the end in view while following and
  // says whether it's at the end.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (running.current && following.current) element.scrollTo({ top: element.scrollHeight });
      measure(element);
    });
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col", dragging && "bg-accent/45 ring-1 ring-inset ring-primary/70")}
      onDragOver={(event) => {
        if (!carriesFiles(event) || !thread.ready || !thread.permitted || !capabilities.attachments) return;
        event.preventDefault();
        setDragging(true);
      }}
      // Leaving for a child isn't leaving the panel.
      onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setDragging(false);
      }}
      onDrop={(event) => {
        if (!carriesFiles(event) || !thread.ready || !capabilities.attachments) return;
        event.preventDefault();
        setDragging(false);
        attachments.add([...event.dataTransfer.files]);
      }}
    >
      <div className="flex h-(--workspace-topbar-height) shrink-0 items-center gap-1 pr-3 pl-6">
        <h2 className="min-w-0 flex-1 truncate font-medium text-sm">{title}</h2>
        <Tooltip>
          <TooltipTrigger render={<Button aria-label="Close chat" size="icon-sm" variant="ghost" onClick={() => appAtomRegistry.set(chatDockOpenAtom, false)} />}>
            <X />
          </TooltipTrigger>
          <TooltipPopup>Close</TooltipPopup>
        </Tooltip>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scroller}
          className="min-h-0 flex-1 overflow-y-auto"
          // Only scrolling up stops following: text that grew before a scroll event lands isn't the
          // owner leaving the end.
          onScroll={(event) => {
            const element = event.currentTarget;
            measure(element);
            if (element.scrollTop < lastTop.current) following.current = false;
            else if (element.scrollHeight - element.scrollTop - element.clientHeight <= END_SLACK_PX) following.current = true;
            lastTop.current = element.scrollTop;
          }}
        >
          {thread.view.items.length === 0 && empty ? <p className="px-6 pb-4 text-muted-foreground text-sm">{empty}</p> : null}
          <div className="px-6 pb-6">
            <ThreadMessages view={thread.view} error={thread.error} environmentId={thread.environmentId} onCancelQueued={thread.cancelQueued} />
          </div>
        </div>
        {/* In its own band above the composer, as upstream places it, so it never covers a line. */}
        {!atEnd && thread.view.items.length > 0 ? (
          <div className="relative h-9 shrink-0">
            <ScrollToEndButton bottom={0} summary={null} onScrollToEnd={scrollToEnd} />
          </div>
        ) : null}
      </div>
      <div className="px-6 pt-2 pb-4">
        {/* Until the subject is known there's no draft to write to, so a ghost holds the composer's place. */}
        {thread.ready ? <Composer thread={thread} attachments={attachments} capabilities={capabilities} placeholder={placeholder} /> : <GhostBar className="h-24 rounded-2xl" />}
      </div>
    </div>
  );
}
