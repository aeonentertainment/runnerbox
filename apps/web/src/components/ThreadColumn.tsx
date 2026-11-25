import { useAtomValue } from "@effect/atom-react";
import type { ThreadSubject } from "@runnerbox/contracts";
import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRange } from "../hooks/useRange.ts";
import { useThread } from "../hooks/useThread.ts";
import { appAtomRegistry } from "../rpc/atomRegistry.ts";
import { chatDockNodeAtom, chatDockOpenAtom, pageThreadsAtom } from "../state/chatDock.ts";
import { ThreadPanel } from "./ThreadPanel.tsx";

type Thread = ReturnType<typeof useThread>;

// A subject's reading column, with its agent thread in the chat dock beside the page. `children`
// gets the thread, so its primary action can start a turn, which opens the dock. The thread is
// drawn into the dock from here, so the page and the dock read one thread and the dock keeps the
// page's environment. A null subject is one the page is still waiting on: the dock keeps its shape,
// with no composer.
export function ThreadColumn(props: { subject: ThreadSubject | null; title: string; placeholder: string; children: (thread: Thread) => ReactNode }) {
  const { days } = useRange();
  const thread = useThread(props.subject, days);
  const dock = useAtomValue(chatDockNodeAtom);
  // The dock holds this page's thread for as long as the column is mounted.
  useEffect(() => {
    appAtomRegistry.update(pageThreadsAtom, (count) => count + 1);
    return () => appAtomRegistry.update(pageThreadsAtom, (count) => count - 1);
  }, []);
  // A thread that already has something in it, such as what a monitor found, opens the dock once,
  // so the answer isn't hidden behind a closed panel.
  const opened = useRef(false);
  const hasItems = thread.view.items.length > 0;
  useEffect(() => {
    if (!hasItems || opened.current) return;
    opened.current = true;
    appAtomRegistry.set(chatDockOpenAtom, true);
  }, [hasItems]);
  const asking: Thread = {
    ...thread,
    send: (text, options) => {
      appAtomRegistry.set(chatDockOpenAtom, true);
      return thread.send(text, options);
    },
  };
  return (
    <>
      <div className="topbar-scroll-fade min-h-0 flex-1 overflow-y-auto">{props.children(asking)}</div>
      {dock ? createPortal(<ThreadPanel thread={thread} title={props.title} placeholder={props.placeholder} />, dock) : null}
    </>
  );
}
