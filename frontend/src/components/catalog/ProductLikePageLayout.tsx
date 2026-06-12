import type { FormEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Save } from "lucide-react";

import {
  productLikeFormNumberReset,
  productLikeMetaChipClass,
  productLikeMetaChipLabelClass,
  productLikeMetaChipValueClass,
  productLikeRailBtnClass,
  productLikeStatCardClass,
  productLikeStatCardLabelClass,
  productLikeStatCardSubClass,
  productLikeStatCardValueClass,
  productLikeTabBtnClass,
  productLikeTabPanelPaddingClass,
} from "./productLikeTokens";

export type ProductLikeMetaChip = {
  label: string;
  value: ReactNode;
  variant?: "default" | "blue" | "emerald" | "amber";
  title?: string;
};

export type ProductLikeStatCard = {
  label: string;
  value: ReactNode;
  subValue?: ReactNode;
  variant?: "slate" | "blue" | "green" | "orange";
};

export type ProductLikeProductIdentifiers = {
  tenantLabel?: string;
  productId?: ReactNode;
  sku?: string;
  ean?: string;
};

export type ProductLikeBreadcrumb = {
  label: string;
  href?: string;
  onClick?: () => void;
};

export type ProductLikeTab<T extends string = string> = {
  id: T;
  label: string;
  icon: LucideIcon;
};

export type ProductLikePageLayoutProps<T extends string = string> = {
  variant?: "page" | "modal";
  onModalClose?: () => void;
  headerPrefix?: ReactNode;
  modeLabel: string;
  title: string;
  titleBadge?: ReactNode;
  imageUrl?: string | null;
  imageAlt?: string;
  metaChips?: ProductLikeMetaChip[];
  /** Modern header: KPI cards (e.g. stock, price, margin). When set, metaChips are ignored in the hero. */
  statCards?: ProductLikeStatCard[];
  productIdentifiers?: ProductLikeProductIdentifiers;
  breadcrumbs?: ProductLikeBreadcrumb[];
  headerActions?: ReactNode;
  tabs: ProductLikeTab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  children: ReactNode;
  onSubmit: (e: FormEvent) => void;
  saving?: boolean;
  saveLabel?: string;
  saveDisabled?: boolean;
  /** When false, footer omits primary save button (read-only entity views). */
  showSaveButton?: boolean;
  /** Primary save in top bar (product edit page). Footer save hidden when true. */
  saveInHeader?: boolean;
  /** Hide horizontal tab bar and vertical icon rail (single-view layouts). */
  hideTabs?: boolean;
  /** Hide the small uppercase mode label above the title. */
  hideModeLabel?: boolean;
  /** When false, header scrolls with page (product edit). Default true for legacy modals. */
  stickyHeader?: boolean;
  /** Hide right vertical icon rail (product edit uses horizontal tabs only). */
  hideVerticalRail?: boolean;
  /** Show Lucide icons in horizontal tab bar. */
  showTabIcons?: boolean;
  loadError?: ReactNode;
  footerExtra?: ReactNode;
  trailing?: ReactNode;
};

function StatCard({ card }: { card: ProductLikeStatCard }) {
  const variant = card.variant ?? "slate";
  return (
    <div className={productLikeStatCardClass(variant)}>
      <div className={productLikeStatCardLabelClass(variant)}>{card.label}</div>
      <div className={productLikeStatCardValueClass(variant)}>{card.value}</div>
      {card.subValue ? <div className={productLikeStatCardSubClass(variant)}>{card.subValue}</div> : null}
    </div>
  );
}

