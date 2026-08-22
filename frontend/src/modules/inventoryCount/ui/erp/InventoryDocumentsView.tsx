import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { InventoryDocumentRead } from "@/api/inventoryCountApi";
import { AppEmptyState } from "@/components/app-shell";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  ModuleListPageToolbar,
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListTheadClass,
  moduleTableCardClass,
  moduleTablePaginationFooterClass,
} from "@/components/listPage/moduleList";
import { listSellasistInputClass } from "@/components/listPage/listSellasistTokens";
import { DEFAULT_PAGE_SIZE_OPTIONS } from "@/components/table/DataTablePageSizeSelect";
import { primaryButtonClassName } from "@/design-system";
import {
  buildInventoryDocumentsListViewAdapter,
  listViewActionsFromHook,
  useListViewState,
} from "@/preferences/listView";
import {
  countActiveInventoryDocumentFilters,
  filterInventoryDocuments,
  inventoryDocumentListFilterLabel,
} from "../../inventoryCountDocumentListFilters";
import { erpInventoryCountPaths } from "../../inventoryCountPaths";
import { inventoryTypeLabel } from "../../inventoryCountUiLabels";
import { InventoryDocumentRowActions } from "./InventoryDocumentRowActions";
import { InventoryDocumentStatusBadge } from "./InventoryDocumentStatusBadge";
import { InventoryDocumentsFiltersPanel } from "./InventoryDocumentsFiltersPanel";

type Props = {
  documents: InventoryDocumentRead[];
  loading?: boolean;
  deleteBusyId?: number | null;
  onDeleteDraft?: (doc: InventoryDocumentRead) => void | Promise<void>;
  onDuplicate?: (doc: InventoryDocumentRead) => void | Promise<void>;
  onExport?: (doc: InventoryDocumentRead) => void;
};

function pageWindow(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const start = Math.max(1, Math.min(current - 2, total - 4));
  return Array.from({ length: 5 }, (_, i) => start + i).filter((n) => n >= 1 && n <= total);
}

