import { Download, FileSpreadsheet, Loader2, Pencil, ShieldCheck } from "lucide-react";

import { downloadInventoryAuditPackageBlob, downloadInventoryReportBlob } from "@/api/inventoryCountApi";
import { filterInputClass } from "@/components/filters";
import type { InventoryDocumentDetailState } from "@/modules/inventoryCount/hooks/useInventoryDocumentDetail";
import type { InventoryDocTab } from "@/modules/inventoryCount/hooks/useInventoryDocumentDetail";
import { VALUATION_HELP_TEXT } from "@/modules/inventoryCount/inventoryScopePresets";
import {
  inventoryCountModeLabel,
  inventoryMovementPolicyLabel,
  inventoryResultPolicyLabel,
  inventoryScopeModeLabel,
  inventoryTypeLabel,
} from "@/modules/inventoryCount/inventoryCountUiLabels";
import InventoryApprovalSummaryModal from "./InventoryApprovalSummaryModal";
import InventoryAuditPanel from "./InventoryAuditPanel";
import InventoryConflictPanel from "./InventoryConflictPanel";
import InventoryLineTable from "./InventoryLineTable";
import InventoryTableFilterBar from "./InventoryTableFilterBar";
import InventoryUnknownProductsPanel from "./InventoryUnknownProductsPanel";
import InventoryStatusBadge from "./InventoryStatusBadge";
import {
  erpKpiCard,
  erpKpiLabel,
  erpKpiValue,
  erpPageShell,
  erpSectionHeader,
  erpSurfaceCard,
  erpTabIndicator,
  erpTabLink,
  erpTableScroll,
  erpTableWrap,
} from "./theme";

type Props = {
  state: InventoryDocumentDetailState;
  warehouseName?: string;
};

const DETAIL_TABS: { key: InventoryDocTab; label: string }[] = [
  { key: "progress", label: "Przebieg" },
  { key: "differences", label: "Różnice" },
  { key: "control", label: "Kontrola" },
];

