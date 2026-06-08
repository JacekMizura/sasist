import { Download, FileSpreadsheet, Loader2, Pencil, ShieldCheck } from "lucide-react";

import { downloadInventoryAuditPackageBlob, downloadInventoryReportBlob } from "@/api/inventoryCountApi";
import type { InventoryDocumentDetailState } from "@/modules/inventoryCount/hooks/useInventoryDocumentDetail";
import InventoryApprovalSummaryModal from "@/modules/inventoryCount/ui/erp/InventoryApprovalSummaryModal";
import InventoryAuditPanel from "@/modules/inventoryCount/ui/erp/InventoryAuditPanel";
import InventoryConflictPanel from "@/modules/inventoryCount/ui/erp/InventoryConflictPanel";
import InventoryDocumentOpsBar from "@/modules/inventoryCount/ui/erp/InventoryDocumentOpsBar";
import { InventoryDocumentStatusBadge } from "@/modules/inventoryCount/ui/erp/InventoryDocumentStatusBadge";
import InventoryLineTable from "@/modules/inventoryCount/ui/erp/InventoryLineTable";
import InventoryTableFilterBar from "@/modules/inventoryCount/ui/erp/InventoryTableFilterBar";
import InventoryUnknownProductsPanel from "@/modules/inventoryCount/ui/erp/InventoryUnknownProductsPanel";
import { InventoryKpiTile, InventorySection } from "@/modules/inventoryCount/ui/erp/InventoryPageShell";
import { VALUATION_HELP_TEXT } from "@/modules/inventoryCount/inventoryScopePresets";
import {
  inventoryCountModeLabel,
  inventoryMovementPolicyLabel,
  inventoryResultPolicyLabel,
  inventoryScopeModeLabel,
  inventoryTypeLabel,
} from "@/modules/inventoryCount/inventoryCountUiLabels";

type Props = {
  state: InventoryDocumentDetailState;
  warehouseName?: string;
};

