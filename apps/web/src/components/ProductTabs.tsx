import { Link, useRouterState } from "@tanstack/react-router";
import type { RootSearch } from "../lib/search.ts";
import { isOpen, PRODUCTS, productOf } from "../lib/products.ts";
import { cn } from "../lib/utils.ts";

const keep = (previous: RootSearch) => previous;

// What starts every page's bar: the open product's name and its pages as tabs. The rail switches
// products; these switch pages within one.
export function ProductTabs() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const product = PRODUCTS[productOf(path)];
  return (
    <nav aria-label={product.label} className="flex min-w-0 shrink items-center gap-3">
      <span className="shrink-0 font-semibold text-sm">{product.label}</span>
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
        {product.pages.map((page) => {
          const open = isOpen(page.to, path);
          return (
            <Link
              key={page.to}
              to={page.to}
              search={keep}
              aria-current={open ? "page" : undefined}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-sm transition-colors",
                open ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {page.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
