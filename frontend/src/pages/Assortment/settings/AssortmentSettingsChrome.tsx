import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { ReactNode } from "react";

import PageLayout from "../../../components/layout/PageLayout";
import { PageHeader } from "../../../components/layout/PageHeader";
import { TabsContainer } from "../../../components/layout/TabsContainer";
import { tabsNavItemClassName } from "../../../components/layout/TabsNav";

/** Extensible tab strip — add future product settings sections here. */
export const ASSORTMENT_SETTINGS_TABS = [
  { id: "inventory", label: "Stany magazynowe" },
] as const;

export type AssortmentSettingsTabId = (typeof ASSORTMENT_SETTINGS_TABS)[number]["id"];

export const ASSORTMENT_SETTINGS_PATH = "/assortment/settings";

export function isAssortmentSettingsTabId(
  value: string | null | undefined,
): value is AssortmentSettingsTabId {
  return Boolean(value && ASSORTMENT_SETTINGS_TABS.some((t) => t.id === value));
}

export function assortmentSettingsTabHref(tabId: AssortmentSettingsTabId): string {
  if (tabId === "inventory") return ASSORTMENT_SETTINGS_PATH;
  return `${ASSORTMENT_SETTINGS_PATH}?tab=${tabId}`;
}

export function resolveAssortmentSettingsTab(searchParams: URLSearchParams): AssortmentSettingsTabId {
  const raw = searchParams.get("tab");
  if (isAssortmentSettingsTabId(raw)) return raw;
  return "inventory";
}

type ChromeProps = {
  trail?: Array<{ label: string; to?: string }>;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  showTabs?: boolean;
};

/**
 * Shared chrome for Asortyment → Ustawienia (inventory policy + future product tabs).
 */
export function AssortmentSettingsChrome({
  trail = [],
  title = "Ustawienia",
  subtitle,
  actions,
  children,
  showTabs = true,
}: ChromeProps) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeTab = resolveAssortmentSettingsTab(searchParams);

  const breadcrumbs = [
    { label: "Asortyment", to: "/products/list" },
    { label: "Ustawienia", to: trail.length > 0 ? ASSORTMENT_SETTINGS_PATH : undefined },
    ...trail,
  ];

  const tabs = showTabs ? (
    <TabsContainer className="w-full [-webkit-overflow-scrolling:touch]">
      <nav
        className="flex w-full flex-nowrap gap-6 overflow-x-auto sm:justify-start"
        aria-label="Sekcje ustawień asortymentu"
        role="tablist"
      >
        {ASSORTMENT_SETTINGS_TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`assortment-settings-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                const href = assortmentSettingsTabHref(tab.id);
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
        actions={actions}
        tabs={tabs}
      />
      <div className="mt-4 w-full min-w-0">{children}</div>
    </PageLayout>
  );
}
