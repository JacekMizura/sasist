import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { ReactNode } from "react";

import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { TabsContainer } from "../../components/layout/TabsContainer";
import { tabsNavItemClassName } from "../../components/layout/TabsNav";
import { WmsSettingsGlobalSearch } from "./settingsSearch";
import "./settingsSearch/settingFlash.css";

/** Canonical WMS settings top tabs — process settings only (hub + Stanowiska). */
export const WMS_SETTINGS_TABS = [
  { id: "packing", label: "Pakowanie" },
  { id: "picking", label: "Zbieranie" },
  { id: "direct_sales", label: "Sprzedaż bezpośrednia" },
  { id: "complaints", label: "Reklamacje" },
  { id: "returns", label: "Zwroty" },
  { id: "crossdocking", label: "Crossdocking" },
  { id: "receiving", label: "Przyjęcia" },
  { id: "production", label: "Produkcja" },
  { id: "putaway", label: "Rozlokowania" },
  { id: "transfers", label: "Przesunięcia" },
  { id: "smart_matching", label: "Smart Matching" },
  { id: "three_d_matching", label: "Dopasowanie przestrzenne" },
  { id: "workstations", label: "Stanowiska" },
] as const;

export type WmsSettingsTabId = (typeof WMS_SETTINGS_TABS)[number]["id"];

export const WMS_SETTINGS_HUB_PATH = "/settings/wms";
export const WMS_WORKSTATIONS_PATH = "/settings/wms/workstations";

/** Former „Stany magazynowe” tab — now Asortyment → Ustawienia. */
export const ASSORTMENT_INVENTORY_SETTINGS_PATH = "/assortment/settings";

export function isWmsSettingsTabId(value: string | null | undefined): value is WmsSettingsTabId {
  return Boolean(value && WMS_SETTINGS_TABS.some((t) => t.id === value));
}

export function wmsSettingsTabHref(tabId: WmsSettingsTabId): string {
  if (tabId === "workstations") return WMS_WORKSTATIONS_PATH;
  if (tabId === "packing") return WMS_SETTINGS_HUB_PATH;
  return `${WMS_SETTINGS_HUB_PATH}?tab=${tabId}`;
}

export function resolveWmsSettingsTabFromLocation(
  pathname: string,
  searchParams: URLSearchParams,
): WmsSettingsTabId {
  if (pathname === WMS_WORKSTATIONS_PATH || pathname.startsWith(`${WMS_WORKSTATIONS_PATH}/`)) {
    return "workstations";
  }
  const raw = searchParams.get("tab");
  if (isWmsSettingsTabId(raw) && raw !== "workstations") return raw;
  return "packing";
}

type ChromeProps = {
  /** Extra breadcrumbs after „Ustawienia WMS” (e.g. Stanowiska, station name). */
  trail?: Array<{ label: string; to?: string }>;
  /** Page title under breadcrumbs — default „Ustawienia WMS”. */
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** When false, hide the module tab strip (rarely needed). */
  showTabs?: boolean;
};

/**
 * Shared chrome for every Ustawienia WMS screen (hub panels + Stanowiska).
 * Keeps header, breadcrumbs, and tabs identical across routes.
 */
export function WmsSettingsChrome({
  trail = [],
  title = "Ustawienia WMS",
  subtitle,
  actions,
  children,
  showTabs = true,
}: ChromeProps) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeTab = resolveWmsSettingsTabFromLocation(location.pathname, searchParams);

  const breadcrumbs = [
    { label: "Ustawienia WMS", to: trail.length > 0 ? WMS_SETTINGS_HUB_PATH : undefined },
    ...trail,
  ];

  const tabs = showTabs ? (
    <TabsContainer className="w-full [-webkit-overflow-scrolling:touch]">
      <nav
        className="flex w-full flex-nowrap gap-6 overflow-x-auto sm:justify-start"
        aria-label="Sekcje ustawień WMS"
        role="tablist"
      >
        {WMS_SETTINGS_TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`wms-settings-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                const href = wmsSettingsTabHref(tab.id);
                if (href !== `${location.pathname}${location.search}`) {
                  navigate(href);
                }
              }}
              className={tabsNavItemClassName(selected)}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </TabsContainer>
  ) : null;

  return (
    <PageLayout className="min-w-0 overflow-visible">
      <PageHeader
        title={title}
        subtitle={subtitle}
        breadcrumbs={breadcrumbs}
        actions={
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <WmsSettingsGlobalSearch />
            {actions}
          </div>
        }
        tabs={tabs}
      />
      <div className="mt-4 w-full min-w-0">{children}</div>
    </PageLayout>
  );
}

/** Convenience link used in empty / redirect copy. */
export function WmsSettingsHubLink({ children }: { children?: ReactNode }) {
  return (
    <Link to={WMS_SETTINGS_HUB_PATH} className="font-medium text-orange-700 hover:text-orange-800">
      {children ?? "Ustawienia WMS"}
    </Link>
  );
}
