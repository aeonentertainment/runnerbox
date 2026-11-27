import { Fragment, type ReactNode } from "react";
import { PaletteButton } from "./PaletteButton.tsx";
import { PRODUCTS } from "../lib/products.ts";
import { ProductTabs } from "./ProductTabs.tsx";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem, WorkspaceBreadcrumbSeparator } from "./WorkspaceBreadcrumb.tsx";
import { WorkspacePageHeader } from "./WorkspacePageHeader.tsx";

// Every page's top bar: the product's tabs, then, on a page under a tab such as one run, its name
// after what it sits in, then the page's controls, `children`, and the palette's button on the
// right. A tab's own page is named by its tab, so its heading is only for screen readers, and a
// crumb naming a tab is left to the tab.
const TABS: ReadonlySet<string> = new Set(Object.values(PRODUCTS).flatMap((product) => product.pages.map((page) => page.label)));

export function PageBar({ title, trail = [], children }: { title: ReactNode; trail?: ReadonlyArray<string>; children?: ReactNode }) {
  const nested = trail.length > 0;
  return (
    <WorkspacePageHeader>
      <ProductTabs />
      {nested ? (
        <WorkspaceBreadcrumb ariaLabel="Breadcrumb" className="min-w-0 overflow-hidden">
          {trail.filter((crumb) => !TABS.has(crumb)).map((crumb) => (
            <Fragment key={crumb}>
              <WorkspaceBreadcrumbSeparator />
              <WorkspaceBreadcrumbItem>{crumb}</WorkspaceBreadcrumbItem>
            </Fragment>
          ))}
          <WorkspaceBreadcrumbSeparator />
          <WorkspaceBreadcrumbItem current>
            <h1 className="truncate">{title}</h1>
          </WorkspaceBreadcrumbItem>
        </WorkspaceBreadcrumb>
      ) : (
        <h1 className="sr-only">{title}</h1>
      )}
      <div className="min-w-0 flex-1" />
      {children ? <div className="flex min-w-0 shrink-0 items-center gap-1.5">{children}</div> : null}
      <PaletteButton />
    </WorkspacePageHeader>
  );
}