/** ERP document detail — presentation only; data from `useInventoryDocumentDetail`. */
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

  const tabBtn = (key: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => changeTab(key)}
      className={`rounded px-2.5 py-1 text-[11px] font-semibold ${
        tab === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <InventoryApprovalSummaryModal
        open={approvalOpen}
        mode={approvalMode}
        preview={approvalPreview}
        loading={approvalPreviewLoading}
        busy={busy}
        onConfirm={() => void confirmApprovalAction()}
        onCancel={() => setApprovalOpen(false)}
      />

      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Dokument inwentaryzacji</p>
          {editingTitle ? (
            <div className="mt-1 space-y-1">
              <input
                className="w-full max-w-md rounded border border-slate-300 px-2 py-1 text-sm font-semibold"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                placeholder="Tytuł inwentaryzacji…"
              />
              <textarea
                className="w-full max-w-md rounded border border-slate-200 px-2 py-1 text-xs"
                rows={2}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Opis / notatka…"
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveTitle()}
                  className="rounded bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white"
                >
                  Zapisz
                </button>
                <button type="button" onClick={() => setEditingTitle(false)} className="text-[11px] text-slate-500">
                  Anuluj
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-1">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                  {doc.title?.trim() || doc.number}
                </h2>
                <p className="font-mono text-[10px] text-slate-400">Nr systemowy: {doc.number}</p>
                {doc.notes ? <p className="mt-0.5 text-xs text-slate-600">{doc.notes}</p> : null}
              </div>
              {["draft", "planned", "in_progress", "awaiting_approval"].includes(doc.status) ? (
                <button
                  type="button"
                  title="Edytuj tytuł"
                  onClick={startEditTitle}
                  className="mt-0.5 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>{inventoryTypeLabel(doc.inventory_type)}</span>
            <InventoryDocumentStatusBadge status={doc.status} />
            <span className="tabular-nums">
              Pokrycie {doc.coverage_percent}% · {doc.counted_lines}/{doc.total_lines} poz.
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
            <span>Zakres: {inventoryScopeModeLabel(scopeMode)}</span>
            <span>Liczenie: {inventoryCountModeLabel(doc.count_mode)}</span>
            <span>Ruchy: {inventoryMovementPolicyLabel(movementPolicy)}</span>
            <span>Wynik: {inventoryResultPolicyLabel(resultPolicy)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {doc.status === "in_progress" ? (
            <button
              type="button"
              disabled={busy || !submitReady}
              title={submitHint}
              onClick={() => void openApprovalModal("submit")}
              className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
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
                className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                Zatwierdź
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void actionReject()}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-semibold"
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
              className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white"
            >
              {updatesStock ? "Księguj RW/PW" : "Zakończ bez korekt stanów"}
            </button>
          ) : null}
        </div>
      </div>

      <InventoryDocumentOpsBar doc={doc} preview={opsPreview} warehouseName={warehouseName} />

      {analysis ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <InventoryKpiTile label="Pozycje z różnicą" value={doc.difference_lines} />
          <InventoryKpiTile
            label="Konflikty liczenia"
            value={conflictCount}
            hint="Pozycje policzone wielokrotnie z różnymi wynikami"
          />
          {hasValueBreakdown ? (
            <>
              <InventoryKpiTile
                label="Wartość nadwyżek"
                value={`+${surplus.toLocaleString("pl-PL")} PLN`}
                hint={VALUATION_HELP_TEXT}
              />
              <InventoryKpiTile
                label="Wartość braków"
                value={`−${shortage.toLocaleString("pl-PL")} PLN`}
                hint={VALUATION_HELP_TEXT}
              />
            </>
          ) : (
            <InventoryKpiTile label="Policzone" value={`${doc.counted_lines}/${doc.total_lines}`} />
          )}
        </div>
      ) : null}

      {(conflicts?.items.length ?? 0) > 0 ? (
        <InventoryConflictPanel items={conflicts?.items ?? []} loading={conflictsLoading} />
      ) : null}

      {unknownProducts.length > 0 || unknownLoading ? (
        <InventoryUnknownProductsPanel
          tenantId={tenantId}
          items={unknownProducts}
          loading={unknownLoading}
          onChanged={refreshAfterUnknownChange}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex gap-0.5 rounded border border-slate-200 bg-slate-50 p-0.5">
          {tabBtn("progress", "Przebieg")}
          {tabBtn("differences", "Różnice")}
          {tabBtn("control", "Kontrola")}
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            disabled={downloadBusy != null}
            onClick={() =>
              void runDownload("xlsx-diff", () => downloadInventoryReportBlob(tenantId, documentId, "differences", "xlsx"))
            }
            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold hover:bg-slate-50"
          >
            {downloadBusy === "xlsx-diff" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5" />
            )}
            Różnice XLSX
          </button>
          <button
            type="button"
            disabled={downloadBusy != null}
            onClick={() =>
              void runDownload("pdf-sheet", () => downloadInventoryReportBlob(tenantId, documentId, "counting_sheet", "pdf"))
            }
            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold hover:bg-slate-50"
          >
            {downloadBusy === "pdf-sheet" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            Spis PDF
          </button>
          <button
            type="button"
            disabled={downloadBusy != null}
            onClick={() => void runDownload("audit-zip", () => downloadInventoryAuditPackageBlob(tenantId, documentId))}
            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold hover:bg-slate-50"
          >
            {downloadBusy === "audit-zip" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Pakiet kontroli ZIP
          </button>
        </div>
      </div>

      {tab === "control" ? (
        <InventoryAuditPanel
          auditLog={auditLog?.items ?? []}
          timelines={timelines}
          filters={tableFilters}
          onFiltersChange={updateFilters}
        />
      ) : (
        <InventorySection
          title={tab === "differences" ? "Pozycje z różnicą" : "Przebieg liczenia"}
          actions={
            tab === "progress" ? (
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={showUncounted}
                  onChange={(e) => setShowUncounted(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Pokaż niepoliczone
              </label>
            ) : undefined
          }
        >
          <InventoryTableFilterBar
            filters={tableFilters}
            onChange={updateFilters}
            showDifferenceToggle={tab === "progress"}
            showRecountToggle
            showUnknownToggle={tab === "progress"}
          />
          <InventoryLineTable
            lines={filteredLines}
            loading={linesLoading}
            emptyMessage={
              tab === "differences" ? "Brak różnic pasujących do filtrów." : "Brak pozycji pasujących do filtrów."
            }
          />
        </InventorySection>
      )}
    </div>
  );
}
