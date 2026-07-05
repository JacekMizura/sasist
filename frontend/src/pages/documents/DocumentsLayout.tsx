import { useEffect, useMemo } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { TabsNav } from "../../components/layout/TabsNav";
import { DOCUMENTS_TAB_ITEMS } from "./documentsTabConfig";
import { buildDocumentsSidebarFromCatalog } from "./buildDocumentsNavFromCatalog";
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
    "flex min-h-[34px] items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-all [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
    active
      ? "bg-cyan-50/90 text-cyan-950 ring-1 ring-cyan-200/70"
      : "text-slate-600 hover:bg-white/80 hover:text-slate-900 hover:ring-1 hover:ring-slate-200/50",
  ].join(" ");
}

/**
 * Dokumenty — layout modułu: sidebar wyznacza szerokość treści (flex row, bez fixed overlay).
 * Jedno przewijanie — w kolumnie treści; bez sticky sidebar nachodzącego na listę.
 */
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

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="w-full min-w-0 flex-1 p-4 md:p-6">
        <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[1fr_auto] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-rows-1 sm:grid-cols-[210px_minmax(0,1fr)]">
          <aside
            className="relative z-10 hidden min-h-0 min-w-0 overflow-y-auto border-r border-slate-200/90 bg-slate-50/30 sm:block"
            aria-label="Dokumenty — nawigacja"
          >
            <div className="p-2">
              <nav className="flex flex-col gap-3">
                {sidebarSections.map((section, si) => (
                  <div key={`${section.title ?? "sec"}-${si}`}>
                    {section.title ? (
                      <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {section.title}
                      </div>
                    ) : null}
                    <ul className="flex flex-col gap-0.5">
                      {section.items.map((item) => {
                        const Icon = item.Icon;
                        const active = isNavPathActive(pathname, item.path);
                        return (
                          <li key={item.path}>
                            <NavLink
                              to={item.path}
                              className={() => sideLinkCls(active)}
                              aria-current={active ? "page" : undefined}
                            >
                              <span className={active ? "text-cyan-700" : "text-slate-400"}>
                                <Icon aria-hidden />
                              </span>
                              <span className="min-w-0 truncate">{item.label}</span>
                            </NavLink>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>
            </div>
          </aside>

          <div className="relative z-0 flex min-h-0 min-w-0 flex-col">
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
            <main className="relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-white p-5">
              <Outlet />
            </main>
          </div>

          <nav
            className="col-span-full shrink-0 border-t border-slate-200 bg-white px-3 py-2.5 sm:hidden"
            aria-label="Dokumenty — skróty"
          >
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
          </nav>
        </div>
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
