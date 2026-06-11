import axios from "axios";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  getComplaint,
  patchComplaintLine,
  patchComplaintPhysicalReceiptMode,
  patchComplaintStatus,
  receiveComplaintLineWarehouse,
  updateLineOperation,
  uploadComplaintPanelPhotos,
  wmsUpdateComplaintItems,
  type ComplaintPhysicalReceiptMode,
} from "../../api/complaintsApi";
import { useWmsScanner } from "../../context/WmsScannerContext";
import {
  complaintRowStatusPresentation,
  normalizeComplaintStatus,
  type ComplaintDetail,
  type ComplaintLineDetail,
} from "../../types/complaint";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WMS_ROUTES } from "./wmsRoutes";
import { displayWarehouseDocumentNumber } from "../../utils/warehouseDocumentNumberDisplay";
import { ComplaintProcessLineSidebar } from "./complaints/ComplaintProcessLineSidebar";
import {
  ComplaintWmsPhysicalReceiptMode,
  normalizePhysicalReceiptMode,
} from "./complaints/ComplaintWmsPhysicalReceiptMode";
import {
  ComplaintWmsLineWorkspace,
  type ComplaintWmsDecisionAction,
} from "./complaints/ComplaintWmsLineWorkspace";
import type { PhoneUploadSessionState } from "./complaints/ComplaintWmsPhotoUploader";
import {
  complaintLineIsResolved,
  complaintLineSidebarItems,
} from "./complaints/complaintWmsLineStatus";
import { resolveDamageMediaUrl } from "../../utils/resolveDamageMediaUrl";
import {
  makeLocalPreview,
  normalizePhotoRef,
  type LocalPreview,
} from "./complaints/complaintWmsPhotoUtils";

function normalizeOrderSourceDisplay(raw?: string | null): string {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "—";
  const low = s.toLowerCase();
  const known: Record<string, string> = {
    allegro: "Allegro",
    ebay: "eBay",
    amazon: "Amazon",
    empik: "Empik",
    shoper: "Shoper",
    woocommerce: "WooCommerce",
    prestashop: "PrestaShop",
    bricklink: "Bricklink",
  };
  if (known[low]) return known[low];
  return s;
}