/** Documents list — ModuleList toolbar + tabela + paginacja (wzorzec list Sasist). */
export default function InventoryDocumentsView({
  documents,
  loading,
  deleteBusyId = null,
  onDeleteDraft,
  onDuplicate,
  onExport,
}: Props) {
  const tenantId = 1;
  const listViewAdapter = useMemo(() => buildInventoryDocumentsListViewAdapter(tenantId), [tenantId]);
  const listView = useListViewState(listViewAdapter);
  const listViewActions = useMemo(() => listViewActionsFromHook(listView), [listView]);
  const {
    draftFilters,
    setDraftFilters,
    appliedFilters,
    applyFilters,
    clearFilters,
    filtersExpanded,
    toggleFiltersPanel,
    page,
    setPage,
    pageSize,
    setPageSize,
  } = listView;

  const openFilterFieldsRef = useRef<(() => void) | null>(null);
  const [confirmDoc, setConfirmDoc] = useState<InventoryDocumentRead | null>(null);

  const filtered = useMemo(() => {
    const sorted = [...documents].sort(
      (a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime(),
    );
    return filterInventoryDocuments(sorted, appliedFilters);
  }, [documents, appliedFilters]);

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages, setPage]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const startRow = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, totalCount);
  const pageNumbers = pageWindow(page, totalPages);
  const activeFilterCount = countActiveInventoryDocumentFilters(appliedFilters);

  const handleConfirmDelete = async () => {
    if (!confirmDoc || !onDeleteDraft) return;
    await onDeleteDraft(confirmDoc);
    setConfirmDoc(null);
  };

  return (
    <div className="space-y-4">
      {confirmDoc ? (
        <ConfirmModal
          title="Usunąć wersję roboczą?"
          message={
            <>
              <p>
                Dokument <span className="font-semibold text-slate-900">{confirmDoc.number}</span> zostanie trwale
                usunięty.
              </p>
              <p className="mt-2 text-slate-600">
                Ustawienia kreatora, zakres i notatki zostaną utracone. Tej operacji nie można cofnąć.
              </p>
            </>
          }
          confirmLabel="Usuń wersję roboczą"
          confirmTone="danger"
          pending={deleteBusyId === confirmDoc.id}
          onCancel={() => {
            if (deleteBusyId !== confirmDoc.id) setConfirmDoc(null);
          }}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}

      <ModuleListPageToolbar
        title="Dokumenty inwentaryzacji"
        resultCount={loading ? undefined : filtered.length}
        loading={loading}
        activeFilterLabel={
          activeFilterCount > 0
            ? `${inventoryDocumentListFilterLabel(appliedFilters)} (${activeFilterCount})`
            : inventoryDocumentListFilterLabel(appliedFilters)
        }
        filtersExpanded={filtersExpanded}
        onToggleFilters={toggleFiltersPanel}
        openFilterFieldsRef={openFilterFieldsRef}
        showFilterFieldsButton={false}
        columnsDisabled
        filtersToggleLabelCollapsed="Filtry"
        filtersToggleLabelExpanded="Ukryj filtry"
      />

      <InventoryDocumentsFiltersPanel
        expanded={filtersExpanded}
        draft={draftFilters}
        onChange={setDraftFilters}
        onApply={() => {
          applyFilters();
          setPage(1);
        }}
        onClear={() => {
          clearFilters();
          setPage(1);
        }}
        listView={listViewActions}
      />

      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : filtered.length === 0 ? (
        <AppEmptyState
          title="Brak dokumentów"
          description={
            documents.length === 0
              ? "Utwórz nową inwentaryzację, aby rozpocząć."
              : "Brak dokumentów spełniających kryteria filtrów."
          }
          action={
            documents.length === 0 ? (
              <Link to={erpInventoryCountPaths.wizard} className={primaryButtonClassName("", "compact")}>
                + Nowa inwentaryzacja
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className={moduleTableCardClass}>
          <div className={moduleListTableScrollClass}>
            <table className={moduleListTableClass} style={{ minWidth: 720 }}>
              <thead className={moduleListTheadClass}>
                <tr>
                  <th className={moduleListThClass}>Numer</th>
                  <th className={moduleListThClass}>Typ</th>
                  <th className={moduleListThClass}>Status</th>
                  <th className={`${moduleListThClass} text-right`}>Pokrycie</th>
                  <th className={`${moduleListThClass} text-right`}>Różnice</th>
                  <th className={`${moduleListThClass} text-center`}>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((doc) => (
                  <tr key={doc.id} className="group border-b border-slate-100 transition-colors hover:bg-slate-50/70">
                    <td className={moduleListTdClass}>
                      <Link
                        to={erpInventoryCountPaths.document(doc.id)}
                        className="font-medium text-slate-900 hover:text-orange-600 hover:underline"
                      >
                        {doc.number}
                      </Link>
                      {doc.title ? <div className="mt-0.5 text-xs text-slate-500">{doc.title}</div> : null}
                    </td>
                    <td className={`${moduleListTdClass} text-slate-700`}>{inventoryTypeLabel(doc.inventory_type)}</td>
                    <td className={moduleListTdClass}>
                      <InventoryDocumentStatusBadge status={doc.status} />
                    </td>
                    <td className={`${moduleListTdClass} text-right font-medium tabular-nums`}>
                      {doc.coverage_percent}%
                    </td>
                    <td className={`${moduleListTdClass} text-right font-medium tabular-nums`}>
                      {doc.difference_lines}
                    </td>
                    <td className={`${moduleListTdClass} text-center`} onClick={(e) => e.stopPropagation()}>
                      <InventoryDocumentRowActions
                        doc={doc}
                        deleteBusy={deleteBusyId === doc.id}
                        onDelete={onDeleteDraft ? (d) => setConfirmDoc(d) : undefined}
                        onDuplicate={onDuplicate}
                        onExport={onExport}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`${moduleTablePaginationFooterClass} px-4`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium tabular-nums text-slate-600">
                {startRow}–{endRow} z {totalCount}
              </span>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                Na stronę
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className={`${listSellasistInputClass} !h-8 w-auto min-w-[4rem] py-0 pr-7 text-sm`}
                >
                  {DEFAULT_PAGE_SIZE_OPTIONS.filter((n) => n <= 100).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(Math.max(1, page - 1))}
                className="rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40"
              >
                Poprzednia
              </button>
              {pageNumbers.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={`min-w-[2rem] rounded-md px-1.5 py-1 text-sm font-semibold tabular-nums ${
                    n === page ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-200/60"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                className="rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40"
              >
                Następna
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
