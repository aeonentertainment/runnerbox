import { Activity, GitPullRequest } from "lucide-react";

// The app is two products in one window. The open page says which one is showing.
export type Product = "ci" | "review";

type PagePath = "/" | "/runs" | "/flaky" | "/speed" | "/runners" | "/pulls" | "/insights" | "/memory";

// Each product's pages, in tab order. The first is where the product opens.
export const PRODUCTS = {
  ci: {
    label: "CI",
    icon: Activity,
    pages: [
      { to: "/", label: "Overview" },
      { to: "/runs", label: "Runs" },
      { to: "/flaky", label: "Flaky tests" },
      { to: "/speed", label: "Speed and cost" },
      { to: "/runners", label: "Runners" },
    ],
  },
  review: {
    label: "Code Review",
    icon: GitPullRequest,
    pages: [
      { to: "/pulls", label: "Pull requests" },
      { to: "/insights", label: "Analytics" },
      { to: "/memory", label: "Memory" },
    ],
  },
} as const satisfies Record<Product, { label: string; icon: unknown; pages: ReadonlyArray<{ to: PagePath; label: string }> }>;

// Overview, at "/", is open only there; the others also own the pages under them, such as a run.
export const isOpen = (to: string, path: string) => path === to || (to !== "/" && path.startsWith(`${to}/`));

export const productOf = (path: string): Product => (PRODUCTS.review.pages.some((page) => isOpen(page.to, path)) ? "review" : "ci");
