import type { FormEvent, ReactNode, RefObject } from "react";
import { Copy, ImageUp, Trash2 } from "lucide-react";

import {
  CatalogEntityPageShell,
  ProductLikePageLayout,
  type ProductLikeBreadcrumb,
  type ProductLikeStatCard,
  type ProductLikeTab,
} from "../../../components/catalog";

type Props<T extends string> = {
  isNew: boolean;
  title: string;
  imageUrl: string | null;
  sku?: string;
  breadcrumbs: ProductLikeBreadcrumb[];
  tabs: ProductLikeTab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  saving: boolean;
  loadErr: string | null;
  uploadBusy: boolean;
  headerInputRef: RefObject<HTMLInputElement | null>;
  onImageFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: FormEvent) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  duplicateBusy?: boolean;
  saveLabel?: string;
  statCards?: ProductLikeStatCard[];
  children: ReactNode;
};

export function WarehouseMaterialEditLayout<T extends string>({
  isNew,
  title,
  imageUrl,
  sku,
  breadcrumbs,
  tabs,
  activeTab,
  onTabChange,
  saving,
  loadErr,
  uploadBusy,
  headerInputRef,
  onImageFile,
  onSubmit,
  onDelete,
  onDuplicate,
  duplicateBusy = false,
  saveLabel,
  statCards,
  children,
}: Props<T>) {
  const headerActions = (
    <>
      {!isNew && onDuplicate ? (
        <button
          type="button"
          title="Duplikuj"
          disabled={duplicateBusy}
          onClick={onDuplicate}
          className="flex items-center justify-center rounded border border-slate-300 bg-white p-2 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
        >
          <Copy className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      ) : null}
      {!isNew && onDelete ? (
        <button
          type="button"
          title="Usuń"
          onClick={onDelete}
          className="flex items-center justify-center rounded border border-red-200 bg-white p-2 text-red-600 shadow-sm transition-colors hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        title={uploadBusy ? "Wgrywanie…" : "Wgraj zdjęcie"}
        disabled={uploadBusy}
        onClick={() => headerInputRef.current?.click()}
        className="flex items-center justify-center rounded border border-slate-300 bg-white p-2 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
      >
        <ImageUp className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
    </>
  );

  return (
    <CatalogEntityPageShell>
      <ProductLikePageLayout
        variant="page"
        stickyHeader={false}
        hideVerticalRail
        showTabIcons
        saveInHeader
        hideModeLabel
        modeLabel={isNew ? "Nowy" : "Edycja"}
        title={title}
        imageUrl={imageUrl}
        statCards={statCards}
        productIdentifiers={sku?.trim() ? { sku } : undefined}
        breadcrumbs={breadcrumbs}
        headerPrefix={
          <input
            ref={headerInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={onImageFile}
            disabled={uploadBusy}
          />
        }
        headerActions={headerActions}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onSubmit={onSubmit}
        saving={saving}
        saveLabel={saveLabel ?? (isNew ? "Utwórz" : "Zapisz")}
        loadError={loadErr}
      >
        {children}
      </ProductLikePageLayout>
    </CatalogEntityPageShell>
  );
}
