import { useEffect, useMemo } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { TabsNav } from "../../components/layout/TabsNav";
import { DOCUMENTS_TAB_ITEMS } from "./documentsTabConfig";
import { buildDocumentsSidebarFromCatalog } from "./buildDocumentsNavFromCatalog";
import {
  DocumentContent,
  DocumentLayout,
  DocumentMobileNav,
  DocumentSidebar,
} from "./DocumentLayout";
import {
  OperationalDocumentSeriesProvider,
  useOperationalDocumentSeries,
} from "./OperationalDocumentSeriesContext";
import { isNavPathActive } from "../../layout/navActive";
import {
  clearDocumentsSeriesListContext,
  parseDocumentsPathForSeriesContext,
  rememberDocumentsSeriesListContext,
} from "./documentSeriesContext";

function sideLinkCls(active: boolean) {
  return [
    "flex min-h-[30px] items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium transition-colors",
    active
      ? "bg-cyan-50 text-cyan-950 ring-1 ring-cyan-200/70"
      : "text-slate-600 hover:bg-white/80 hover:text-slate-900",
  ].join(" ");
}

function DocumentsLayoutInner() {
  const { pathname } = useLocation();
  const { catalog } = useOperationalDocumentSeries();

  const sidebarSections = useMemo(
    () => buildDocumentsSidebarFromCatalog(pathname, catalog?.items),
    [pathname, catalog?.items],
  );

  const tabItems = useMemo(() => {
    const items = catalog?.items ?? [];
    const hasSale = items.some((i) => i.series_type === "SALE");
    const hasCorr = items.some((i) => i.series_type === "CORRECTION");
    const hasWh = items.some((i) => i.series_type === "WAREHOUSE");
    return DOCUMENTS_TAB_ITEMS.filter((t) => {
      if (t.path === "/documents/sales") return hasSale;
      if (t.path === "/documents/correcting") return hasCorr;
      if (t.path === "/documents/warehouse") return hasWh;
      return true;
    });
  }, [catalog?.items]);

  const operationTabs = tabItems.filter((t) => t.group !== "settings");
  const settingsTabs = tabItems.filter((t) => t.group === "settings");

  useEffect(() => {
    if (!pathname.startsWith("/documents")) return;
    if (pathname.startsWith("/documents/series")) {
      clearDocumentsSeriesListContext();
      return;
    }
    const ctx = parseDocumentsPathForSeriesContext(pathname);
    if (ctx) rememberDocumentsSeriesListContext(ctx);
  }, [pathname]);

  const sidebarNav = (
    <nav className="flex flex-col gap-2 p-1.5">
      {sidebarSections.map((section, si) => (
        <div key={`${section.title ?? "sec"}-${si}`}>
          {section.title ? (
            <div className="mb-1 px-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {section.title}
            </div>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = isNavPathActive(pathname, item.path);
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={() => sideLinkCls(active)}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="min-w-0 truncate">{item.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col p-4 md:p-6">
        <DocumentLayout>
          <DocumentSidebar aria-label="Dokumenty — nawigacja">{sidebarNav}</DocumentSidebar>

          <DocumentContent>
            <div className="shrink-0 border-b border-slate-200 bg-white px-5 pt-4">
              <div className="flex w-full flex-wrap items-end gap-x-6 gap-y-2">
                <TabsNav
                  items={operationTabs}
                  variant="underline"
                  className="min-w-0 flex-1 gap-8 overflow-x-auto border-b-0 [-webkit-overflow-scrolling:touch]"
                  aria-label="Dokumenty — operacje"
                />
                {settingsTabs.length > 0 ? (
                  <div className="flex min-w-0 items-end gap-3 border-l border-slate-200 pl-4">
                    <span className="hidden pb-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 lg:inline">
                      Ustawienia
                    </span>
                    <TabsNav
                      items={settingsTabs}
                      variant="underline"
                      className="min-w-0 gap-6 overflow-x-auto border-b-0 [-webkit-overflow-scrolling:touch]"
                      aria-label="Dokumenty — ustawienia"
                    />
                  </div>
                ) : null}
              </div>
            </div>
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-white p-4">
              <Outlet />
            </main>
          </DocumentContent>

          <DocumentMobileNav aria-label="Dokumenty — skróty">
            <ul className="flex flex-wrap gap-1.5">
              {sidebarSections.flatMap((s) => s.items).map((item) => {
                const active = isNavPathActive(pathname, item.path);
                return (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      className={`inline-flex rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        active ? "bg-cyan-600 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {item.label}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </DocumentMobileNav>
        </DocumentLayout>
      </div>
    </div>
  );
}

export default function DocumentsLayout() {
  return (
    <OperationalDocumentSeriesProvider>
      <DocumentsLayoutInner />
    </OperationalDocumentSeriesProvider>
  );
}
