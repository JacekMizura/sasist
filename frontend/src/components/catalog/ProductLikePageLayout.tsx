import type { FormEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import {
  productLikeFormNumberReset,
  productLikeMetaChipClass,
  productLikeMetaChipLabelClass,
  productLikeMetaChipValueClass,
  productLikeRailBtnClass,
  productLikeTabBtnClass,
  productLikeTabPanelPaddingClass,
} from "./productLikeTokens";

export type ProductLikeMetaChip = {
  label: string;
  value: ReactNode;
  variant?: "default" | "blue" | "emerald" | "amber";
  title?: string;
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
  loadError?: ReactNode;
  footerExtra?: ReactNode;
  trailing?: ReactNode;
};

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
  loadError,
  footerExtra,
  trailing,
}: ProductLikePageLayoutProps<T>) {
  const isPage = variant === "page";

  const formShellClass = isPage
    ? `flex flex-col bg-white ${productLikeFormNumberReset}`
    : `flex min-h-0 flex-1 flex-col overflow-hidden bg-white ${productLikeFormNumberReset}`;

  const bodyRowClass = isPage
    ? "flex w-full flex-col lg:flex-row lg:items-stretch"
    : "flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row lg:items-stretch";

  const mainColClass = isPage
    ? "flex min-w-0 flex-1 flex-col pb-8"
    : "flex min-w-0 flex-1 flex-col overflow-hidden";

  const asideClass = isPage
    ? "z-30 flex w-[3.25rem] shrink-0 flex-col items-center gap-2 border-l border-slate-200 bg-white px-1 py-4 lg:sticky lg:top-[120px] lg:self-start lg:h-[calc(100vh-120px)] lg:overflow-y-auto"
    : "z-30 flex w-[3.25rem] shrink-0 flex-col items-center gap-2 overflow-y-auto overscroll-contain border-l border-slate-200 bg-white px-1 py-4 lg:sticky lg:top-0 lg:self-start lg:h-full";

  const footerClass = isPage
    ? "sticky bottom-0 z-50 flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.08)]"
    : "mt-auto flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4";

  const shell = (
    <>
      {headerPrefix}
      <div className="sticky top-0 z-40 shrink-0 border-b border-slate-200 bg-white">
        <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:gap-6 lg:px-8">
          <div className="flex min-w-0 flex-1 gap-6">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden bg-white sm:h-24 sm:w-24">
              {imageUrl?.trim() ? (
                <img src={imageUrl.trim()} alt={imageAlt} className="max-h-full max-w-full object-contain" />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
                  <span className="text-[10px] font-medium text-slate-400">Brak zdjęcia</span>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 py-1">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{modeLabel}</p>
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
            </div>
          </div>
          {headerActions ? (
            <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 pt-4 lg:border-t-0 lg:pt-0">
              {headerActions}
            </div>
          ) : null}
        </div>

        <div className="flex gap-8 overflow-x-auto border-t border-slate-100 px-4 sm:px-6 lg:px-8 [-webkit-overflow-scrolling:touch]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={productLikeTabBtnClass(activeTab === tab.id)}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loadError ? (
        <div className="shrink-0 border-b border-red-100 bg-red-50 px-6 py-2 text-sm text-red-800">{loadError}</div>
      ) : null}

      <form onSubmit={onSubmit} className={formShellClass}>
        <div className={bodyRowClass}>
          <div className="contents">
            <div className={mainColClass}>
              <div className={isPage ? productLikeTabPanelPaddingClass : `overflow-y-auto ${productLikeTabPanelPaddingClass}`}>
                {children}
              </div>
            </div>
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
          </div>
        </div>

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
      </form>

      {trailing}
    </>
  );

  if (isPage) {
    return <div className="w-full min-w-0 bg-white">{shell}</div>;
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