function fmtOrderDate(iso?: string | null): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function WmsComplaintDetailPage() {
  const { complaintId } = useParams<{ complaintId: string }>();
  const cid = Number.parseInt(String(complaintId ?? "").trim(), 10);
  const [data, setData] = useState<ComplaintDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [hideResolved, setHideResolved] = useState(false);
  const [uploadingLineId, setUploadingLineId] = useState<number | null>(null);
  const [uploadMsgByLine, setUploadMsgByLine] = useState<Record<number, string>>({});
  const [previewsByLine, setPreviewsByLine] = useState<Record<number, LocalPreview[]>>({});
  const [photoRefsByLine, setPhotoRefsByLine] = useState<Record<number, string[]>>({});
  const [phoneUploadSession, setPhoneUploadSession] = useState<PhoneUploadSessionState | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [receiveBusyLineId, setReceiveBusyLineId] = useState<number | null>(null);
  const [modeBusy, setModeBusy] = useState(false);
  const [saveComplaintConfirmOpen, setSaveComplaintConfirmOpen] = useState(false);
  const [noteByLine, setNoteByLine] = useState<Record<number, string>>({});

  const isUploadingRef = useRef(false);
  const { registerScanHandler, setActiveDocument, showScannerToast } = useWmsScanner();

  useEffect(() => {
    if (!Number.isFinite(cid) || cid < 1) return;
    setActiveDocument({ kind: "custom", label: `Reklamacja #${cid}` });
    registerScanHandler((code) => {
      showScannerToast(`Skan ${code} — reklamacja (wkrótce).`);
    });
    return () => {
      registerScanHandler(null);
      setActiveDocument(null);
    };
  }, [cid, registerScanHandler, setActiveDocument, showScannerToast]);

  useEffect(() => {
    return () => {
      for (const list of Object.values(previewsByLine)) {
        for (const p of list) URL.revokeObjectURL(p.url);
      }
    };
  }, [previewsByLine]);

  useEffect(() => {
    if (!Number.isFinite(cid) || cid <= 0) {
      setLoading(false);
      setErr("Nieprawidłowe ID reklamacji.");
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void (async () => {
      try {
        const res = await getComplaint(cid, DAMAGE_TENANT_ID);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          const is404 = axios.isAxiosError(e) && e.response?.status === 404;
          setErr(is404 ? "Reklamacja nie istnieje lub została usunięta." : "Nie udało się wczytać reklamacji.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cid]);

  useEffect(() => {
    const lines = data?.lines ?? [];
    if (!lines.length || !Number.isFinite(cid) || cid <= 0) {
      setNoteByLine({});
      setSelectedLineId(null);
      return;
    }
    const loaded: Record<number, string> = {};
    const loadedPhotoRefs: Record<number, string[]> = {};
    for (const line of lines) {
      try {
        loaded[line.id] = localStorage.getItem(`wms.complaint.note.${cid}.${line.id}`) ?? line.note_warehouse ?? "";
      } catch {
        loaded[line.id] = line.note_warehouse ?? "";
      }
      loadedPhotoRefs[line.id] = (line.warehouse_photos ?? []).map((u) => normalizePhotoRef(u)).filter(Boolean);
    }
    setNoteByLine(loaded);
    setPhotoRefsByLine(loadedPhotoRefs);
    setSelectedLineId((prev) => {
      if (prev != null && lines.some((l) => l.id === prev)) return prev;
      return lines[0]?.id ?? null;
    });
  }, [cid, data?.id, data?.lines]);

  const warehouseId = data?.warehouse_id ?? 1;
  const lines = data?.lines ?? [];
  const status = useMemo(() => complaintRowStatusPresentation(data?.status), [data?.status]);
  const customerName = useMemo(() => {
    const src = data?.order;
    if (!src) return "Brak danych klienta";
    return [src.first_name?.trim(), src.last_name?.trim()].filter(Boolean).join(" ") || "Brak danych klienta";
  }, [data?.order]);
  const sourceLabel = useMemo(
    () => normalizeOrderSourceDisplay(data?.order?.source ?? data?.order_source),
    [data?.order?.source, data?.order_source],
  );
  const complaintDisplayNumber = useMemo(
    () => data?.reference_code?.trim() || `CMP-${String(data?.id ?? 0).padStart(5, "0")}`,
    [data?.id, data?.reference_code],
  );
  const totalQty = useMemo(() => lines.reduce((sum, l) => sum + (l.quantity ?? 0), 0), [lines]);
  const resolvedCount = useMemo(() => lines.filter((l) => complaintLineIsResolved(l)).length, [lines]);
  const physicalReceiptMode = useMemo(
    () => normalizePhysicalReceiptMode(data?.physical_receipt_mode),
    [data?.physical_receipt_mode],
  );
  const warehouseActionsAvailable = data?.warehouse_actions_available !== false && physicalReceiptMode !== "DIRECT_SERVICE";
  const anyLineReceiptPosted = useMemo(
    () => lines.some((l) => l.warehouse_receipt_posted),
    [lines],
  );

  const sidebarItems = useMemo(() => {
    const all = complaintLineSidebarItems(lines, data?.status);
    if (!hideResolved) return all;
    return all.filter((item) => {
      const line = lines.find((l) => l.id === item.lineId);
      return line ? !complaintLineIsResolved(line) : true;
    });
  }, [data?.status, hideResolved, lines]);

  const activeLine = useMemo(
    () => lines.find((l) => l.id === selectedLineId) ?? null,
    [lines, selectedLineId],
  );

  const showToast = useCallback((text: string, ms = 1800) => {
    setToastText(text);
    window.setTimeout(() => setToastText(null), ms);
  }, []);

  const handleUploadLinePhotos = useCallback(
    async (lineId: number, files: FileList | File[]) => {
      if (!files?.length || data == null) return;
      if (isUploadingRef.current) return;
      const list = Array.from(files).filter((f) => f.size > 0);
      if (list.length === 0) return;

      isUploadingRef.current = true;
      setUploadMsgByLine((prev) => ({ ...prev, [lineId]: "Wysyłanie zdjęć…" }));
      setUploadingLineId(lineId);
      try {
        const prevLine = (data.lines ?? []).find((ln) => ln.id === lineId);
        const prevWarehousePhotos = new Set(
          (prevLine?.warehouse_photos ?? []).map((u) => normalizePhotoRef(u)).filter(Boolean),
        );
        const updated = await uploadComplaintPanelPhotos(
          data.id,
          DAMAGE_TENANT_ID,
          warehouseId,
          list,
          "warehouse",
          true,
          lineId,
        );
        setData(updated);
        const updatedLine = (updated.lines ?? []).find((ln) => ln.id === lineId);
        const nextWarehousePhotos = (updatedLine?.warehouse_photos ?? []).map((u) => normalizePhotoRef(u)).filter(Boolean);
        const freshRefs = nextWarehousePhotos.filter((u) => !prevWarehousePhotos.has(u));
        if (freshRefs.length > 0) {
          setPhotoRefsByLine((prev) => ({
            ...prev,
            [lineId]: Array.from(new Set([...(prev[lineId] ?? []), ...freshRefs])),
          }));
          setPreviewsByLine((prev) => ({
            ...prev,
            [lineId]: [...(prev[lineId] ?? []), ...freshRefs.map((u) => makeLocalPreview(resolveDamageMediaUrl(u)))],
          }));
        }
        setUploadMsgByLine((prev) => ({ ...prev, [lineId]: `Dodano ${list.length} zdjęć` }));
      } catch {
        setUploadMsgByLine((prev) => ({ ...prev, [lineId]: "Błąd wysyłania zdjęć" }));
      } finally {
        setUploadingLineId(null);
        isUploadingRef.current = false;
      }
    },
    [data, warehouseId],
  );

  const handleDeletePhoto = useCallback(
    async (lineId: number, photoRef: string) => {
      if (data == null) return;
      const next = (photoRefsByLine[lineId] ?? []).filter((u) => u !== photoRef);
      setPhotoRefsByLine((prev) => ({ ...prev, [lineId]: next }));
      setPreviewsByLine((prev) => ({
        ...prev,
        [lineId]: (prev[lineId] ?? []).filter((p) => normalizePhotoRef(p.url) !== photoRef),
      }));
      try {
        const updated = await wmsUpdateComplaintItems(data.id, DAMAGE_TENANT_ID, warehouseId, [
          {
            item_id: String(lineId),
            note_warehouse: noteByLine[lineId] ?? null,
            photos: next,
            replace_photos: true,
          },
        ]);
        setData(updated);
        showToast("Usunięto zdjęcie");
      } catch {
        showToast("Nie udało się usunąć zdjęcia", 2500);
      }
    },
    [data, noteByLine, photoRefsByLine, showToast, warehouseId],
  );

  const handlePhonePhotos = useCallback((lineId: number, freshRefs: string[]) => {
    setPhotoRefsByLine((prev) => ({
      ...prev,
      [lineId]: Array.from(new Set([...(prev[lineId] ?? []), ...freshRefs])),
    }));
    setPreviewsByLine((prev) => ({
      ...prev,
      [lineId]: [...(prev[lineId] ?? []), ...freshRefs.map((u) => makeLocalPreview(resolveDamageMediaUrl(u)))],
    }));
    setUploadMsgByLine((prev) => ({ ...prev, [lineId]: `Dodano ${freshRefs.length} zdjęć z telefonu` }));
  }, []);

  const applyDecision = useCallback(
    async (line: ComplaintLineDetail, action: ComplaintWmsDecisionAction) => {
      if (data == null) return;
      setDecisionBusy(true);
      try {
        let next: ComplaintDetail = data;
        if (action === "verification") {
          if (warehouseActionsAvailable && !line.warehouse_receipt_posted) {
            next = await receiveComplaintLineWarehouse(data.id, line.id, DAMAGE_TENANT_ID, warehouseId);
          }
          try {
            next = await updateLineOperation(line.id, DAMAGE_TENANT_ID, warehouseId, "WAREHOUSE_RECEIVED");
          } catch {
            // operation chain may require decision first — warehouse receipt is the primary step
          }
          const cur = normalizeComplaintStatus(next.status);
          if (cur === "NOWE" || cur === "OCZEKIWANIE_NA_PRODUKT") {
            next = await patchComplaintStatus(next.id, DAMAGE_TENANT_ID, warehouseId, "WERYFIKACJA");
          }
        } else if (action === "accepted") {
          next = await patchComplaintStatus(data.id, DAMAGE_TENANT_ID, warehouseId, "ZAAKCEPTOWANA");
        } else {
          const decisionMap: Record<
            Exclude<ComplaintWmsDecisionAction, "verification" | "accepted">,
            string
          > = {
            repair: "repair",
            exchange: "exchange",
            reject: "reject",
            refund: "refund",
          };
          next = await patchComplaintLine(data.id, line.id, DAMAGE_TENANT_ID, warehouseId, {
            decision: decisionMap[action],
          });
          const cur = normalizeComplaintStatus(next.status);
          if (cur === "NOWE" || cur === "WERYFIKACJA") {
            next = await patchComplaintStatus(next.id, DAMAGE_TENANT_ID, warehouseId, "DECYZJA");
          }
        }
        setData(next);
        showToast("Zapisano decyzję");
      } catch (e) {
        const msg =
          axios.isAxiosError(e) && typeof e.response?.data === "object" && e.response.data && "detail" in e.response.data
            ? String((e.response.data as { detail: unknown }).detail)
            : "Nie udało się zapisać decyzji.";
        showToast(msg, 3000);
      } finally {
        setDecisionBusy(false);
      }
    },
    [data, showToast, warehouseActionsAvailable, warehouseId],
  );

  const handlePhysicalReceiptModeChange = useCallback(
    async (mode: ComplaintPhysicalReceiptMode) => {
      if (data == null || modeBusy) return;
      setModeBusy(true);
      try {
        const next = await patchComplaintPhysicalReceiptMode(data.id, DAMAGE_TENANT_ID, warehouseId, mode);
        setData(next);
        showToast("Zapisano sposób obsługi towaru");
      } catch (e) {
        const msg =
          axios.isAxiosError(e) && typeof e.response?.data === "object" && e.response.data && "detail" in e.response.data
            ? String((e.response.data as { detail: unknown }).detail)
            : "Nie udało się zapisać trybu obsługi towaru.";
        showToast(msg, 3000);
      } finally {
        setModeBusy(false);
      }
    },
    [data, modeBusy, showToast, warehouseId],
  );

  const handleWarehouseReceive = useCallback(
    async (line: ComplaintLineDetail) => {
      if (data == null || line.warehouse_receipt_posted) return;
      setReceiveBusyLineId(line.id);
      try {
        const next = await receiveComplaintLineWarehouse(data.id, line.id, DAMAGE_TENANT_ID, warehouseId);
        setData(next);
        showToast("Przyjęto towar — utworzono linię Z-PZ");
      } catch (e) {
        const msg =
          axios.isAxiosError(e) && typeof e.response?.data === "object" && e.response.data && "detail" in e.response.data
            ? String((e.response.data as { detail: unknown }).detail)
            : "Nie udało się przyjąć towaru do magazynu.";
        showToast(msg, 3000);
      } finally {
        setReceiveBusyLineId(null);
      }
    },
    [data, showToast, warehouseId],
  );

  const saveComplaint = useCallback(async () => {
    if (data == null) return;
    setSaveComplaintConfirmOpen(false);
    setSaveBusy(true);
    try {
      const items = (data.lines ?? []).map((line) => {
        const value = noteByLine[line.id] ?? "";
        localStorage.setItem(`wms.complaint.note.${cid}.${line.id}`, value);
        return {
          item_id: String(line.id),
          note_warehouse: value || null,
          photos: photoRefsByLine[line.id] ?? [],
        };
      });
      const updated = await wmsUpdateComplaintItems(data.id, DAMAGE_TENANT_ID, warehouseId, items);
      setData(updated);
      showToast("Zapisano");
      setUploadMsgByLine({});
    } finally {
      setSaveBusy(false);
    }
  }, [cid, data, noteByLine, photoRefsByLine, showToast, warehouseId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center text-sm text-slate-600 shadow-sm">
        Ładowanie reklamacji…
      </div>
    );
  }

  if (err || data == null) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-700">{err ?? "Brak danych."}</p>
        <Link
          to={WMS_ROUTES.returns}
          className="inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Wróć do zwrotów
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full max-w-none flex-col overflow-hidden">
      <div className="w-full max-w-none shrink-0 border-b border-slate-200 bg-white px-3 py-3 shadow-sm lg:px-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Link
              to={WMS_ROUTES.returns}
              state={data.order_id ? { preselectOrderId: data.order_id } : undefined}
              className="mt-0.5 shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900"
              title="Wróć do listy zwrotów / reklamacji"
            >
              ←
            </Link>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-black tabular-nums text-slate-900">#{data.order?.number ?? data.order_id ?? "—"}</p>
              <p className="mt-0.5 text-base font-bold tabular-nums text-blue-700">{complaintDisplayNumber}</p>
              <div className="mt-2">
                <span
                  className={`inline-flex max-w-full items-center rounded-lg border-2 px-4 py-2 text-xs font-black uppercase tracking-widest shadow-sm lg:text-sm ${status.badgeClass}`}
                >
                  {status.label}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Klient</p>
                  <p className="mt-0.5 font-semibold text-slate-900">{customerName}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Telefon</p>
                  <p className="mt-0.5 font-medium tabular-nums text-slate-900">{data.customer_phone?.trim() || "—"}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email</p>
                  <p className="mt-0.5 truncate font-medium text-slate-900">{data.customer_email?.trim() || "—"}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Data zamówienia</p>
                  <p className="mt-0.5 font-medium tabular-nums text-slate-900">
                    {fmtOrderDate(data.order?.created_at ?? null)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ilość sztuk</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-slate-900">{totalQty}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Źródło</p>
                  <p className="mt-0.5 font-medium text-slate-900">{sourceLabel}</p>
                </div>
                {data.warehouse_document_id != null && data.warehouse_document_number ? (
                  <div className="min-w-0 sm:col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Powiązany dokument</p>
                    <Link
                      to={WMS_ROUTES.putawayPz(data.warehouse_document_id)}
                      className="mt-0.5 inline-flex font-bold tabular-nums text-indigo-700 hover:underline"
                    >
                      {displayWarehouseDocumentNumber(data.warehouse_document_number)}
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={saveBusy}
              onClick={() => setSaveComplaintConfirmOpen(true)}
              className="min-h-9 rounded-md bg-[#56b36a] px-4 py-1.5 text-sm font-bold text-white hover:bg-[#4a9e5b] disabled:opacity-50"
            >
              {saveBusy ? "Zapisywanie…" : "ZAPISZ"}
            </button>
          </div>
        </div>
      </div>

      <div className="relative flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden px-2 pb-2 pt-1 lg:px-3">
        {lines.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center text-sm text-slate-600 shadow-sm">
            Brak pozycji w reklamacji.
          </div>
        ) : (
          <div className="grid h-full min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] gap-2 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-3">
            <div className="flex h-full min-h-0 w-full max-w-[320px] flex-col overflow-hidden">
              <ComplaintProcessLineSidebar
                items={sidebarItems}
                selectedLineId={selectedLineId}
                resolvedCount={resolvedCount}
                totalCount={lines.length}
                hideResolved={hideResolved}
                onToggleHideResolved={setHideResolved}
                onSelect={setSelectedLineId}
              />
            </div>
            <section className="flex min-h-0 min-w-0 flex-col overflow-y-auto bg-white p-2 lg:p-3">
              <div className="mb-3 max-w-4xl">
                <ComplaintWmsPhysicalReceiptMode
                  value={physicalReceiptMode}
                  disabled={modeBusy || anyLineReceiptPosted}
                  onChange={handlePhysicalReceiptModeChange}
                />
              </div>
              {!activeLine ? (
                <div className="flex flex-1 flex-col items-center justify-center p-10 text-center text-slate-500">
                  <p className="text-sm font-medium">Wybierz pozycję z listy, aby rozpocząć obsługę reklamacji.</p>
                </div>
              ) : (
                <ComplaintWmsLineWorkspace
                  data={data}
                  line={activeLine}
                  note={noteByLine[activeLine.id] ?? ""}
                  photoRefs={photoRefsByLine[activeLine.id] ?? []}
                  localPreviews={previewsByLine[activeLine.id] ?? []}
                  uploading={uploadingLineId === activeLine.id}
                  uploadMessage={uploadMsgByLine[activeLine.id] ?? null}
                  decisionBusy={decisionBusy}
                  receiveBusy={receiveBusyLineId === activeLine.id}
                  phoneSession={phoneUploadSession}
                  onNoteChange={(value) => {
                    setNoteByLine((prev) => ({ ...prev, [activeLine.id]: value }));
                    try {
                      localStorage.setItem(`wms.complaint.note.${cid}.${activeLine.id}`, value);
                    } catch {
                      // ignore quota errors
                    }
                  }}
                  onUploadFiles={(files) => void handleUploadLinePhotos(activeLine.id, files)}
                  onDeletePhoto={(photoRef) => void handleDeletePhoto(activeLine.id, photoRef)}
                  onPhonePhotos={handlePhonePhotos}
                  onPhoneSessionChange={setPhoneUploadSession}
                  onDecision={(action) => void applyDecision(activeLine, action)}
                  onWarehouseReceive={() => void handleWarehouseReceive(activeLine)}
                  warehouseActionsAvailable={warehouseActionsAvailable}
                />
              )}
            </section>
          </div>
        )}
      </div>

      {saveComplaintConfirmOpen ? (
        <div
          className="fixed inset-0 z-[125] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => !saveBusy && setSaveComplaintConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wms-save-complaint-confirm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3 id="wms-save-complaint-confirm" className="text-base font-semibold text-slate-900">
                Zapisać reklamację?
              </h3>
              <button
                type="button"
                className="shrink-0 rounded-xl p-1.5 text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-950 disabled:opacity-50"
                aria-label="Zamknij"
                disabled={saveBusy}
                onClick={() => setSaveComplaintConfirmOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-slate-700">Zostaną zapisane notatki i zdjęcia magazynowe dla wszystkich pozycji.</p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={saveBusy}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                onClick={() => setSaveComplaintConfirmOpen(false)}
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={saveBusy}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={() => void saveComplaint()}
              >
                {saveBusy ? "Zapisywanie…" : "Tak, zapisz"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toastText ? (
        <div className="fixed bottom-6 left-1/2 z-[200] max-w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-900 shadow-lg">
          {toastText}
        </div>
      ) : null}
    </div>
  );
}
