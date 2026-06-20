import { ChevronDown, Filter } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { InventoryDocumentRead } from "@/api/inventoryCountApi";
import { AppEmptyState } from "@/components/app-shell";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  productsListActionsCellClass,
  productsListActionsInnerClass,
  productsListActionsThClass,
} from "@/components/products/productList/productsListTableTokens";
import {
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListTheadClass,
  moduleTableCardClass,
} from "@/components/listPage/moduleList";
import {
  listSellasistToolbarToggleBtn,
} from "@/components/listPage/listSellasistTokens";
import {
  DEFAULT_INVENTORY_DOCUMENT_LIST_FILTERS,
  countActiveInventoryDocumentFilters,
  filterInventoryDocuments,
  inventoryDocumentListFilterLabel,
  type InventoryDocumentListFilters,
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

/** Documents list — filtry + tabela modułowa. */
export default function InventoryDocumentsView({
  documents,
  loading,
  deleteBusyId = null,
  onDeleteDraft,
  onDuplicate,
  onExport,
}: Props) {
  const [confirmDoc, setConfirmDoc] = useState<InventoryDocumentRead | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    try {
      return localStorage.getItem("inventory-count.documents.filtersExpanded") === "1";
    } catch {
      return false;
    }
  });
  const [draftFilters, setDraftFilters] = useState<InventoryDocumentListFilters>(
    DEFAULT_INVENTORY_DOCUMENT_LIST_FILTERS,
  );
  const [appliedFilters, setAppliedFilters] = useState<InventoryDocumentListFilters>(
    DEFAULT_INVENTORY_DOCUMENT_LIST_FILTERS,
  );

  const filtered = useMemo(() => {
    const sorted = [...documents].sort(
      (a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime(),
    );
    return filterInventoryDocuments(sorted, appliedFilters);
  }, [documents, appliedFilters]);

  const activeFilterCount = countActiveInventoryDocumentFilters(appliedFilters);

  const handleConfirmDelete = async () => {
    if (!confirmDoc || !onDeleteDraft) return;
    await onDeleteDraft(confirmDoc);
    setConfirmDoc(null);
  };

  const toggleFilters = () => {
    setFiltersExpanded((v) => {
      const next = !v;
      try {
        localStorage.setItem("inventory-count.documents.filtersExpanded", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
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

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Dokumenty inwentaryzacji
            {!loading ? (
              <span className="ml-2 text-base font-normal text-slate-400">{filtered.length} wyników</span>
            ) : null}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Wybrany filtr:{" "}
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-0.5 text-sm font-medium text-slate-800">
              {inventoryDocumentListFilterLabel(appliedFilters)}
            </span>
            {activeFilterCount > 0 ? (
              <span className="ml-2 text-xs text-amber-700">({activeFilterCount} aktywne)</span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleFilters}
          className={`${listSellasistToolbarToggleBtn} inline-flex !h-10 items-center gap-2`}
          aria-expanded={filtersExpanded}
        >
          <Filter className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          {filtersExpanded ? "Ukryj filtry" : "Filtry"}
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      <InventoryDocumentsFiltersPanel
        expanded={filtersExpanded}
        draft={draftFilters}
        onChange={setDraftFilters}
        onApply={() => setAppliedFilters({ ...draftFilters })}
        onClear={() => {
          setDraftFilters(DEFAULT_INVENTORY_DOCUMENT_LIST_FILTERS);
          setAppliedFilters(DEFAULT_INVENTORY_DOCUMENT_LIST_FILTERS);
        }}
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
              <Link to={erpInventoryCountPaths.wizard} className="text-sm font-semibold text-amber-700 hover:underline">
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
                  <th className={productsListActionsThClass}>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc) => (
                  <tr key={doc.id} className="group border-b border-slate-100 transition-colors hover:bg-slate-50/70">
                    <td className={moduleListTdClass}>
                      <Link
                        to={erpInventoryCountPaths.document(doc.id)}
                        className="font-medium text-slate-900 hover:text-amber-700 hover:underline"
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
                    <td className={productsListActionsCellClass} onClick={(e) => e.stopPropagation()}>
                      <div className={productsListActionsInnerClass}>
                        <InventoryDocumentRowActions
                          doc={doc}
                          deleteBusy={deleteBusyId === doc.id}
                          onDelete={onDeleteDraft ? (d) => setConfirmDoc(d) : undefined}
                          onDuplicate={onDuplicate}
                          onExport={onExport}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
