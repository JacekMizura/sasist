import axios from "axios";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Download, ImagePlus, Mail, Printer, X } from "lucide-react";

import {
  patchComplaintDecisions,
  patchComplaintLine,
  type ComplaintLinePatchPayload,
  regenerateComplaintDocuments,
  updateLineOperation,
  uploadComplaintPanelPhotos,
  wmsUpdateComplaintItems,
} from "../../api/complaintsApi";
import { wmsPhotoUploadClient } from "../../api/wmsPhotoUploadClient";
import { getPublicBaseUrl } from "../../config/publicUrl";
import type { ComplaintDetail, ComplaintLineDetail, ComplaintStatusCode } from "../../types/complaint";
import type { ComplaintShipmentDetail, ComplaintShipmentGetResponse } from "../../types/complaintShipment";
import {
  COMPLAINT_STATUS_FILTER_ORDER,
  COMPLAINT_STATUS_LABELS_PL,
  normalizeComplaintStatus,
} from "../../types/complaint";
import { buildComplaintExchangePrefill, type ComplaintOrderKind } from "./complaintExchangePrefill";
import { resolveDamageMediaUrl } from "../../utils/resolveDamageMediaUrl";
import { openPdfUrlInPrintViewer } from "../../utils/openPdfForBrowserPrint";
import { complaintDefectLabel } from "../../constants/complaintDefectTags";
import ComplaintLinePhotoLightbox, {
  buildComplaintLinePhotoList,
  customerThumbGlobalIndex,
  type ComplaintLinePhotoItem,
  warehouseThumbGlobalIndex,
} from "./ComplaintLinePhotoLightbox";
import ComplaintLineOperationsBlock from "./ComplaintLineOperationsBlock";
import type { ComplaintShipmentTransportSectionHandle } from "./ComplaintShipmentTransportSection";
import type { ComplaintLineOperationAction, LineExchangeKind } from "./complaintLineOperations";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import {
  buildLineDecisionPatch,
  formatRefundAmountStr,
  lineNeedsRefundSettlementUi,
  lineNonFinancialDecisionMessage,
  lineProductRefundCap,
  lineSettlementChoicesForRefund,
  lineSettlementSectionVisible,
  type LineSettlementKind,
} from "./complaintLineSettlement";

function complaintDocumentAbsoluteUrl(raw: string): string {
  return resolveDamageMediaUrl(String(raw ?? "").trim());
}

function triggerPrintDocument(url: string): void {
  const abs = complaintDocumentAbsoluteUrl(url);
  if (!abs) return;
  const w = openPdfUrlInPrintViewer(abs, { autoPrint: true, autoPrintDelayMs: 1000 });
  if (!w) {
    window.open(abs, "_blank", "noopener,noreferrer");
  }
}

const docActionIconBtn =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-gray-600 transition-colors hover:border-gray-200 hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-transparent disabled:hover:bg-transparent";

/** Square tile: border + radius on this wrapper; inset ring/focus so scroll parents do not clip. */
const linePhotoTileBtn =
  "relative box-border flex aspect-square w-full min-w-0 cursor-pointer flex-col rounded-md border border-gray-200 bg-gray-50 p-1.5 text-left shadow-sm outline-none transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500";

/** Kontener miniatury (div + wewnętrzny przycisk) — usuwanie bez zagnieżdżonych przycisków. */
const linePhotoTileShell =
  "relative box-border flex aspect-square w-full min-w-0 flex-col rounded-md border border-gray-200 bg-gray-50 p-1.5 shadow-sm outline-none transition-all hover:border-gray-300 hover:bg-gray-50/95 hover:opacity-95";
const linePhotoTileSelectedRing = "ring-2 ring-inset ring-blue-500";

const LINE_STATUS_OPTIONS: ComplaintStatusCode[] = [...COMPLAINT_STATUS_FILTER_ORDER];
type PhoneUploadSessionState = { lineId: number; sessionId: string; qrDataUrl: string; seenUrls: string[] };

function normalizePhotoRef(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.startsWith("/uploads/")) return s;
  try {
    const u = new URL(s);
    return `${u.pathname}${u.search ?? ""}`;
  } catch {
    return s;
  }
}

function extractSessionPhotoUrls(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const data = payload as Record<string, unknown>;
  const pools: unknown[] = [data.photos, data.photo_urls, data.urls, data.items];
  const out: string[] = [];
  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    for (const item of pool) {
      if (typeof item === "string" && item.trim()) out.push(item.trim());
      if (item && typeof item === "object") {
        const raw = (item as Record<string, unknown>).url ?? (item as Record<string, unknown>).photo_url;
        if (typeof raw === "string" && raw.trim()) out.push(raw.trim());
      }
    }
  }
  return Array.from(new Set(out));
}

function isLineOpsDecision(raw: string): boolean {
  const d = raw.trim().toLowerCase();
  return d === "repair" || d === "exchange" || d === "reject" || d === "refund";
}

function toDefectLabelList(line: ComplaintLineDetail): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: unknown) => {
    const s = String(v ?? "").trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  const anyLine = line as ComplaintLineDetail & {
    defects?: unknown;
    reasons?: unknown;
    complaint_reasons?: unknown;
  };

  // Preferred per-line IDs from API.
  for (const id of line.defect_ids ?? []) push(complaintDefectLabel(id));

  // Fallbacks for alternative payloads.
  const pools: unknown[] = [anyLine.defects, anyLine.reasons, anyLine.complaint_reasons];
  for (const pool of pools) {
    if (!pool) continue;
    if (Array.isArray(pool)) {
      for (const item of pool) {
        if (typeof item === "string") push(item);
        else if (item && typeof item === "object") {
          const row = item as Record<string, unknown>;
          push(row.name ?? row.label ?? row.value ?? row.id);
        }
      }
      continue;
    }
    if (typeof pool === "string") {
      try {
        const parsed = JSON.parse(pool);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === "string") push(item);
            else if (item && typeof item === "object") {
              const row = item as Record<string, unknown>;
              push(row.name ?? row.label ?? row.value ?? row.id);
            }
          }
          continue;
        }
      } catch {
        // Not JSON - treat as comma/semicolon-separated plain text.
      }
      const split = pool.split(/[;,|]/g).map((x) => x.trim()).filter(Boolean);
      for (const part of split) push(part);
    }
  }

  // Last-resort fallback when backend sends one textual reason.
  if (out.length === 0 && String(line.reason ?? "").trim()) push(line.reason);
  return out;
}

function emDash(s: string | null | undefined): string {
  const t = String(s ?? "").trim();
  return t.length > 0 ? t : "—";
}

function complaintDocumentTypeLabelPl(type: string): string {
  const u = String(type ?? "").trim().toUpperCase();
  if (u === "DECISION") return "Decyzja";
  if (u === "CORRECTION") return "Korekta faktury";
  if (u === "RMA") return "RMA (naprawa)";
  return type || "—";
}

function formatDocTimestamp(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(new Date(t));
}

function LineProductThumb({ catalogUrl, linePhotoUrl }: { catalogUrl: string | null; linePhotoUrl: string | null }) {
  const [broken, setBroken] = useState(false);
  const raw = (catalogUrl && catalogUrl.trim()) || (linePhotoUrl && linePhotoUrl.trim()) || "";
  const src = raw ? resolveDamageMediaUrl(raw) : "";

  useEffect(() => {
    setBroken(false);
  }, [raw]);

  if (!src || broken) {
    return (
      <div
        className="box-border flex h-32 w-32 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-100 p-1.5 text-xs text-gray-400 shadow-sm"
        aria-hidden
      >
        —
      </div>
    );
  }

  return (
    <div className="box-border flex h-32 w-32 shrink-0 flex-col rounded-md border border-gray-200 bg-gray-50 p-1.5 shadow-sm">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-sm bg-white">
        <img
          src={src}
          alt=""
          className="max-h-full max-w-full object-contain"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      </div>
    </div>
  );
}

