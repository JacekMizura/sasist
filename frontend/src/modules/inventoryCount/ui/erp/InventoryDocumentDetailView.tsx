import { Download, FileSpreadsheet, Loader2, Pencil, ShieldCheck } from "lucide-react";

import { downloadInventoryAuditPackageBlob, downloadInventoryReportBlob } from "@/api/inventoryCountApi";
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

type Props = {
  state: InventoryDocumentDetailState;
  warehouseName?: string;
};

/** Document detail — mockup design system (same tokens as dashboard/documents). */
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

  const tabLink = (key: InventoryDocTab, label: string) => (
    <button
      type="button"
      onClick={() => changeTab(key)}
      className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
        tab === key
          ? "border-orange-500 text-slate-900"
          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="animate-in fade-in space-y-6 duration-300">
      <InventoryApprovalSummaryModal
        open={approvalOpen}
        mode={approvalMode}
        preview={approvalPreview}
        loading={approvalPreviewLoading}
        busy={busy}
        onConfirm={() => void confirmApprovalAction()}
        onCancel={() => setApprovalOpen(false)}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dokument inwentaryzacji</p>
          {editingTitle ? (
            <div className="mt-2 max-w-lg space-y-3">
              <input
                className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                placeholder="Tytuł inwentaryzacji…"
              />
              <textarea
                className="w-full resize-none rounded-md border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
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
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Zapisz
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTitle(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-900"
                >
                  Anuluj
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-1 flex items-start gap-2">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{doc.title?.trim() || doc.number}</h2>
                <p className="font-mono text-xs text-slate-400">Nr systemowy: {doc.number}</p>
                {doc.notes ? <p className="mt-1 text-sm text-slate-600">{doc.notes}</p> : null}
              </div>
              {["draft", "planned", "in_progress", "awaiting_approval"].includes(doc.status) ? (
                <button
                  type="button"
                  title="Edytuj tytuł"
                  onClick={startEditTitle}
                  className="mt-1 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
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

        <div className="flex flex-wrap gap-2">
          {doc.status === "in_progress" ? (
            <button
              type="button"
              disabled={busy || !submitReady}
              title={submitHint}
              onClick={() => void openApprovalModal("submit")}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
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
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Zatwierdź
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void actionReject()}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              {updatesStock ? "Księguj RW/PW" : "Zakończ bez korekt stanów"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Magazyn", value: warehouseName ?? `#${doc.warehouse_id}` },
            { label: "Zakres", value: inventoryScopeModeLabel(scopeMode) },
            { label: "Liczenie", value: inventoryCountModeLabel(doc.count_mode) },
            { label: "Ruchy", value: inventoryMovementPolicyLabel(movementPolicy) },
            { label: "Wynik", value: inventoryResultPolicyLabel(resultPolicy) },
            { label: "Operatorzy", value: String(opsPreview?.operator_count ?? "—") },
          ].map((chip) => (
            <div key={chip.label}>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{chip.label}</p>
              <p className="font-medium text-slate-900">{chip.value}</p>
            </div>
          ))}
        </div>
      </div>

      {analysis ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Pozycje z różnicą</p>
            <p className="text-2xl font-bold text-slate-900">{doc.difference_lines}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Konflikty liczenia</p>
            <p className="text-2xl font-bold text-slate-900">{conflictCount}</p>
          </div>
          {hasValueBreakdown ? (
            <>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" title={VALUATION_HELP_TEXT}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Wartość nadwyżek</p>
                <p className="text-2xl font-bold text-slate-900">+{surplus.toLocaleString("pl-PL")} PLN</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" title={VALUATION_HELP_TEXT}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Wartość braków</p>
                <p className="text-2xl font-bold text-slate-900">−{shortage.toLocaleString("pl-PL")} PLN</p>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Policzone</p>
              <p className="text-2xl font-bold text-slate-900">
                {doc.counted_lines}/{doc.total_lines}
              </p>
            </div>
          )}
        </div>
      ) : null}

      {(conflicts?.items.length ?? 0) > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <InventoryConflictPanel items={conflicts?.items ?? []} loading={conflictsLoading} />
        </div>
      ) : null}

      {unknownProducts.length > 0 || unknownLoading ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <InventoryUnknownProductsPanel
            tenantId={tenantId}
            items={unknownProducts}
            loading={unknownLoading}
            onChanged={refreshAfterUnknownChange}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="border-b border-slate-200">
          <nav className="-mb-px flex space-x-8">
            {tabLink("progress", "Przebieg")}
            {tabLink("differences", "Różnice")}
            {tabLink("control", "Kontrola")}
          </nav>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={downloadBusy != null}
            onClick={() => void runDownload("xlsx-diff", () => downloadInventoryReportBlob(tenantId, documentId, "differences", "xlsx"))}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {downloadBusy === "xlsx-diff" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            Różnice XLSX
          </button>
          <button
            type="button"
            disabled={downloadBusy != null}
            onClick={() => void runDownload("pdf-sheet", () => downloadInventoryReportBlob(tenantId, documentId, "counting_sheet", "pdf"))}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {downloadBusy === "pdf-sheet" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            Spis PDF
          </button>
          <button
            type="button"
            disabled={downloadBusy != null}
            onClick={() => void runDownload("audit-zip", () => downloadInventoryAuditPackageBlob(tenantId, documentId))}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {downloadBusy === "audit-zip" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Pakiet kontroli ZIP
          </button>
        </div>
      </div>

      {tab === "control" ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <InventoryAuditPanel
            auditLog={auditLog?.items ?? []}
            timelines={timelines}
            filters={tableFilters}
            onFiltersChange={updateFilters}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {tab === "differences" ? "Pozycje z różnicą" : "Przebieg liczenia"}
              </h3>
              {tab === "progress" ? (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
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
          <InventoryLineTable
            lines={filteredLines}
            loading={linesLoading}
            emptyMessage={
              tab === "differences" ? "Brak różnic pasujących do filtrów." : "Brak pozycji pasujących do filtrów."
            }
          />
        </div>
      )}
    </div>
  );
}