/** Document detail — standard ERP page body (module shell in {@link InventoryLayout}). */
export default function InventoryDocumentDetailView({ state, warehouseName }: Props) {
  const {
    doc,
    analysis,
    tab,
    showUncounted,
    setShowUncounted,
    changeTab,
    tableFilters,
    updateFilters,
    filteredLines,
    linesLoading,
    conflicts,
    conflictsLoading,
    conflictsError,
    reloadConflicts,
    conflictBusy,
    acceptConflictCount,
    rejectConflictCount,
    requestConflictRecount,
    unknownProducts,
    unknownLoading,
    opsPreview,
    auditLog,
    timelines,
    busy,
    downloadBusy,
    editingTitle,
    setEditingTitle,
    titleDraft,
    setTitleDraft,
    notesDraft,
    setNotesDraft,
    saveTitle,
    startEditTitle,
    approvalOpen,
    setApprovalOpen,
    approvalMode,
    approvalPreview,
    approvalPreviewLoading,
    openApprovalModal,
    confirmApprovalAction,
    actionReject,
    runDownload,
    refreshAfterUnknownChange,
    derived,
    documentId,
    tenantId,
  } = state;

  if (!doc) return null;

  const {
    submitReady,
    submitHint,
    updatesStock,
    scopeMode,
    movementPolicy,
    conflictCount,
    surplus,
    shortage,
    hasValueBreakdown,
    resultPolicy,
  } = derived;

  return (
    <div className={erpPageShell}>
      <InventoryApprovalSummaryModal
        open={approvalOpen}
        mode={approvalMode}
        preview={approvalPreview}
        loading={approvalPreviewLoading}
        busy={busy}
        onConfirm={() => void confirmApprovalAction()}
        onCancel={() => setApprovalOpen(false)}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dokument inwentaryzacji</p>
          {editingTitle ? (
            <div className="mt-2 max-w-lg space-y-3">
              <input
                className={filterInputClass}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                placeholder="Tytuł inwentaryzacji…"
              />
              <textarea
                className={`${filterInputClass} resize-none`}
                rows={2}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Opis / notatka…"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveTitle()}
                  className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Zapisz
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTitle(false)}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Anuluj
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-1 flex items-start gap-2">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{doc.title?.trim() || doc.number}</h2>
                <p className="font-mono text-xs text-slate-500">Nr systemowy: {doc.number}</p>
                {doc.notes ? <p className="mt-1 text-sm text-slate-600">{doc.notes}</p> : null}
              </div>
              {["draft", "planned", "in_progress", "awaiting_approval"].includes(doc.status) ? (
                <button
                  type="button"
                  title="Edytuj tytuł"
                  onClick={startEditTitle}
                  className="mt-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>{inventoryTypeLabel(doc.inventory_type)}</span>
            <InventoryStatusBadge status={doc.status} />
            <span className="tabular-nums">
              Pokrycie {doc.coverage_percent}% · {doc.counted_lines}/{doc.total_lines} poz.
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {doc.status === "in_progress" ? (
            <button
              type="button"
              disabled={busy || !submitReady}
              title={submitHint}
              onClick={() => void openApprovalModal("submit")}
              className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Wyślij do zatwierdzenia
            </button>
          ) : null}
          {doc.status === "awaiting_approval" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void openApprovalModal("approve")}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Zatwierdź
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void actionReject()}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                Odrzuć
              </button>
            </>
          ) : null}
          {doc.status === "approved" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void openApprovalModal("post")}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {updatesStock ? "Księguj RW/PW" : "Zakończ bez korekt stanów"}
            </button>
          ) : null}
        </div>
      </div>

      <div className={`${erpSurfaceCard} p-4`}>
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Magazyn", value: warehouseName ?? `#${doc.warehouse_id}` },
            { label: "Zakres", value: inventoryScopeModeLabel(scopeMode) },
            { label: "Liczenie", value: inventoryCountModeLabel(doc.count_mode) },
            { label: "Ruchy", value: inventoryMovementPolicyLabel(movementPolicy) },
            { label: "Wynik", value: inventoryResultPolicyLabel(resultPolicy) },
            { label: "Operatorzy", value: String(opsPreview?.operator_count ?? "—") },
          ].map((chip) => (
            <div key={chip.label}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{chip.label}</p>
              <p className="font-medium text-slate-900">{chip.value}</p>
            </div>
          ))}
        </div>
      </div>

      {analysis ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          <div className={erpKpiCard}>
            <p className={erpKpiLabel}>Pozycje z różnicą</p>
            <p className={erpKpiValue}>{doc.difference_lines}</p>
          </div>
          <div className={erpKpiCard}>
            <p className={erpKpiLabel}>Konflikty liczenia</p>
            <p className={erpKpiValue}>{conflictCount}</p>
          </div>
          {hasValueBreakdown ? (
            <>
              <div className={erpKpiCard} title={VALUATION_HELP_TEXT}>
                <p className={erpKpiLabel}>Wartość nadwyżek</p>
                <p className={erpKpiValue}>+{surplus.toLocaleString("pl-PL")} PLN</p>
              </div>
              <div className={erpKpiCard} title={VALUATION_HELP_TEXT}>
                <p className={erpKpiLabel}>Wartość braków</p>
                <p className={erpKpiValue}>−{shortage.toLocaleString("pl-PL")} PLN</p>
              </div>
            </>
          ) : (
            <div className={erpKpiCard}>
              <p className={erpKpiLabel}>Policzone</p>
              <p className={erpKpiValue}>
                {doc.counted_lines}/{doc.total_lines}
              </p>
            </div>
          )}
        </div>
      ) : null}

      {(conflicts?.items.length ?? 0) > 0 || conflictsLoading || conflictsError ? (
        <div className={`${erpSurfaceCard} overflow-hidden`}>
          <InventoryConflictPanel
            items={conflicts?.items ?? []}
            loading={conflictsLoading}
            error={conflictsError}
            onRetry={() => void reloadConflicts()}
            busy={conflictBusy}
            onAcceptCount={(c, countId) => void acceptConflictCount(c, countId)}
            onRejectCount={(c, countId) => void rejectConflictCount(c, countId)}
            onRequestRecount={(c) => void requestConflictRecount(c)}
          />
        </div>
      ) : null}

      {unknownProducts.length > 0 || unknownLoading ? (
        <div className={`${erpSurfaceCard} overflow-hidden`}>
          <InventoryUnknownProductsPanel
            tenantId={tenantId}
            items={unknownProducts}
            loading={unknownLoading}
            onChanged={refreshAfterUnknownChange}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <nav className="flex w-full gap-6 border-b border-slate-200" aria-label="Widok dokumentu inwentaryzacji">
          {DETAIL_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => changeTab(t.key)}
              className={erpTabLink(tab === t.key)}
            >
              {t.label}
              {tab === t.key ? <span className={erpTabIndicator} aria-hidden /> : null}
            </button>
          ))}
        </nav>
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:pb-1">
          <button
            type="button"
            disabled={downloadBusy != null}
            onClick={() => void runDownload("xlsx-diff", () => downloadInventoryReportBlob(tenantId, documentId, "differences", "xlsx"))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {downloadBusy === "xlsx-diff" ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="mr-1 inline h-3.5 w-3.5" />}
            Różnice XLSX
          </button>
          <button
            type="button"
            disabled={downloadBusy != null}
            onClick={() => void runDownload("pdf-sheet", () => downloadInventoryReportBlob(tenantId, documentId, "counting_sheet", "pdf"))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {downloadBusy === "pdf-sheet" ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />}
            Spis PDF
          </button>
          <button
            type="button"
            disabled={downloadBusy != null}
            onClick={() => void runDownload("audit-zip", () => downloadInventoryAuditPackageBlob(tenantId, documentId))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {downloadBusy === "audit-zip" ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 inline h-3.5 w-3.5" />}
            Pakiet kontroli ZIP
          </button>
        </div>
      </div>

      {tab === "control" ? (
        <div className={erpTableWrap}>
          <InventoryAuditPanel
            auditLog={auditLog?.items ?? []}
            timelines={timelines}
            filters={tableFilters}
            onFiltersChange={updateFilters}
          />
        </div>
      ) : (
        <div className={erpTableWrap}>
          <div className={`${erpSectionHeader} flex flex-wrap items-center justify-between gap-2`}>
            <span>
              {tab === "differences" ? "Pozycje z różnicą" : "Przebieg liczenia"}
            </span>
            {tab === "progress" ? (
              <label className="flex cursor-pointer items-center gap-2 text-xs normal-case tracking-normal text-slate-600">
                <input
                  type="checkbox"
                  checked={showUncounted}
                  onChange={(e) => setShowUncounted(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Pokaż niepoliczone
              </label>
            ) : null}
          </div>
          <div className="border-b border-slate-100 px-4 py-2">
            <InventoryTableFilterBar
              filters={tableFilters}
              onChange={updateFilters}
              showDifferenceToggle={tab === "progress"}
              showRecountToggle
              showUnknownToggle={tab === "progress"}
            />
          </div>
          <div className={erpTableScroll}>
            <InventoryLineTable
              lines={filteredLines}
              loading={linesLoading}
              emptyMessage={
                tab === "differences" ? "Brak różnic pasujących do filtrów." : "Brak pozycji pasujących do filtrów."
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