export function ProductLikePageLayout<T extends string>({
  variant = "page",
  onModalClose,
  headerPrefix,
  modeLabel,
  title,
  titleBadge,
  imageUrl,
  imageAlt = "",
  metaChips = [],
  statCards,
  productIdentifiers,
  breadcrumbs,
  headerActions,
  tabs,
  activeTab,
  onTabChange,
  children,
  onSubmit,
  saving = false,
  saveLabel = "Zapisz",
  saveDisabled = false,
  showSaveButton = true,
  saveInHeader = false,
  hideTabs = false,
  hideModeLabel = false,
  stickyHeader = true,
  hideVerticalRail = false,
  showTabIcons = false,
  loadError,
  footerExtra,
  trailing,
}: ProductLikePageLayoutProps<T>) {
  const isPage = variant === "page";
  const modernHero = (statCards?.length ?? 0) > 0;
  const showRail = !hideTabs && !hideVerticalRail;

  const formShellClass = isPage
    ? `flex flex-col ${productLikeFormNumberReset}`
    : `flex min-h-0 flex-1 flex-col overflow-hidden bg-white ${productLikeFormNumberReset}`;

  const bodyRowClass = isPage
    ? "flex w-full flex-col lg:flex-row lg:items-stretch"
    : "flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row lg:items-stretch";

  const mainColClass = isPage
    ? "flex min-w-0 flex-col"
    : "flex min-w-0 flex-1 flex-col overflow-hidden";

  const asideClass = isPage
    ? "z-30 flex w-[3.25rem] shrink-0 flex-col items-center gap-2 border-l border-slate-200 bg-white px-1 py-4 lg:sticky lg:top-[120px] lg:self-start lg:h-[calc(100vh-120px)] lg:overflow-y-auto"
    : "z-30 flex w-[3.25rem] shrink-0 flex-col items-center gap-2 overflow-y-auto overscroll-contain border-l border-slate-200 bg-white px-1 py-4 lg:sticky lg:top-0 lg:self-start lg:h-full";

  const footerClass = isPage
    ? "sticky bottom-0 z-50 flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.08)]"
    : "mt-auto flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4";

  const headerShellClass = [
    "shrink-0 border-b border-slate-200 bg-white",
    stickyHeader ? "sticky top-0 z-40" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const saveButton = showSaveButton ? (
    <button
      type="submit"
      disabled={saving || saveDisabled}
      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
    >
      <Save className="h-4 w-4" strokeWidth={2} aria-hidden />
      {saving ? "Zapisywanie…" : saveLabel}
    </button>
  ) : null;

  const shell = (
    <form onSubmit={onSubmit} className={formShellClass}>
      {headerPrefix}

      <div className={headerShellClass}>
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <div className="border-b border-slate-100 px-4 py-2.5 sm:px-6 lg:px-8">
            <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-500" aria-label="Breadcrumb">
              {breadcrumbs.map((crumb, idx) => (
                <span key={`${crumb.label}-${idx}`} className="inline-flex items-center gap-1">
                  {idx > 0 ? <span className="text-slate-300">/</span> : null}
                  {crumb.href || crumb.onClick ? (
                    crumb.href ? (
                      <a href={crumb.href} className="hover:text-blue-600">
                        {crumb.label}
                      </a>
                    ) : (
                      <button type="button" onClick={crumb.onClick} className="hover:text-blue-600">
                        {crumb.label}
                      </button>
                    )
                  ) : (
                    <span className="font-medium text-slate-900">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          </div>
        ) : null}

        <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:gap-6 lg:px-8 lg:py-6">
          <div className="flex min-w-0 flex-1 gap-4 sm:gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white sm:h-24 sm:w-24">
              {imageUrl?.trim() ? (
                <img src={imageUrl.trim()} alt={imageAlt} className="max-h-full max-w-full object-contain p-1" />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white">
                  <span className="text-[10px] font-medium text-slate-400">Brak zdjęcia</span>
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 py-0.5">
              {modernHero ? (
                <>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {productIdentifiers?.tenantLabel ? (
                      <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                        {productIdentifiers.tenantLabel}
                      </span>
                    ) : null}
                    {productIdentifiers?.productId != null ? (
                      <span className="inline-flex items-center gap-1 text-sm text-slate-500">
                        ID: {productIdentifiers.productId}
                      </span>
                    ) : null}
                    {titleBadge}
                  </div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-slate-400">SKU:</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-slate-800">
                        {(productIdentifiers?.sku ?? "").trim() || "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-slate-400">EAN:</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-slate-800">
                        {(productIdentifiers?.ean ?? "").trim() || "—"}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {!hideModeLabel && modeLabel ? (
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{modeLabel}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
                    {titleBadge}
                  </div>
                  {metaChips.length > 0 ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                      {metaChips.map((chip) => {
                        const v = chip.variant ?? "default";
                        return (
                          <div key={chip.label} className={productLikeMetaChipClass(v)} title={chip.title}>
                            <span className={productLikeMetaChipLabelClass(v)}>{chip.label}:</span>
                            <span className={productLikeMetaChipValueClass(v)}>{chip.value}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:items-start lg:flex-col lg:items-end">
            {modernHero && statCards ? (
              <div className="flex flex-wrap gap-2 sm:justify-end lg:justify-start">
                {statCards.map((card) => (
                  <StatCard key={card.label} card={card} />
                ))}
              </div>
            ) : null}
            <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 pt-3 sm:border-t-0 sm:pt-0 lg:justify-end">
              {headerActions}
              {saveInHeader ? saveButton : null}
            </div>
          </div>
        </div>

        {!hideTabs ? (
          <div className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 sm:px-6 lg:px-8 [-webkit-overflow-scrolling:touch]">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={productLikeTabBtnClass(active, showTabIcons)}
                  onClick={() => onTabChange(tab.id)}
                >
                  {showTabIcons ? <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden /> : null}
                  {tab.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {loadError ? (
        <div className="shrink-0 border-b border-red-100 bg-red-50 px-6 py-2 text-sm text-red-800">{loadError}</div>
      ) : null}

      <div className={bodyRowClass}>
        <div className="contents">
          <div className={mainColClass}>
            <div className={isPage ? productLikeTabPanelPaddingClass : `overflow-y-auto ${productLikeTabPanelPaddingClass}`}>
              {children}
            </div>
          </div>
          {showRail ? (
            <aside className={asideClass} aria-label="Szybki dostęp">
              <nav className="flex flex-col items-center gap-2" role="group">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      title={tab.label}
                      className={productLikeRailBtnClass(activeTab === tab.id)}
                      onClick={() => onTabChange(tab.id)}
                    >
                      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.5} aria-hidden />
                    </button>
                  );
                })}
              </nav>
            </aside>
          ) : null}
        </div>
      </div>

      {!saveInHeader && (footerExtra || showSaveButton) ? (
        <div className={footerClass}>
          {footerExtra}
          {showSaveButton ? (
            <button
              type="submit"
              disabled={saving || saveDisabled}
              className="rounded bg-slate-900 px-8 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Zapisywanie…" : saveLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {trailing}
    </form>
  );

  if (isPage) {
    return shell;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onModalClose}
    >
      <div
        className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {shell}
      </div>
    </div>
  );
}
