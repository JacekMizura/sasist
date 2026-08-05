import type { FormEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Save } from "lucide-react";

import { PrimaryButton } from "../../design-system/PrimaryButton";
import {
  productLikeFormNumberReset,
  productLikeMetaChipClass,
  productLikeMetaChipLabelClass,
  productLikeMetaChipValueClass,
  productLikeRailBtnClass,
  productLikeTabBtnClass,
  productLikeTabPanelPaddingClass,
  productLikeTabsNavClass,
} from "./productLikeTokens";
import { AppOverlayPortal } from "../../components/overlay";

export type ProductLikeMetaChip = {
  label: string;
  value: ReactNode;
  variant?: "default" | "blue" | "emerald" | "amber";
  title?: string;
};

export type ProductLikeStatCard = {
  label: string;
  value: ReactNode;
  /** Optional unit suffix shown next to the value (e.g. szt., zł). */
  unit?: string;
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

function ModernStat({ card, withDivider }: { card: ProductLikeStatCard; withDivider: boolean }) {
  const variant = card.variant ?? "slate";
  const valueColor =
    variant === "green"
      ? "text-emerald-600"
      : variant === "orange"
        ? "text-orange-600"
        : variant === "blue"
          ? "text-slate-900"
          : "text-slate-900";
  return (
    <div
      className={`flex flex-col justify-start text-right sm:text-left ${
        withDivider ? "border-l border-slate-200 pl-4 sm:pl-8" : ""
      }`}
    >
      <span className="mb-1 flex items-center text-xs font-medium uppercase tracking-wider text-slate-500">
        {card.label}
      </span>
      <div className={`text-2xl font-bold leading-none tabular-nums ${valueColor}`}>
        {card.value}
        {card.unit ? <span className="ml-1 text-sm font-medium text-slate-500">{card.unit}</span> : null}
      </div>
      {card.subValue ? <div className="mt-1 text-[11px] font-medium text-slate-400">{card.subValue}</div> : null}
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
  const topToolbarSticky = isPage && saveInHeader;

  const formShellClass = isPage
    ? `flex w-full min-h-full flex-1 flex-col bg-white ${productLikeFormNumberReset}`
    : `flex min-h-0 flex-1 flex-col overflow-hidden bg-white ${productLikeFormNumberReset}`;

  const bodyRowClass = isPage
    ? "flex w-full min-w-0 flex-1 flex-col lg:flex-row lg:items-start"
    : "flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row lg:items-stretch";

  const mainColClass = isPage
    ? "flex w-full min-w-0 flex-1 flex-col"
    : "flex min-w-0 flex-1 flex-col overflow-hidden";

  const asideClass = isPage
    ? "z-30 flex w-[3.25rem] shrink-0 flex-col items-center gap-2 border-l border-slate-200 bg-white px-1 py-4 lg:sticky lg:top-[120px] lg:self-start lg:h-[calc(100vh-120px)] lg:overflow-y-auto"
    : "z-30 flex w-[3.25rem] shrink-0 flex-col items-center gap-2 overflow-y-auto overscroll-contain border-l border-slate-200 bg-white px-1 py-4 lg:sticky lg:top-0 lg:self-start lg:h-full";

  const footerClass = isPage
    ? "sticky bottom-0 z-50 flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.08)]"
    : "mt-auto flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4";

  const headerShellClass = [
    "shrink-0 border-b border-slate-200 bg-white",
    stickyHeader && !topToolbarSticky ? "sticky top-0 z-40" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const breadcrumbNav =
    breadcrumbs && breadcrumbs.length > 0 ? (
      <nav className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-slate-500" aria-label="Breadcrumb">
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
    ) : null;

  const saveButton = showSaveButton ? (
    <PrimaryButton type="submit" disabled={saving || saveDisabled}>
      <Save className="h-4 w-4" strokeWidth={2} aria-hidden />
      {saving ? "Zapisywanie…" : saveLabel}
    </PrimaryButton>
  ) : null;

  const headerActionCluster =
    headerActions || (saveInHeader && saveButton) ? (
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {headerActions}
        {saveInHeader ? saveButton : null}
      </div>
    ) : null;

  const shell = (
    <form onSubmit={onSubmit} className={formShellClass}>
      {headerPrefix}

      {topToolbarSticky && (breadcrumbNav || headerActionCluster) ? (
        <div className="sticky top-0 z-50 flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
            {breadcrumbNav}
            {title.trim() ? (
              <span className="hidden min-w-0 truncate text-sm font-semibold text-slate-900 lg:inline" title={title}>
                {title}
              </span>
            ) : null}
          </div>
          {headerActionCluster}
        </div>
      ) : null}

      <div className={headerShellClass}>
        {!topToolbarSticky && breadcrumbNav ? (
          <div className="border-b border-slate-100 px-4 py-2.5 sm:px-6 lg:px-8">{breadcrumbNav}</div>
        ) : null}

        <div
          className={
            modernHero
              ? "flex flex-col justify-between gap-6 px-4 pb-4 pt-5 sm:px-6 lg:flex-row lg:items-center lg:gap-8 lg:px-8 lg:pt-6"
              : "flex flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:gap-6 lg:px-8 lg:py-6"
          }
        >
          <div className={`flex min-w-0 items-center gap-5 ${modernHero ? "lg:w-1/2" : "flex-1"}`}>
            <div
              className={
                modernHero
                  ? "h-20 w-20 shrink-0 sm:h-24 sm:w-24"
                  : "flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white sm:h-24 sm:w-24"
              }
            >
              {imageUrl?.trim() ? (
                <img
                  src={imageUrl.trim()}
                  alt={imageAlt}
                  className={`max-h-full max-w-full object-contain ${modernHero ? "h-full w-full rounded-lg" : "p-1"}`}
                />
              ) : (
                <div
                  className={`flex h-full w-full items-center justify-center bg-white ${
                    modernHero
                      ? "rounded-lg border border-dashed border-slate-300"
                      : "rounded-xl border border-dashed border-slate-300"
                  }`}
                >
                  <span className="text-[10px] font-medium text-slate-400">Brak zdjęcia</span>
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 py-0.5">
              {modernHero ? (
                <>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    {productIdentifiers?.tenantLabel ? (
                      <span className="inline-flex items-center rounded border border-blue-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                        {productIdentifiers.tenantLabel}
                      </span>
                    ) : null}
                    {productIdentifiers?.productId != null ? (
                      <span className="rounded border border-slate-200 px-2 py-0.5 font-mono text-xs text-slate-500">
                        ID: {productIdentifiers.productId}
                      </span>
                    ) : null}
                    {titleBadge}
                  </div>
                  <h1 className="mb-2 text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
                    {title}
                  </h1>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                    <div className="flex items-baseline">
                      <span className="mr-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">SKU:</span>
                      <span className="font-mono font-medium text-slate-900">
                        {(productIdentifiers?.sku ?? "").trim() || "—"}
                      </span>
                    </div>
                    <div className="flex items-baseline">
                      <span className="mr-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">EAN:</span>
                      <span className="font-mono font-medium text-slate-900">
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

          {modernHero && statCards ? (
            <div className="flex shrink-0 flex-wrap items-center gap-8 sm:flex-nowrap sm:justify-end lg:w-1/2 lg:justify-end">
              {statCards.map((card, idx) => (
                <ModernStat key={card.label} card={card} withDivider={idx > 0} />
              ))}
            </div>
          ) : !saveInHeader && (headerActions || showSaveButton) ? (
            <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 pt-3 sm:border-t-0 sm:pt-0 lg:justify-end">
              {headerActions}
              {!saveInHeader && showSaveButton ? saveButton : null}
            </div>
          ) : null}
        </div>

        {!hideTabs ? (
          <div className={productLikeTabsNavClass} role="tablist">
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
            <div
              className={
                isPage
                  ? "w-full px-4 pt-6 pb-4 sm:px-6 sm:pt-8 sm:pb-5 lg:px-8"
                  : `overflow-y-auto ${productLikeTabPanelPaddingClass}`
              }
            >
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
          {showSaveButton ? saveButton : null}
        </div>
      ) : null}

      {trailing}
    </form>
  );

  if (isPage) {
    return shell;
  }

  return (
    <AppOverlayPortal>
    <div
      className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onModalClose}
    >
      <div
        className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {shell}
      </div>
    </div>
    </AppOverlayPortal>
  );
}
