import { useAtom } from "@effect/atom-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, MessageSquareText, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { useServerCapabilities } from "../hooks/useServerCapabilities.ts";
import { useWaitingCount } from "../hooks/useWaitingCount.ts";
import { isOpen, type Product, PRODUCTS } from "../lib/products.ts";
import type { RootSearch } from "../lib/search.ts";
import { cn } from "../lib/utils.ts";
import { chatDockOpenAtom } from "../state/chatDock.ts";
import { useChatDockAvailable } from "./ChatDock.tsx";
import { NotificationsPopover } from "./NotificationsPopover.tsx";
import { PopoverTrigger } from "./ui/popover.tsx";

const keep = (previous: RootSearch) => previous;

const ITEM = "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] text-muted-foreground aria-[current=page]:text-foreground aria-pressed:text-foreground [&_svg]:size-5";

const Dot = () => <span className="pointer-events-none absolute top-1.5 left-[calc(50%+6px)] size-1.5 rounded-full bg-destructive" />;

function ProductItem({ product, path }: { product: Product; path: string }) {
  const { label, icon: Icon, pages } = PRODUCTS[product];
  const open = pages.some((page) => isOpen(page.to, path));
  return (
    <Link to={pages[0].to} search={keep} className={ITEM} aria-current={open ? "page" : undefined}>
      <Icon />
      {label}
    </Link>
  );
}

function ChatItem() {
  const [open, setOpen] = useAtom(chatDockOpenAtom);
  return (
    <button type="button" className={ITEM} aria-pressed={open} onClick={() => setOpen(!open)}>
      <MessageSquareText />
      Chat
    </button>
  );
}

function AlertsItem({ path }: { path: string }): ReactNode {
  const waiting = useWaitingCount();
  return (
    <NotificationsPopover side="top">
      <PopoverTrigger className={ITEM} aria-current={path.startsWith("/inbox") ? "page" : undefined}>
        <Bell />
        Alerts
        {waiting > 0 ? <Dot /> : null}
      </PopoverTrigger>
    </NotificationsPopover>
  );
}

// The rail turned sideways for a phone, where there's no room beside the page: the same products
// and the same buttons, in the same order.
export function BottomBar({ className }: { className?: string }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { reviews } = useServerCapabilities();
  const chat = useChatDockAvailable();
  return (
    <nav aria-label="Navigation" className={cn("flex shrink-0 border-t bg-sidebar pb-[env(safe-area-inset-bottom)]", className)}>
      <ProductItem product="ci" path={path} />
      {reviews ? <ProductItem product="review" path={path} /> : null}
      {chat ? <ChatItem /> : null}
      <AlertsItem path={path} />
      <Link to="/settings" search={keep} className={ITEM} aria-current={path.startsWith("/settings") ? "page" : undefined}>
        <Settings />
        Settings
      </Link>
    </nav>
  );
}