type Props = {
  data: ComplaintDetail;
  tenantId: number;
  warehouseId: number;
  disabled?: boolean;
  onUpdated: (next: ComplaintDetail) => void;
  onExchangePickupModeSelected?: () => void;
  /** Zamówienie reklamacyjne na stronie szczegółów zamiast `/orders/new`. */
  onInlineExchangeOrder?: (lineId: number, kind: ComplaintOrderKind) => void;
  /** Rozliczenie z klientem (treść z ComplaintDetailPage, bez zmiany logiki). */
  settlementSection?: ReactNode;
  /** Korespondencja (treść z ComplaintDetailPage) — pod sekcją Zamówienie. */
  correspondenceSection?: ReactNode;
  /** Przesyłki reklamacji (osadzone w Operacjach). */
  shipment?: ComplaintShipmentDetail | null;
  serviceShipment?: ComplaintShipmentDetail | null;
  outboundShipment?: ComplaintShipmentDetail | null;
  onShipmentsUpdated?: (r: ComplaintShipmentGetResponse) => void;
  onComplaintSynced?: () => void;
  pickupTransportRef?: RefObject<ComplaintShipmentTransportSectionHandle | null>;
  /** Po wyborze wariantu odrzucenia (tylko UX / timeline — to samo API `decision: reject`). */
  onRejectKind?: (kind: "photos" | "complaint") => void;
};

function groupLinesByProducer(lines: ComplaintLineDetail[]): { label: string; lines: ComplaintLineDetail[] }[] {
  const map = new Map<string, ComplaintLineDetail[]>();
  for (const ln of lines) {
    const label = (ln.producer_name ?? "").trim() || "—";
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(ln);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, lines: items }));
}

