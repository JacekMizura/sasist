import { memo, useMemo } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { PURCHASING_SUPPLIERS_TABS } from "../purchasingSuppliersTabs";

function tabHref(path: string, tabLinkSearch: string): string {
  if (!tabLinkSearch) return path;
  return `${path}${tabLinkSearch.startsWith("?") ? tabLinkSearch : `?${tabLinkSearch}`}`;
}

function PurchasingSuppliersTabLayoutInner() {
  const location = useLocation();
  const tabLinkSearch = useMemo(() => {
    const tid = new URLSearchParams(location.search).get("tenant_id");
    return tid != null && tid !== "" ? `?tenant_id=${encodeURIComponent(tid)}` : "";
  }, [location.search]);

  return (
    <div className="w-full">
      <div className="border-b border-slate-200 bg-white px-2 md:px-4 2xl:px-6">
        <nav
          className="no-scrollbar flex items-center gap-1 overflow-x-auto"
          aria-label="Dostawcy — podzakładki"
          role="tablist"
        >
          {PURCHASING_SUPPLIERS_TABS.map((tab) => (
            <NavLink
              key={tab.path}
              to={tabHref(tab.path, tabLinkSearch)}
              end={tab.end ?? false}
              role="tab"
              className={({ isActive }) =>
                `relative whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-all ${
                  isActive
                    ? "border-orange-500 text-orange-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}

export default memo(PurchasingSuppliersTabLayoutInner);
