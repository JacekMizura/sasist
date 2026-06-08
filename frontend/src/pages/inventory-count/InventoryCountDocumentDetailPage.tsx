import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, FileSpreadsheet, Loader2, Pencil, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";

import {
  approveInventoryDocument,
  downloadInventoryAuditPackageBlob,
  downloadInventoryReportBlob,
  fetchInventoryAuditLog,
  fetchInventoryDocument,
  fetchInventoryDocumentTimelines,
  getDocumentDifferenceAnalysis,
  listDocumentLines,
  postInventoryDocumentAdjustments,
  rejectInventoryDocument,
  submitInventoryDocumentForApproval,
  updateInventoryWizard,
  type InventoryDocumentRead,
  type InventoryLineFocus,
  type InventoryLineRead,
} from "../../api/inventoryCountApi";
import InventoryAuditPanel from "../../modules/inventoryCount/erp/components/InventoryAuditPanel";
import { InventoryDocumentStatusBadge } from "../../modules/inventoryCount/erp/components/InventoryDocumentStatusBadge";
import InventoryLineTable from "../../modules/inventoryCount/erp/components/InventoryLineTable";
import InventoryTableFilterBar from "../../modules/inventoryCount/erp/components/InventoryTableFilterBar";
import { InventoryKpiTile, InventorySection } from "../../modules/inventoryCount/erp/components/InventoryPageShell";
import { triggerBrowserDownload } from "../../modules/inventoryCount/erp/downloadHelpers";
import { formatInventoryRequestError } from "../../modules/inventoryCount/inventoryCountApiErrors";
import {
  canSubmitInventoryDocument,
  inventorySubmitBlockHint,
} from "../../modules/inventoryCount/inventorySubmitReadiness";
import {
  EMPTY_TABLE_FILTERS,
  filterInventoryLines,
  type InventoryTableFilters,
} from "../../modules/inventoryCount/inventoryTableFilters";
import {
  inventoryCountModeLabel,
  inventoryMovementPolicyLabel,
  inventoryResultPolicyLabel,
  inventoryScopeModeLabel,
  inventoryTypeLabel,
} from "../../modules/inventoryCount/inventoryCountUiLabels";
import { useWarehouse } from "../../context/WarehouseContext";

type DocTab = "progress" | "differences" | "control";