export default function ComplaintLinesDecisionsPanel({
  data,
  tenantId,
  warehouseId,
  disabled = false,
  onUpdated,
  onExchangePickupModeSelected,
  onInlineExchangeOrder,
  settlementSection,
  correspondenceSection,
  shipment = null,
  serviceShipment = null,
  outboundShipment = null,
  onShipmentsUpdated,
  onComplaintSynced,
  pickupTransportRef,
  onRejectKind,
}: Props) {
  const navigate = useNavigate();
  const [savingLineId, setSavingLineId] = useState<number | null>(null);
  const [linePhotosById, setLinePhotosById] = useState<Record<number, string[]>>({});
  /** Kopja zdjęć klienta na pozycję — zsynchronizowana z API + optymistyczne usunięcia. */
  const [customerPhotosByLineId, setCustomerPhotosByLineId] = useState<Record<number, string[]>>({});
  const [noteByLineId, setNoteByLineId] = useState<Record<number, string>>({});
  const [photoModalLineId, setPhotoModalLineId] = useState<number | null>(null);
  const [rejectChoiceLineId, setRejectChoiceLineId] = useState<number | null>(null);
  const [phoneUploadSession, setPhoneUploadSession] = useState<PhoneUploadSessionState | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ items: ComplaintLinePhotoItem[]; idx: number } | null>(null);
  const [customerMainIdxByLine, setCustomerMainIdxByLine] = useState<Record<number, number>>({});
  const [warehouseMainIdxByLine, setWarehouseMainIdxByLine] = useState<Record<number, number>>({});
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const collectorInputRef = useRef<HTMLInputElement | null>(null);
  const customerPhotoInputByLineId = useRef<Record<number, HTMLInputElement | null>>({});
  const linePhotosByIdRef = useRef<Record<number, string[]>>({});
  const customerPhotosByLineIdRef = useRef<Record<number, string[]>>({});
  const noteByLineIdRef = useRef<Record<number, string>>({});
  const panelUploadLockRef = useRef(false);
  const phoneSessionPollBusyRef = useRef(false);

  linePhotosByIdRef.current = linePhotosById;
  customerPhotosByLineIdRef.current = customerPhotosByLineId;
  noteByLineIdRef.current = noteByLineId;

  const linesInDisplayOrder = useMemo(
    () => groupLinesByProducer(data.lines ?? []).flatMap((g) => g.lines),
    [data.lines],
  );

  const lineNeedsCustomerPickup = useCallback((ln: ComplaintLineDetail) => {
    const d = (ln.decision ?? "").trim().toLowerCase();
    if (d === "repair" || d === "reject" || d === "refund") return true;
    if (d === "exchange" && String(ln.exchange_kind ?? "").toUpperCase() === "EXCHANGE") return true;
    return false;
  }, []);

  const pickupAnchorLineId = useMemo(() => {
    for (const ln of linesInDisplayOrder) {
      if (lineNeedsCustomerPickup(ln)) return ln.id;
    }
    return null;
  }, [lineNeedsCustomerPickup, linesInDisplayOrder]);

  const repairLogisticsLineId = useMemo(
    () => linesInDisplayOrder.find((l) => (l.decision ?? "").trim().toLowerCase() === "repair")?.id ?? null,
    [linesInDisplayOrder],
  );

  const logisticsBundle = useMemo(() => {
    if (warehouseId == null || onShipmentsUpdated == null) return null;
    return {
      complaintId: data.id,
      tenantId,
      warehouseId,
      shipment,
      serviceShipment,
      outboundShipment,
      onShipmentsUpdated,
      onComplaintSynced,
      complaintCustomer: {
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_email: data.customer_email,
        customer_address: data.customer_address,
        logistics_status: data.logistics_status,
      },
    };
  }, [
    data.customer_address,
    data.customer_email,
    data.customer_name,
    data.customer_phone,
    data.id,
    data.logistics_status,
    onComplaintSynced,
    onShipmentsUpdated,
    outboundShipment,
    serviceShipment,
    shipment,
    tenantId,
    warehouseId,
  ]);

  const [documentsRegenBusy, setDocumentsRegenBusy] = useState(false);
  const [docRegenErr, setDocRegenErr] = useState<string | null>(null);
  const [globalSaveBusy, setGlobalSaveBusy] = useState(false);
  const [saveComplaintConfirmOpen, setSaveComplaintConfirmOpen] = useState(false);

  const orderDateLabel = useMemo(() => {
    const raw = data.order?.created_at ?? null;
    if (!raw) return "—";
    const ts = Date.parse(raw);
    if (Number.isNaN(ts)) return "—";
    return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short" }).format(new Date(ts));
  }, [data.order?.created_at]);

  const lineIdsKey = useMemo(() => (data.lines ?? []).map((l) => l.id).join(","), [data.lines]);

  const lineSettlementSig = useMemo(
    () =>
      (data.lines ?? [])
        .map(
          (l) =>
            `${l.id}:${String(l.decision ?? "").trim().toLowerCase()}:${String(l.settlement_type ?? "").trim()}:${l.settlement_amount ?? ""}:${String(l.settlement_currency ?? "").trim()}`,
        )
        .join("|"),
    [data.lines],
  );

  type LineSettleDraft = { type: string; amount: string; cur: string };
  const [lineSettleDraftById, setLineSettleDraftById] = useState<Record<number, LineSettleDraft>>({});
  const [lineSettlementSavingId, setLineSettlementSavingId] = useState<number | null>(null);
  /** Linie z lokalnie edytowaną kwotą (nie nadpisuj przy zapisie innej pozycji). */
  const refundAmountManualLineIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    refundAmountManualLineIdsRef.current.clear();
  }, [data.id]);

  useEffect(() => {
    const orderCur = (data.order?.currency ?? "PLN").trim() || "PLN";
    setLineSettleDraftById((prev) => {
      const next: Record<number, LineSettleDraft> = {};
      for (const ln of data.lines ?? []) {
        const d = String(ln.decision ?? "").trim().toLowerCase();
        let type = (ln.settlement_type ?? "").trim().toUpperCase();
        if (d === "refund") {
          const choices = lineSettlementChoicesForRefund();
          const valid = choices.some((c) => c.id === type);
          if (!valid) type = "REFUND";
        } else {
          type = "";
        }
        const cur = (ln.settlement_currency ?? orderCur).trim() || orderCur;
        if (d === "refund" && refundAmountManualLineIdsRef.current.has(ln.id) && prev[ln.id]) {
          next[ln.id] = {
            type,
            amount: prev[ln.id].amount,
            cur,
          };
          continue;
        }
        const cap = lineProductRefundCap(ln);
        let amountStr = ln.settlement_amount != null ? String(ln.settlement_amount) : "";
        if (d === "refund" && type === "REFUND" && cap != null) {
          if (!amountStr.trim() || Math.abs(parseFloat(amountStr.replace(",", ".")) - cap) < 0.02) {
            amountStr = formatRefundAmountStr(cap);
          }
        }
        if (d === "refund" && type === "PARTIAL_REFUND" && !amountStr.trim() && ln.settlement_amount != null) {
          amountStr = String(ln.settlement_amount);
        }
        next[ln.id] = {
          type,
          amount: amountStr,
          cur,
        };
      }
      return next;
    });
  }, [data.id, data.order?.currency, lineSettlementSig]);

  useEffect(() => {
    setCustomerMainIdxByLine({});
    setWarehouseMainIdxByLine({});
  }, [data.id, lineIdsKey]);

  useEffect(() => {
    const photos: Record<number, string[]> = {};
    const cust: Record<number, string[]> = {};
    const notes: Record<number, string> = {};
    for (const ln of data.lines ?? []) {
      photos[ln.id] = (ln.warehouse_photos ?? []).map((u) => normalizePhotoRef(u)).filter(Boolean);
      cust[ln.id] = (ln.customer_photos ?? []).map((u) => normalizePhotoRef(u)).filter(Boolean);
      notes[ln.id] = (ln.note_warehouse ?? "").trim();
    }
    setLinePhotosById(photos);
    setCustomerPhotosByLineId(cust);
    customerPhotosByLineIdRef.current = cust;
    setNoteByLineId(notes);
  }, [data.lines]);

  const stopCamera = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }, []);

  const patchLine = useCallback(
    async (lineId: number, body: ComplaintLinePatchPayload) => {
      setSavingLineId(lineId);
      try {
        const next = await patchComplaintLine(data.id, lineId, tenantId, warehouseId, body);
        onUpdated(next);
        const hasExchange = (next.lines ?? []).some(
          (l) => String(l.decision ?? "").trim().toLowerCase() === "exchange",
        );
        const od = String(next.operational_decision ?? "").trim().toLowerCase();
        const wantOd: string | null = hasExchange ? "exchange" : null;
        if ((wantOd === "exchange" && od !== "exchange") || (wantOd === null && od === "exchange")) {
          const updated = await patchComplaintDecisions(next.id, tenantId, warehouseId, {
            operational_decision: wantOd,
          });
          onUpdated(updated);
        }
      } catch {
        window.alert("Nie udało się zapisać pozycji.");
      } finally {
        setSavingLineId(null);
      }
    },
    [data.id, onUpdated, tenantId, warehouseId],
  );

  const saveLineSettlement = useCallback(
    async (ln: ComplaintLineDetail) => {
      if (!lineNeedsRefundSettlementUi(ln.decision)) return;
      const draft = lineSettleDraftById[ln.id];
      if (!draft) return;
      const allowed = lineSettlementChoicesForRefund();
      const t = draft.type.trim().toUpperCase() as LineSettlementKind;
      const opt = allowed.find((o) => o.id === t);
      if (!opt) {
        window.alert("Wybierz typ zwrotu (pełny lub częściowy).");
        return;
      }
      const raw = draft.amount.replace(",", ".").trim();
      const n = parseFloat(raw);
      if (!Number.isFinite(n) || n <= 0) {
        window.alert("Podaj kwotę zwrotu większą od zera.");
        return;
      }
      const amount = Math.round(n * 100) / 100;
      const cur = (data.order?.currency ?? draft.cur ?? "PLN").trim() || "PLN";
      const cap = lineProductRefundCap(ln);
      if (t === "REFUND" && cap != null && Math.abs(amount - cap) > 0.02) {
        window.alert(`Pełny zwrot dla tej pozycji to ${formatRefundAmountStr(cap)} ${cur} (cena × ilość). Dostosuj kwotę lub wybierz częściowy zwrot.`);
        return;
      }
      if (t === "REFUND" && cap == null && data.order?.value != null && amount > data.order.value + 1e-6) {
        window.alert(`Kwota nie może przekroczyć wartości zamówienia (${data.order.value} ${cur}).`);
        return;
      }
      if (t === "PARTIAL_REFUND" && cap != null) {
        if (amount >= cap - 1e-6) {
          window.alert(`Częściowy zwrot musi być mniejszy niż ${formatRefundAmountStr(cap)} ${cur} (wartość pozycji).`);
          return;
        }
      }
      if (t === "PARTIAL_REFUND" && cap == null && data.order?.value != null && amount >= data.order.value - 1e-6) {
        window.alert("Częściowy zwrot musi być mniejszy niż wartość zamówienia.");
        return;
      }
      setLineSettlementSavingId(ln.id);
      try {
        const next = await patchComplaintLine(data.id, ln.id, tenantId, warehouseId, {
          settlement_type: t,
          settlement_amount: amount,
          settlement_currency: cur || undefined,
        });
        onUpdated(next);
        refundAmountManualLineIdsRef.current.delete(ln.id);
      } catch {
        window.alert("Nie udało się zapisać rozliczenia pozycji.");
      } finally {
        setLineSettlementSavingId(null);
      }
    },
    [data.id, data.order?.currency, data.order?.value, lineSettleDraftById, onUpdated, tenantId, warehouseId],
  );

  const setExchangeKind = useCallback(
    (lineId: number, kind: LineExchangeKind) => {
      void patchLine(lineId, { exchange_kind: kind });
    },
    [patchLine],
  );

  const patchRejectWithKind = useCallback(
    async (lineId: number, kind: "photos" | "complaint") => {
      setSavingLineId(lineId);
      try {
        const next = await patchComplaintLine(data.id, lineId, tenantId, warehouseId, { decision: "reject" });
        onUpdated(next);
        const hasExchange = (next.lines ?? []).some(
          (l) => String(l.decision ?? "").trim().toLowerCase() === "exchange",
        );
        const od = String(next.operational_decision ?? "").trim().toLowerCase();
        const wantOd: string | null = hasExchange ? "exchange" : null;
        if ((wantOd === "exchange" && od !== "exchange") || (wantOd === null && od === "exchange")) {
          const updated = await patchComplaintDecisions(next.id, tenantId, warehouseId, {
            operational_decision: wantOd,
          });
          onUpdated(updated);
        }
        onRejectKind?.(kind);
      } catch {
        window.alert("Nie udało się zapisać pozycji.");
      } finally {
        setSavingLineId(null);
      }
    },
    [data.id, onRejectKind, onUpdated, tenantId, warehouseId],
  );

  const updateLineOperationStatus = useCallback(
    async (lineId: number, action: ComplaintLineOperationAction | string) => {
      setSavingLineId(lineId);
      try {
        const next = await updateLineOperation(lineId, tenantId, warehouseId, action);
        onUpdated(next);
      } catch (err) {
        console.error("Failed to update operation status", err);
        window.alert("Nie udało się zapisać etapu operacji.");
      } finally {
        setSavingLineId(null);
      }
    },
    [onUpdated, tenantId, warehouseId],
  );

  const goExchange = useCallback(
    (lineId: number, kind: ComplaintOrderKind) => {
      if (onInlineExchangeOrder) {
        onInlineExchangeOrder(lineId, kind);
        return;
      }
      navigate("/orders/new", {
        state: { complaintExchangePrefill: buildComplaintExchangePrefill(data, kind, lineId) },
      });
    },
    [data, navigate, onInlineExchangeOrder],
  );

  const saveLineWarehouseData = useCallback(
    async (lineId: number, warehousePhotos: string[], note: string) => {
      const c = (customerPhotosByLineIdRef.current[lineId] ?? []).map((u) => normalizePhotoRef(u)).filter(Boolean);
      const w = warehousePhotos.map((u) => normalizePhotoRef(u)).filter(Boolean);
      const merged = Array.from(new Set([...c, ...w]));
      const next = await wmsUpdateComplaintItems(data.id, tenantId, warehouseId, [
        {
          item_id: String(lineId),
          note_warehouse: note || null,
          photos: merged,
          replace_photos: true,
        },
      ]);
      onUpdated(next);
    },
    [data.id, onUpdated, tenantId, warehouseId],
  );

  const deleteLinePhoto = useCallback(
    async (lineId: number, rawUrl: string, kind: "customer" | "warehouse") => {
      const target = normalizePhotoRef(rawUrl);
      if (!target || disabled) return;
      const lnRow = data.lines?.find((l) => l.id === lineId);
      const prevCust = (customerPhotosByLineId[lineId] ?? lnRow?.customer_photos ?? [])
        .map((u) => normalizePhotoRef(u))
        .filter(Boolean);
      const prevWh = (linePhotosById[lineId] ?? lnRow?.warehouse_photos ?? [])
        .map((u) => normalizePhotoRef(u))
        .filter(Boolean);
      const match = (u: string) => normalizePhotoRef(u) !== target;
      const nextCust = kind === "customer" ? prevCust.filter(match) : prevCust;
      const nextWh = kind === "warehouse" ? prevWh.filter(match) : prevWh;
      setCustomerPhotosByLineId((p) => ({ ...p, [lineId]: nextCust }));
      setLinePhotosById((p) => ({ ...p, [lineId]: nextWh }));
      customerPhotosByLineIdRef.current = { ...customerPhotosByLineIdRef.current, [lineId]: nextCust };
      linePhotosByIdRef.current = { ...linePhotosByIdRef.current, [lineId]: nextWh };
      setSavingLineId(lineId);
      try {
        const merged = Array.from(
          new Set([...nextCust.map((u) => normalizePhotoRef(u)).filter(Boolean), ...nextWh.map((u) => normalizePhotoRef(u)).filter(Boolean)]),
        );
        const next = await wmsUpdateComplaintItems(data.id, tenantId, warehouseId, [
          {
            item_id: String(lineId),
            note_warehouse: (noteByLineId[lineId] ?? "").trim() || null,
            photos: merged,
            replace_photos: true,
          },
        ]);
        onUpdated(next);
      } catch {
        setCustomerPhotosByLineId((p) => ({ ...p, [lineId]: prevCust }));
        setLinePhotosById((p) => ({ ...p, [lineId]: prevWh }));
        customerPhotosByLineIdRef.current = { ...customerPhotosByLineIdRef.current, [lineId]: prevCust };
        linePhotosByIdRef.current = { ...linePhotosByIdRef.current, [lineId]: prevWh };
        window.alert("Nie udało się usunąć zdjęcia.");
      } finally {
        setSavingLineId(null);
      }
    },
    [customerPhotosByLineId, data.lines, data.id, disabled, linePhotosById, noteByLineId, onUpdated, tenantId, warehouseId],
  );

  const saveAllLinesWarehouseData = useCallback(async () => {
    setSaveComplaintConfirmOpen(false);
    setGlobalSaveBusy(true);
    try {
      for (const ln of linesInDisplayOrder) {
        const warehousePhotos = (linePhotosById[ln.id] ?? [])
          .map((u) => normalizePhotoRef(u))
          .filter(Boolean);
        await saveLineWarehouseData(ln.id, warehousePhotos, noteByLineId[ln.id] ?? "");
      }
    } finally {
      setGlobalSaveBusy(false);
    }
  }, [linesInDisplayOrder, linePhotosById, noteByLineId, saveLineWarehouseData]);

  const uploadPhotosToLine = useCallback(
    async (lineId: number, files: FileList | null, kind: "customer" | "warehouse") => {
      if (panelUploadLockRef.current) return;
      if (!files?.length) return;
      const list = Array.from(files).filter((f) => f.size > 0);
      if (!list.length) return;
      panelUploadLockRef.current = true;
      setSavingLineId(lineId);
      try {
        if (import.meta.env.DEV) console.log("[complaints] upload", kind, "complaint_item_id", lineId);
        const uploaded = await uploadComplaintPanelPhotos(
          data.id,
          tenantId,
          warehouseId,
          list,
          kind,
          kind === "warehouse",
          lineId,
        );
        onUpdated(uploaded);
        if (kind === "warehouse") {
          const line = (uploaded.lines ?? []).find((l) => l.id === lineId);
          const wh = (line?.warehouse_photos ?? line?.photo_urls ?? [])
            .map((u) => normalizePhotoRef(String(u)))
            .filter(Boolean);
          const unique = Array.from(new Set(wh));
          setLinePhotosById((prev) => ({ ...prev, [lineId]: unique }));
          linePhotosByIdRef.current = { ...linePhotosByIdRef.current, [lineId]: unique };
        }
      } finally {
        panelUploadLockRef.current = false;
        setSavingLineId(null);
      }
    },
    [data.id, onUpdated, tenantId, warehouseId],
  );

  const uploadAndAttachToLine = useCallback(
    (lineId: number, files: FileList | null) => void uploadPhotosToLine(lineId, files, "warehouse"),
    [uploadPhotosToLine],
  );

  const openPhoneUploadSession = useCallback(async (lineId: number) => {
    try {
      const createRes = await wmsPhotoUploadClient.post(
        "/wms/photo-upload/session",
        {},
        { params: { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId } },
      );
      const sessionIdRaw = (createRes.data?.session_id ?? createRes.data?.id ?? createRes.data?.sessionId) as string | undefined;
      const sessionId = sessionIdRaw != null ? String(sessionIdRaw).trim() : "";
      if (!sessionId) return;
      const publicBase = getPublicBaseUrl();
      const fallbackBase = `${window.location.protocol}//${window.location.hostname}:5173`;
      const baseForQr = (publicBase || fallbackBase).replace(/\/+$/, "");
      const qrTarget = `${baseForQr}/wms-upload/${encodeURIComponent(sessionId)}`;
      const qrDataUrl = await QRCode.toDataURL(qrTarget, { width: 260, margin: 1 });
      setPhoneUploadSession({ lineId, sessionId, qrDataUrl, seenUrls: linePhotosById[lineId] ?? [] });
    } catch (e) {
      if (axios.isAxiosError(e)) console.error("phone upload session failed", e.response?.status);
    }
  }, [linePhotosById, warehouseId]);

  useEffect(() => {
    if (!phoneUploadSession) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || phoneSessionPollBusyRef.current) return;
      phoneSessionPollBusyRef.current = true;
      try {
        const res = await wmsPhotoUploadClient.get(
          `/wms/photo-upload/session/${encodeURIComponent(phoneUploadSession.sessionId)}`,
          { params: { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId } },
        );
        if (cancelled) return;
        const refs = extractSessionPhotoUrls(res.data).map((u) => normalizePhotoRef(u)).filter(Boolean);
        const seen = new Set(phoneUploadSession.seenUrls);
        const fresh = refs.filter((u) => !seen.has(u));
        if (!fresh.length) return;
        if (cancelled) return;
        const lineId = phoneUploadSession.lineId;
        const merged = Array.from(new Set([...(linePhotosByIdRef.current[lineId] ?? []), ...fresh]));
        setLinePhotosById((prev) => ({ ...prev, [lineId]: merged }));
        linePhotosByIdRef.current = { ...linePhotosByIdRef.current, [lineId]: merged };
        await saveLineWarehouseData(lineId, merged, noteByLineIdRef.current[lineId] ?? "");
        if (cancelled) return;
        setPhoneUploadSession((prev) =>
          prev ? { ...prev, seenUrls: Array.from(new Set([...prev.seenUrls, ...fresh])) } : prev,
        );
      } catch {
        // silent polling
      } finally {
        phoneSessionPollBusyRef.current = false;
      }
    };
    const id = window.setInterval(() => void tick(), 2000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
      phoneSessionPollBusyRef.current = false;
    };
  }, [phoneUploadSession, saveLineWarehouseData, warehouseId]);

  if (!data.lines?.length) {
    return (
      <div className="w-full bg-zinc-100 p-4 text-left">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-600">Brak pozycji w tej reklamacji.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-zinc-100 p-4 text-left">
      <div className="grid grid-cols-1 gap-6 text-left lg:grid-cols-5">
        <div className="min-w-0 space-y-6 lg:col-span-3">
        <ul className="m-0 list-none space-y-6 p-0">
              {linesInDisplayOrder.map((ln) => {
                if (import.meta.env.DEV) console.log("complaint line item", ln);
                const busy = disabled || savingLineId === ln.id;
                const st = normalizeComplaintStatus(ln.status);
                const dec = (ln.decision ?? "").trim().toLowerCase();
                const firstLinePhoto = (ln.photo_urls ?? []).find((u) => Boolean((u ?? "").trim())) ?? null;
                const catalogImg = (ln.product_image_url ?? "").trim() || null;
                const skuDisp = (ln.sku ?? "").trim() || "—";
                const eanDisp = (ln.product_ean ?? "").trim() || "—";
                const showOpsPanel = isLineOpsDecision(dec);
                const displayName = (ln.product_name ?? "").trim() || "—";
                const producerDisp = (ln.producer_name ?? "").trim() || "—";
                const defectLabels = toDefectLabelList(ln);
                const customerPhotos = (customerPhotosByLineId[ln.id] ?? ln.customer_photos ?? [])
                  .map((u) => normalizePhotoRef(u))
                  .filter(Boolean);
                const warehousePhotos = (linePhotosById[ln.id] ?? []).map((u) => normalizePhotoRef(u)).filter(Boolean);
                const cMainIdx = Math.min(
                  customerMainIdxByLine[ln.id] ?? 0,
                  Math.max(0, customerPhotos.length - 1),
                );
                const wMainIdx = Math.min(
                  warehouseMainIdxByLine[ln.id] ?? 0,
                  Math.max(0, warehousePhotos.length - 1),
                );

                return (
                  <li key={ln.id} className="w-full">
                    <div className="grid grid-cols-1 gap-4 rounded-lg bg-white p-4 shadow-sm lg:grid-cols-2 lg:grid-rows-[auto_auto_auto] lg:gap-x-6">
                      {/* Row 1 — product (left on lg) */}
                      <div className="flex min-w-0 gap-4 border-t border-zinc-100 pt-4 first:border-t-0 first:pt-0 lg:col-start-1 lg:row-start-1 lg:border-t-0 lg:pt-0">
                        <div className="relative shrink-0">
                          <LineProductThumb catalogUrl={catalogImg} linePhotoUrl={firstLinePhoto} />
                          <span
                            className="absolute -right-1 -top-1 flex min-w-[2rem] items-center justify-center rounded-md bg-zinc-900 px-2 py-1 text-xs font-bold tabular-nums text-white shadow-md ring-2 ring-white"
                            title={`Ilość: ${ln.quantity}`}
                          >
                            ×{ln.quantity}
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                            Producent · {producerDisp}
                          </p>
                          <p className="text-xs text-gray-400">#{ln.id}</p>
                          <div className="flex min-w-0 items-start gap-2">
                            <p className="line-clamp-2 min-w-0 flex-1 text-lg font-semibold leading-snug text-gray-900">
                              {displayName}
                            </p>
                          </div>
                          <p className="text-xs text-gray-500">SKU: {skuDisp}</p>
                          <p className="text-xs text-gray-500">EAN: {eanDisp}</p>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {defectLabels.length === 0 ? (
                              <span className="text-xs text-gray-500">Brak wad</span>
                            ) : (
                              defectLabels.map((label, idx) => (
                                <span
                                  key={`${ln.id}-d-${idx}-${label}`}
                                  className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-700"
                                >
                                  {label}
                                </span>
                              ))
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void patchLine(ln.id, buildLineDecisionPatch(ln, "repair"))}
                              className={`h-11 rounded-md border px-4 text-sm font-medium transition-colors ${
                                dec === "repair"
                                  ? "border-zinc-800 bg-zinc-800 text-white"
                                  : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
                              }`}
                            >
                              Naprawa
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void patchLine(ln.id, buildLineDecisionPatch(ln, "exchange"))}
                              className={`h-11 rounded-md border px-4 text-sm font-medium transition-colors ${
                                dec === "exchange"
                                  ? "border-blue-600 bg-blue-600 text-white"
                                  : "border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100"
                              }`}
                            >
                              Wymiana
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void patchLine(ln.id, buildLineDecisionPatch(ln, "refund"))}
                              className={`h-11 rounded-md border px-4 text-sm font-medium transition-colors ${
                                dec === "refund"
                                  ? "border-emerald-700 bg-emerald-700 text-white"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-950 hover:bg-emerald-100"
                              }`}
                            >
                              Zwrot
                            </button>
                            {dec === "reject" ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void patchLine(ln.id, { decision: null })}
                                className="h-11 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
                              >
                                Cofnij odrzucenie
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setRejectChoiceLineId(ln.id)}
                                className="h-11 shrink-0 rounded-md border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-900 hover:bg-red-100"
                              >
                                Odrzuć
                              </button>
                            )}
                          </div>
                          {showOpsPanel && lineNonFinancialDecisionMessage(dec) ? (
                            <p className="mt-2 rounded-md border border-zinc-100 bg-zinc-50/80 px-2.5 py-2 text-xs text-zinc-800">
                              {lineNonFinancialDecisionMessage(dec)}
                            </p>
                          ) : null}
                          {showOpsPanel && lineSettlementSectionVisible(dec) ? (
                            <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
                              <p className="text-xs font-semibold text-gray-800">Zwrot pieniędzy</p>
                              <fieldset className="mt-2 space-y-1.5 border-0 p-0">
                                <legend className="sr-only">Typ zwrotu</legend>
                                {lineSettlementChoicesForRefund().map((o) => (
                                  <label
                                    key={o.id}
                                    className="flex cursor-pointer items-center gap-2 text-xs text-gray-800"
                                  >
                                    <input
                                      type="radio"
                                      name={`line-refund-type-${ln.id}`}
                                      checked={(lineSettleDraftById[ln.id]?.type ?? "REFUND") === o.id}
                                      disabled={busy || lineSettlementSavingId === ln.id}
                                      onChange={() => {
                                        const orderCur = (data.order?.currency ?? "PLN").trim() || "PLN";
                                        const cap = lineProductRefundCap(ln);
                                        if (o.id === "REFUND") {
                                          refundAmountManualLineIdsRef.current.delete(ln.id);
                                        } else {
                                          refundAmountManualLineIdsRef.current.add(ln.id);
                                        }
                                        setLineSettleDraftById((prev) => ({
                                          ...prev,
                                          [ln.id]: {
                                            ...(prev[ln.id] ?? {
                                              type: "REFUND",
                                              amount: "",
                                              cur: orderCur,
                                            }),
                                            type: o.id,
                                            cur: orderCur,
                                            amount:
                                              o.id === "REFUND" && cap != null
                                                ? formatRefundAmountStr(cap)
                                                : o.id === "PARTIAL_REFUND"
                                                  ? ""
                                                  : (prev[ln.id]?.amount ?? ""),
                                          },
                                        }));
                                      }}
                                      className="h-3.5 w-3.5 border-gray-300 text-gray-900"
                                    />
                                    {o.label}
                                  </label>
                                ))}
                              </fieldset>
                              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                                <div className="w-full min-w-0 sm:max-w-[11rem]">
                                  <label className="text-[10px] text-gray-500" htmlFor={`line-settle-amt-${ln.id}`}>
                                    Kwota ({(data.order?.currency ?? "PLN").trim() || "PLN"})
                                  </label>
                                  <input
                                    id={`line-settle-amt-${ln.id}`}
                                    type="text"
                                    inputMode="decimal"
                                    disabled={busy || lineSettlementSavingId === ln.id}
                                    value={lineSettleDraftById[ln.id]?.amount ?? ""}
                                    onChange={(e) => {
                                      refundAmountManualLineIdsRef.current.add(ln.id);
                                      const orderCur = (data.order?.currency ?? "PLN").trim() || "PLN";
                                      setLineSettleDraftById((prev) => ({
                                        ...prev,
                                        [ln.id]: {
                                          ...(prev[ln.id] ?? {
                                            type: "REFUND",
                                            amount: "",
                                            cur: orderCur,
                                          }),
                                          amount: e.target.value,
                                          cur: orderCur,
                                        },
                                      }));
                                    }}
                                    className="mt-0.5 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-xs tabular-nums text-gray-900"
                                  />
                                </div>
                                <button
                                  type="button"
                                  disabled={busy || lineSettlementSavingId === ln.id}
                                  onClick={() => void saveLineSettlement(ln)}
                                  className="h-9 shrink-0 rounded-md bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                                >
                                  {lineSettlementSavingId === ln.id ? "Zapis…" : "Zapisz zwrot"}
                                </button>
                              </div>
                              {lineProductRefundCap(ln) != null ? (
                                <p className="mt-2 text-[10px] text-gray-500">
                                  Wartość pozycji (cena × ilość):{" "}
                                  <span className="tabular-nums font-medium text-gray-700">
                                    {formatRefundAmountStr(lineProductRefundCap(ln)!)}
                                  </span>{" "}
                                  {(data.order?.currency ?? "PLN").trim() || "PLN"}
                                </p>
                              ) : (
                                <p className="mt-2 text-[10px] text-amber-800">
                                  Brak ceny jednostkowej w danych pozycji — wprowadź kwotę zwrotu ręcznie.
                                </p>
                              )}
                            </div>
                          ) : null}
                          <div className="mt-3">
                            <label className="text-xs text-gray-500" htmlFor={`line-stage-${ln.id}`}>
                              Status pozycji
                            </label>
                            <select
                              id={`line-stage-${ln.id}`}
                              value={st}
                              disabled={busy}
                              onChange={(e) => void patchLine(ln.id, { status: e.target.value as ComplaintStatusCode })}
                              className="mt-1 h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 disabled:opacity-60"
                            >
                              {LINE_STATUS_OPTIONS.map((code) => (
                                <option key={code} value={code}>
                                  {COMPLAINT_STATUS_LABELS_PL[code]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Row 1 — operations (right on lg) */}
                      <div className="space-y-2 border-t border-zinc-100 pt-4 lg:col-start-2 lg:row-start-1 lg:min-w-0 lg:border-t-0 lg:pt-0">
                        <p className="text-sm font-semibold text-gray-900">Operacje</p>
                        {!showOpsPanel ? (
                          <p className="text-xs text-gray-500">Wybierz decyzję, aby pokazać operacje.</p>
                        ) : (
                          <div className="text-xs">
                            <ComplaintLineOperationsBlock
                              line={ln}
                              busy={busy}
                              disabled={disabled}
                              onOperationAction={(lid, action) => void updateLineOperationStatus(lid, action)}
                              onGoExchange={goExchange}
                              onSetExchangeKind={setExchangeKind}
                              onExchangePickupModeSelected={onExchangePickupModeSelected}
                              onOpenExchangeOrderForm={goExchange}
                              logistics={logisticsBundle}
                              pickupAnchorLineId={pickupAnchorLineId}
                              repairLogisticsLineId={repairLogisticsLineId}
                              pickupTransportRef={pickupTransportRef}
                            />
                          </div>
                        )}
                      </div>

                      {/* Row 2 — photos: one spanning row, inner 2-column grid (aligned columns on desktop) */}
                      <div className="border-t border-zinc-100 pt-4 lg:col-span-2 lg:row-start-2">
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-x-6 lg:items-start">
                          <div className="min-h-0 min-w-0 max-h-[220px] overflow-y-auto px-1.5">
                            <div className="mb-1 flex min-h-8 items-center justify-between gap-2">
                              <p className="text-xs text-gray-400">Zdjęcia klienta</p>
                              <button
                                type="button"
                                disabled={busy}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                                title="Dodaj zdjęcie"
                                aria-label="Dodaj zdjęcie klienta"
                                onClick={() => customerPhotoInputByLineId.current[ln.id]?.click()}
                              >
                                <ImagePlus className="h-4 w-4" aria-hidden />
                              </button>
                            </div>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="sr-only"
                              ref={(el) => {
                                customerPhotoInputByLineId.current[ln.id] = el;
                              }}
                              onChange={(e) => {
                                void uploadPhotosToLine(ln.id, e.target.files, "customer");
                                e.target.value = "";
                              }}
                            />
                            {customerPhotos.length === 0 ? (
                              <p className="text-xs text-gray-500">Brak zdjęcia</p>
                            ) : (
                              <div className="grid grid-cols-6 gap-2 py-0.5">
                                {customerPhotos.map((u, idx) => (
                                  <div
                                    key={`${ln.id}-c-${u}-${idx}`}
                                    className={`group ${linePhotoTileShell} ${idx === cMainIdx ? linePhotoTileSelectedRing : ""}`}
                                  >
                                    <button
                                      type="button"
                                      disabled={busy}
                                      className="absolute right-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white opacity-0 shadow-sm transition-opacity hover:bg-red-700 focus-visible:opacity-100 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
                                      title="Usuń zdjęcie"
                                      aria-label="Usuń zdjęcie (klient)"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void deleteLinePhoto(ln.id, u, "customer");
                                      }}
                                    >
                                      <X className="h-3 w-3 stroke-[3]" aria-hidden />
                                    </button>
                                    <button
                                      type="button"
                                      className="flex min-h-0 w-full flex-1 flex-col rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                                      onClick={() => {
                                        setCustomerMainIdxByLine((prev) => ({ ...prev, [ln.id]: idx }));
                                        const items = buildComplaintLinePhotoList(customerPhotos, warehousePhotos);
                                        if (items.length > 0) {
                                          setLightbox({
                                            items,
                                            idx: customerThumbGlobalIndex(idx),
                                          });
                                        }
                                      }}
                                    >
                                      <span className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-sm bg-white">
                                        <img
                                          src={resolveDamageMediaUrl(u)}
                                          alt=""
                                          className="max-h-full max-w-full object-contain"
                                        />
                                      </span>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="min-h-0 min-w-0 max-h-[220px] overflow-y-auto px-1.5">
                            <div className="mb-1 flex min-h-8 items-center justify-between gap-2">
                              <p className="text-xs text-gray-400">Zdjęcia magazynowe</p>
                              <button
                                type="button"
                                disabled={busy}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                                title="Dodaj zdjęcie"
                                aria-label="Dodaj zdjęcie magazynowe"
                                onClick={() => setPhotoModalLineId(ln.id)}
                              >
                                <Camera className="h-4 w-4" aria-hidden />
                              </button>
                            </div>
                            {warehousePhotos.length === 0 ? (
                              <p className="text-xs text-gray-500">Brak zdjęcia</p>
                            ) : (
                              <div className="grid grid-cols-6 gap-2 py-0.5">
                                {warehousePhotos.map((u, idx) => (
                                  <div
                                    key={`${ln.id}-w-${u}-${idx}`}
                                    className={`group ${linePhotoTileShell} ${idx === wMainIdx ? linePhotoTileSelectedRing : ""}`}
                                  >
                                    <button
                                      type="button"
                                      disabled={busy}
                                      className="absolute right-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white opacity-0 shadow-sm transition-opacity hover:bg-red-700 focus-visible:opacity-100 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
                                      title="Usuń zdjęcie"
                                      aria-label="Usuń zdjęcie (magazyn)"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void deleteLinePhoto(ln.id, u, "warehouse");
                                      }}
                                    >
                                      <X className="h-3 w-3 stroke-[3]" aria-hidden />
                                    </button>
                                    <button
                                      type="button"
                                      className="flex min-h-0 w-full flex-1 flex-col rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                                      onClick={() => {
                                        setWarehouseMainIdxByLine((prev) => ({ ...prev, [ln.id]: idx }));
                                        const items = buildComplaintLinePhotoList(customerPhotos, warehousePhotos);
                                        if (items.length > 0) {
                                          setLightbox({
                                            items,
                                            idx: warehouseThumbGlobalIndex(customerPhotos.length, idx),
                                          });
                                        }
                                      }}
                                    >
                                      <span className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-sm bg-white">
                                        <img
                                          src={resolveDamageMediaUrl(u)}
                                          alt=""
                                          className="max-h-full max-w-full object-contain"
                                        />
                                      </span>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Row 3 — notes full width */}
                      <div className="border-t border-zinc-100 pt-4 lg:col-span-2 lg:row-start-3">
                        <textarea
                          value={noteByLineId[ln.id] ?? ""}
                          onBlur={() => void saveLineWarehouseData(ln.id, warehousePhotos, noteByLineId[ln.id] ?? "")}
                          onChange={(e) => setNoteByLineId((prev) => ({ ...prev, [ln.id]: e.target.value }))}
                          className="w-full min-h-[80px] resize-y rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900"
                          placeholder="Notatka magazynowa"
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
        </ul>
        </div>

        <div className="lg:col-span-2">
          <div className="space-y-6 rounded-lg bg-white p-4 shadow-sm lg:sticky lg:top-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Dane klienta</h3>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                <span className="text-xs text-gray-400">Imię i nazwisko</span>
                <span className="text-sm text-gray-900">{(data.customer_name ?? "—").trim() || "—"}</span>
                {((data.customer_phone ?? "").trim() || "").length > 0 ? (
                  <>
                    <span className="text-xs text-gray-400">Telefon</span>
                    <span className="text-sm text-gray-900">{data.customer_phone}</span>
                  </>
                ) : null}
                {((data.customer_email ?? "").trim() || "").length > 0 ? (
                  <>
                    <span className="text-xs text-gray-400">Email</span>
                    <span className="break-all text-sm text-gray-900">{data.customer_email}</span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-800">Zamówienie</h3>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                <span className="text-xs text-gray-400">Numer reklamacji</span>
                <span className="text-sm text-gray-900">
                  {(data.reference_code ?? "").trim() || `CMP-${data.id}`}
                </span>
                <span className="text-xs text-gray-400">Numer zamówienia</span>
                <span className="text-sm text-gray-900">#{data.order?.number ?? data.order_id ?? "—"}</span>
                <span className="text-xs text-gray-400">Źródło</span>
                <span className="text-sm text-gray-900">
                  {(data.order?.source ?? data.order_source ?? "—").toString()}
                </span>
                <span className="text-xs text-gray-400">Data zamówienia</span>
                <span className="text-sm text-gray-900">{orderDateLabel}</span>
              </div>
            </div>

            {correspondenceSection != null ? (
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-semibold text-gray-800">Korespondencja</h3>
                <div className="mt-2 flex flex-col gap-2">{correspondenceSection}</div>
              </div>
            ) : null}

            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-800">Dokumenty</h3>
              <div className="mt-2 space-y-1.5">
                {(data.documents ?? []).length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-3 py-4 text-center text-xs text-gray-500">
                    Brak dokumentów — pojawią się po zamknięciu reklamacji, zwrocie lub wyborze naprawy na pozycji.
                  </p>
                ) : (
                  (data.documents ?? []).map((d) => {
                    const fileAbs = complaintDocumentAbsoluteUrl(d.file_url);
                    const customerEmail = (data.customer_email ?? "").trim();
                    const mailQuery = new URLSearchParams({
                      subject: `Dokument: ${emDash(d.title)} — ${(data.reference_code ?? "").trim() || `CMP-${data.id}`}`,
                      body: `Załączam odnośnik do pliku PDF:\n${fileAbs}\n\n`,
                    });
                    const mailto = customerEmail.length > 0 ? `mailto:${customerEmail}?${mailQuery.toString()}` : null;
                    return (
                      <div
                        key={d.id}
                        className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-2.5 py-2"
                      >
                        <div className="min-w-0 flex-1 pr-1">
                          <p className="truncate text-sm font-medium text-gray-900">{emDash(d.title)}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            <span className="tabular-nums">{formatDocTimestamp(d.created_at ?? null)}</span>
                            <span className="text-gray-400"> · </span>
                            {complaintDocumentTypeLabelPl(d.type)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <a
                            href={fileAbs || d.file_url}
                            target="_blank"
                            rel="noreferrer"
                            download
                            title="Pobierz"
                            className={docActionIconBtn}
                            aria-label={`Pobierz: ${emDash(d.title)}`}
                          >
                            <Download className="h-4 w-4" aria-hidden />
                          </a>
                          {mailto ? (
                            <a href={mailto} className={docActionIconBtn} title="Wyślij e-mailem" aria-label="Wyślij e-mailem">
                              <Mail className="h-4 w-4" aria-hidden />
                            </a>
                          ) : (
                            <button
                              type="button"
                              disabled
                              title="Brak adresu e-mail klienta"
                              className={docActionIconBtn}
                              aria-label="Wyślij e-mailem (niedostępne)"
                            >
                              <Mail className="h-4 w-4" aria-hidden />
                            </button>
                          )}
                          <button
                            type="button"
                            className={docActionIconBtn}
                            title="Drukuj"
                            aria-label={`Drukuj: ${emDash(d.title)}`}
                            onClick={() => triggerPrintDocument(d.file_url)}
                          >
                            <Printer className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <button
                type="button"
                disabled={disabled || documentsRegenBusy || warehouseId == null}
                onClick={() => {
                  if (warehouseId == null) return;
                  setDocumentsRegenBusy(true);
                  setDocRegenErr(null);
                  void (async () => {
                    try {
                      const next = await regenerateComplaintDocuments(
                        data.id,
                        DAMAGE_TENANT_ID,
                        warehouseId,
                        null,
                      );
                      onUpdated(next);
                    } catch {
                      setDocRegenErr("Nie udało się wygenerować dokumentów PDF.");
                    } finally {
                      setDocumentsRegenBusy(false);
                    }
                  })();
                }}
                className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {documentsRegenBusy ? "Generowanie…" : "Ponownie wygeneruj dostępne dokumenty"}
              </button>
              {docRegenErr ? (
                <p className="mt-2 text-xs text-red-700" role="alert">
                  {docRegenErr}
                </p>
              ) : null}
            </div>

            {settlementSection != null ? (
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Podsumowanie rozliczenia (cała reklamacja)
                </h3>
                <p className="mt-1 text-[11px] text-gray-500">
                  Szczegóły rozliczenia ustawiasz na poziomie każdej pozycji.
                </p>
                <div className="mt-2 opacity-95">{settlementSection}</div>
              </div>
            ) : null}

            <div className="border-t border-gray-200 pt-4">
              <button
                type="button"
                className="h-12 w-full rounded-lg bg-blue-600 px-4 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={disabled || globalSaveBusy || savingLineId != null}
                onClick={() => setSaveComplaintConfirmOpen(true)}
              >
                {globalSaveBusy ? "Zapisywanie…" : "Zapisz reklamację"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {photoModalLineId != null ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={() => { setPhotoModalLineId(null); setPhoneUploadSession(null); stopCamera(); }}>
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Dodaj zdjęcie</h3>
              <button type="button" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" onClick={() => { setPhotoModalLineId(null); setPhoneUploadSession(null); stopCamera(); }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              <button type="button" className="flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white shadow-md hover:bg-slate-800" onClick={async () => {
                setCameraError(null);
                try {
                  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
                  cameraStreamRef.current = stream;
                  setCameraOpen(true);
                  window.requestAnimationFrame(() => {
                    if (videoRef.current) videoRef.current.srcObject = stream;
                  });
                } catch {
                  setCameraError("Nie udało się uruchomić kamery.");
                }
              }}>
                📷 Kamera (desktop/laptop)
              </button>
              <button type="button" className="flex h-11 w-full items-center justify-center rounded-xl bg-indigo-700 px-4 text-sm font-medium text-white shadow-md hover:bg-indigo-600" onClick={() => void openPhoneUploadSession(photoModalLineId)}>
                📱 Telefon (QR)
              </button>
              <button type="button" className="flex h-11 w-full items-center justify-center rounded-xl bg-[#41546a] px-4 text-sm font-medium text-white shadow-md hover:bg-[#36444d]" onClick={() => collectorInputRef.current?.click()}>
                📦 Kolektor / urządzenie mobilne
              </button>
              <input
                ref={collectorInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="sr-only"
                onChange={(e) => {
                  void uploadAndAttachToLine(photoModalLineId, e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {cameraOpen ? (
              <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-inner">
                <video ref={videoRef} autoPlay playsInline muted className="h-48 w-full rounded-lg bg-black object-contain" />
                <button
                  type="button"
                  className="block h-12 w-full rounded-xl bg-emerald-700 px-4 text-base font-semibold text-white hover:bg-emerald-600"
                  onClick={async () => {
                    const v = videoRef.current;
                    if (!v || !v.videoWidth || !v.videoHeight) return;
                    const canvas = document.createElement("canvas");
                    canvas.width = v.videoWidth;
                    canvas.height = v.videoHeight;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) return;
                    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
                    if (!blob) return;
                    const file = new File([blob], `complaint-${photoModalLineId}-${Date.now()}.jpg`, { type: "image/jpeg" });
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    await uploadAndAttachToLine(photoModalLineId, dt.files);
                  }}
                >
                  Zrób zdjęcie
                </button>
              </div>
            ) : null}
            {cameraError ? <p className="mt-2 text-sm text-rose-700">{cameraError}</p> : null}
            {phoneUploadSession && phoneUploadSession.lineId === photoModalLineId ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm text-slate-700">Zeskanuj QR i zrób zdjęcie na telefonie. Nowe zdjęcia pojawią się automatycznie.</p>
                <div className="mt-3 flex justify-center">
                  <img src={phoneUploadSession.qrDataUrl} alt="QR do uploadu zdjęcia" className="h-64 w-64 rounded border border-slate-200 bg-white p-2" />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {saveComplaintConfirmOpen ? (
        <div
          className="fixed inset-0 z-[122] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => !globalSaveBusy && setSaveComplaintConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-complaint-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3 id="save-complaint-confirm-title" className="text-base font-semibold text-slate-900">
                Zapisać reklamację?
              </h3>
              <button
                type="button"
                className="shrink-0 rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                aria-label="Zamknij"
                disabled={globalSaveBusy}
                onClick={() => setSaveComplaintConfirmOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-slate-700">
              Zostaną zapisane notatki magazynowe i listy zdjęć dla wszystkich pozycji (zgodnie z bieżącym stanem na
              ekranie).
            </p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={globalSaveBusy}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                onClick={() => setSaveComplaintConfirmOpen(false)}
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={globalSaveBusy || disabled || savingLineId != null}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={() => void saveAllLinesWarehouseData()}
              >
                {globalSaveBusy ? "Zapisywanie…" : "Tak, zapisz"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rejectChoiceLineId != null ? (
        <div
          className="fixed inset-0 z-[121] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => setRejectChoiceLineId(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-choice-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 id="reject-choice-title" className="text-base font-semibold text-slate-900">
                  Sposób odrzucenia
                </h3>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Zamknij"
                onClick={() => setRejectChoiceLineId(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={disabled || savingLineId === rejectChoiceLineId}
                className="flex h-11 w-full items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-900 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  const id = rejectChoiceLineId;
                  setRejectChoiceLineId(null);
                  if (id != null) void patchRejectWithKind(id, "photos");
                }}
              >
                Odrzuć na podstawie zdjęć
              </button>
              <button
                type="button"
                disabled={disabled || savingLineId === rejectChoiceLineId}
                className="flex h-11 w-full items-center justify-center rounded-lg border border-rose-300 bg-white px-4 text-sm font-medium text-red-900 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  const id = rejectChoiceLineId;
                  setRejectChoiceLineId(null);
                  if (id != null) void patchRejectWithKind(id, "complaint");
                }}
              >
                Odrzuć reklamację
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ComplaintLinePhotoLightbox
        open={lightbox != null && (lightbox.items?.length ?? 0) > 0}
        items={lightbox?.items ?? []}
        index={lightbox?.idx ?? 0}
        onIndexChange={(next) => setLightbox((prev) => (prev ? { ...prev, idx: next } : prev))}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
