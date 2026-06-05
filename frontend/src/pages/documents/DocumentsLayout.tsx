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
  parseDocumentsPathForSeriesContext,
  rememberDocumentsSeriesListContext,
} from "./documentSeriesContext";

function sideLinkCls(active: boolean) {
  return [
    "flex min-h-[40px] items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:shrink-0",
    active
      ? "bg-cyan-50 text-cyan-950 ring-1 ring-cyan-200/80 shadow-sm"
      : "text-slate-700 hover:bg-slate-50 hover:ring-1 hover:ring-slate-200/60",
  ].join(" ");
}

/**
 * Dokumenty — jedna biała powierzchnia jak {@link ../../components/layout/PageContainer} / Wózki:
 * zewnętrzny gutter + **jeden** rounded workspace obejmujący sidebar, zakładki i treść (bez szarego tła między panelami).
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

  useEffect(() => {
    if (!pathname.startsWith("/documents")) return;
    if (pathname.startsWith("/documents/series")) return;
    const ctx = parseDocumentsPathForSeriesContext(pathname);
    if (ctx) rememberDocumentsSeriesListContext(ctx);
  }, [pathname]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Ten sam rytm co PageContainer: szary tylko na zewnętrznym gutterze */}
      <div className="w-full min-w-0 flex-1 p-4 md:p-6">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex min-h-0 min-w-0 flex-1">
            <aside
              className="hidden w-[238px] shrink-0 border-r border-slate-200 bg-slate-50/40 sm:block"
              aria-label="Dokumenty — nawigacja"
            >
              <div className="sticky top-0 max-h-[calc(100dvh-6rem)] overflow-y-auto p-3">
                <nav className="flex flex-col gap-4">
                  {sidebarSections.map((section, si) => (
                    <div key={`${section.title ?? "sec"}-${si}`}>
                      {section.title ? (
                        <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {section.title}
                        </div>
                      ) : null}
                      <ul className="flex flex-col gap-1">
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

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="shrink-0 border-b border-slate-200 bg-white px-5 pt-4">
                <TabsNav
                  items={tabItems}
                  variant="underline"
                  className="w-full gap-8 overflow-x-auto [-webkit-overflow-scrolling:touch]"
                  aria-label="Dokumenty — zakładki"
                />
              </div>
              <main className="min-h-0 flex-1 overflow-auto bg-white p-5">
                <Outlet />
              </main>
            </div>
          </div>

          <nav
            className="shrink-0 border-t border-slate-200 bg-white px-3 py-2.5 sm:hidden"
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