export default function InventoryCountDocumentDetailPage() {
  const { documentId } = useParams();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? 1;
  const id = Number(documentId);

  const [tab, setTab] = useState<DocTab>("progress");
  const [showUncounted, setShowUncounted] = useState(false);
  const [doc, setDoc] = useState<InventoryDocumentRead | null>(null);
  const [lines, setLines] = useState<InventoryLineRead[]>([]);
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof getDocumentDifferenceAnalysis>> | null>(null);
  const [auditLog, setAuditLog] = useState<Awaited<ReturnType<typeof fetchInventoryAuditLog>> | null>(null);
  const [timelines, setTimelines] = useState<Awaited<ReturnType<typeof fetchInventoryDocumentTimelines>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const [linesLoading, setLinesLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tableFilters, setTableFilters] = useState<InventoryTableFilters>(EMPTY_TABLE_FILTERS);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");

  const lineFocus: InventoryLineFocus =
    tab === "differences" ? "differences" : showUncounted ? "all" : "operational";

  const loadDoc = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setErr(null);
    try {
      const [d, diff] = await Promise.all([
        fetchInventoryDocument(tenantId, id),
        getDocumentDifferenceAnalysis(tenantId, id),
      ]);
      setDoc(d);
      setAnalysis(diff);
    } catch {
      setErr("Nie udało się wczytać dokumentu inwentaryzacji.");
    }
  }, [tenantId, id]);

  const loadLines = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setLinesLoading(true);
    try {
      const ln = await listDocumentLines(tenantId, id, { focus: lineFocus });
      setLines(ln);
    } finally {
      setLinesLoading(false);
    }
  }, [tenantId, id, lineFocus]);

  const loadAudit = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    const [log, tl] = await Promise.all([
      fetchInventoryAuditLog(tenantId, id),
      fetchInventoryDocumentTimelines(tenantId, id),
    ]);
    setAuditLog(log);
    setTimelines(tl);
  }, [tenantId, id]);

  useEffect(() => {
    void loadDoc();
  }, [loadDoc]);

  useEffect(() => {
    if (tab === "control") {
      void loadAudit();
    } else {
      void loadLines();
    }
  }, [tab, loadLines, loadAudit]);

  const filteredLines = useMemo(
    () => filterInventoryLines(lines, tableFilters),
    [lines, tableFilters],
  );

  const saveTitle = useCallback(async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const updated = await updateInventoryWizard(tenantId, doc.id, {
        title: titleDraft.trim() || null,
        notes: notesDraft.trim() || null,
      });
      setDoc(updated);
      setEditingTitle(false);
      toast.success("Zapisano tytuł dokumentu.");
    } catch {
      toast.error("Nie udało się zapisać tytułu.");
    } finally {
      setBusy(false);
    }
  }, [doc, tenantId, titleDraft, notesDraft]);

  const action = async (kind: "submit-approval" | "approve" | "reject" | "post") => {
    setBusy(true);
    try {
      if (kind === "submit-approval") await submitInventoryDocumentForApproval(tenantId, id);
      else if (kind === "approve") await approveInventoryDocument(tenantId, id);
      else if (kind === "reject") await rejectInventoryDocument(tenantId, id);
      else await postInventoryDocumentAdjustments(tenantId, id);
      await loadDoc();
      toast.success("Zapisano.");
    } catch (err) {
      console.error("[inventory-count action]", kind, err);
      toast.error(formatInventoryRequestError(err));
      await loadDoc();
    } finally {
      setBusy(false);
    }
  };

  const runDownload = async (key: string, fn: () => Promise<{ blob: Blob; fileName: string }>) => {
    setDownloadBusy(key);
    try {
      const { blob, fileName } = await fn();
      triggerBrowserDownload(blob, fileName);
      toast.success(`Pobrano: ${fileName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pobieranie nie powiodło się.");
    } finally {
      setDownloadBusy(null);
    }
  };

  if (err) return <p className="text-xs text-rose-600">{err}</p>;
  if (!doc) return <p className="text-xs text-slate-500">Wczytywanie…</p>;

  const submitReady = canSubmitInventoryDocument(doc);
  const submitHint = inventorySubmitBlockHint(doc);
  const resultPolicy = doc.result_policy ?? (doc.strategy?.result_policy as string) ?? "update_stock";
  const updatesStock = resultPolicy === "update_stock";
  const scopeMode = String(doc.filters?.scope_mode ?? "full");
  const movementPolicy = doc.movement_policy ?? doc.lock_mode;
  const conflictCount = analysis?.summary?.operator_conflicts ?? 0;
  const surplus = analysis?.surplus_value_net ?? 0;
  const shortage = analysis?.shortage_value_net ?? 0;
  const hasValueBreakdown = surplus > 0 || shortage > 0;

  const tabBtn = (key: DocTab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`rounded px-2.5 py-1 text-[11px] font-semibold ${
        tab === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
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
                <button type="button" disabled={busy} onClick={() => void saveTitle()} className="rounded bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
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
                  onClick={() => {
                    setTitleDraft(doc.title ?? "");
                    setNotesDraft(doc.notes ?? "");
                    setEditingTitle(true);
                  }}
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
              onClick={() => void action("submit-approval")}
              className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              Wyślij do zatwierdzenia
            </button>
          ) : null}
          {doc.status === "awaiting_approval" ? (
            <>
              <button type="button" disabled={busy} onClick={() => void action("approve")} className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                Zatwierdź
              </button>
              <button type="button" disabled={busy} onClick={() => void action("reject")} className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-semibold">
                Odrzuć
              </button>
            </>
          ) : null}
          {doc.status === "approved" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void action("post")}
              className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white"
            >
              {updatesStock ? "Księguj RW/PW" : "Zakończ bez korekt stanów"}
            </button>
          ) : null}
        </div>
      </div>

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
                hint="Ilość × cena zakupu netto"
              />
              <InventoryKpiTile
                label="Wartość braków"
                value={`−${shortage.toLocaleString("pl-PL")} PLN`}
                hint="Ilość × cena zakupu netto"
              />
            </>
          ) : (
            <InventoryKpiTile label="Policzone" value={`${doc.counted_lines}/${doc.total_lines}`} />
          )}
        </div>
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
            onClick={() => void runDownload("xlsx-diff", () => downloadInventoryReportBlob(tenantId, id, "differences", "xlsx"))}
            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold hover:bg-slate-50"
          >
            {downloadBusy === "xlsx-diff" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            Różnice XLSX
          </button>
          <button
            type="button"
            disabled={downloadBusy != null}
            onClick={() => void runDownload("pdf-sheet", () => downloadInventoryReportBlob(tenantId, id, "counting_sheet", "pdf"))}
            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold hover:bg-slate-50"
          >
            {downloadBusy === "pdf-sheet" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            Spis PDF
          </button>
          <button
            type="button"
            disabled={downloadBusy != null}
            onClick={() => void runDownload("audit-zip", () => downloadInventoryAuditPackageBlob(tenantId, id))}
            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold hover:bg-slate-50"
          >
            {downloadBusy === "audit-zip" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Pakiet kontroli ZIP
          </button>
        </div>
      </div>

      {tab === "control" ? (
        <InventoryAuditPanel
          auditLog={auditLog?.items ?? []}
          timelines={timelines}
          filters={tableFilters}
          onFiltersChange={setTableFilters}
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
            onChange={setTableFilters}
            showDifferenceToggle={tab === "progress"}
            showRecountToggle
            showUnknownToggle={tab === "progress"}
          />
          <InventoryLineTable
            lines={filteredLines}
            loading={linesLoading}
            emptyMessage={
              tab === "differences"
                ? "Brak różnic pasujących do filtrów."
                : "Brak pozycji pasujących do filtrów."
            }
          />
        </InventorySection>
      )}

    </div>
  );
}
