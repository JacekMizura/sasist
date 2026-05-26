import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ChevronLeft, ChevronRight, Home, Send } from "lucide-react";

import { getComplaintShipment } from "../../api/complaintShipmentApi";
import {
  getComplaint,
  patchComplaintDecisions,
  patchComplaintStatus,
  type ComplaintDecisionPatchPayload,
} from "../../api/complaintsApi";
import { useWarehouse } from "../../context/WarehouseContext";
import type { ComplaintDetail } from "../../types/complaint";
import {
  complaintRowStatusPresentation,
  normalizeComplaintStatus,
  type ComplaintStatusCode,
} from "../../types/complaint";
import type { ComplaintShipmentDetail } from "../../types/complaintShipment";
import type { ComplaintShipmentTransportSectionHandle } from "./ComplaintShipmentTransportSection";
import ComplaintTimeline from "./ComplaintTimeline";
import ComplaintResponseDeadlineBanner from "./ComplaintResponseDeadlineBanner";
import ComplaintAutoAcceptBadge from "./ComplaintAutoAcceptBadge";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import ComplaintLinesDecisionsPanel from "./ComplaintLinesDecisionsPanel";
import ComplaintExchangeOrderSection from "./ComplaintExchangeOrderSection";
import type { ComplaintOrderKind } from "./complaintExchangePrefill";
import {
  COMPLAINT_FINAL_DECISION_BLOCK_MSG,
  complaintLinesReadyForFinalDecision,
  getComplaintCloseBlockingLines,
} from "./complaintLineOperations";
import { aggregateComplaintRefundSummary } from "./complaintLineSettlement";
import {
  COMPLAINT_TIMELINE_ACTOR,
  dedupeComplaintHistoryRows,
  formatComplaintAuditDateTime,
  formatComplaintJournalAction,
  humanizeComplaintAuditEvent,
  mergeAndSortHistoryRows,
  timelineEventToHistoryRow,
  type ComplaintHistoryRow,
} from "./complaintAuditHumanize";
import { buildStructuredTimelineRows } from "./complaintStructuredHumanize";
import { PanelDetailEntityHeader } from "../../components/panelDetail/PanelDetailEntityHeader";
import {
  panelDetailAsideColClass,
  panelDetailMainColClass,
  panelDetailMainGridClass,
  panelDetailPageSectionSpacingClass,
} from "../../components/panelDetail/panelDetailLayout";
import { listSellasistToolbarSquareBtn } from "../../components/listPage/listSellasistTokens";
import { complaintRawStatusToPanelBrief } from "../../utils/panelListStatusBriefMappers";

const SETTLEMENT_MSG_DECISION_PHASE =
  "Szczegóły finansowe ustawiasz przy pozycjach z decyzją zwrot; poniżej tylko podsumowanie z pozycji.";
const SETTLEMENT_MSG_PREREQ_CLOSE =
  "Po zamknięciu reklamacji możesz zweryfikować spójność liczb z zapisów na liniach.";

function complaintSecondaryPathsUnlocked(d: ComplaintDetail): boolean {
  if (d.major_defect || d.repair_failed || d.replacement_failed) return true;
  return (d.lines ?? []).some((ln) => {
    const x = String(ln.decision ?? "").trim().toLowerCase();
    return x === "repair" || x === "exchange" || x === "refund";
  });
}

type TimelineEvent = { id: string; at: number; title: string; subtitle?: string };

function formatTimelineDate(ts: number): string {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(new Date(ts));
}

type CorrespondenceMessage = { id: string; at: number; text: string };

function correspondenceStorageKey(complaintId: number): string {
  return `complaint-correspondence-${complaintId}`;
}

export default function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const cid = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const fromOrdersContext = location.pathname.startsWith("/orders/complaints");
  const backListPath = fromOrdersContext ? "/orders/list" : "/complaints";
  const pickupTransportRef = useRef<ComplaintShipmentTransportSectionHandle>(null);
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;

  const [data, setData] = useState<ComplaintDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [patching, setPatching] = useState(false);
  const [decisionSaving, setDecisionSaving] = useState(false);

  const [extraTimeline, setExtraTimeline] = useState<TimelineEvent[]>([]);
  const [shipment, setShipment] = useState<ComplaintShipmentDetail | null>(null);
  const [serviceShipment, setServiceShipment] = useState<ComplaintShipmentDetail | null>(null);
  const [outboundShipment, setOutboundShipment] = useState<ComplaintShipmentDetail | null>(null);
  const [correspondenceMessages, setCorrespondenceMessages] = useState<CorrespondenceMessage[]>([]);
  const [correspondenceDraft, setCorrespondenceDraft] = useState("");
  const [replacementModal, setReplacementModal] = useState<{ lineId: number; kind: ComplaintOrderKind } | null>(null);
  const [processActionErr, setProcessActionErr] = useState<string | null>(null);
  const [journalPageSize, setJournalPageSize] = useState(25);
  const [journalPage, setJournalPage] = useState(0);

  const keySeq = useRef(0);
  const nextKey = () => {
    keySeq.current += 1;
    return `k-${keySeq.current}`;
  };

  const appendTimeline = useCallback((title: string, subtitle?: string) => {
    setExtraTimeline((prev) => [...prev, { id: nextKey(), at: Date.now(), title, subtitle }]);
  }, []);

  useEffect(() => {
    if (!Number.isFinite(cid) || cid <= 0 || warehouseId == null) {
      setData(null);
      setLoading(false);
      setErr(!Number.isFinite(cid) || cid <= 0 ? "Nieprawidłowe ID." : null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void (async () => {
      try {
        const r = await getComplaint(cid, DAMAGE_TENANT_ID, warehouseId);
        if (!cancelled) setData(r);
      } catch {
        if (!cancelled) {
          setErr("Nie znaleziono reklamacji.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cid, warehouseId]);

  useEffect(() => {
    setProcessActionErr(null);
  }, [data?.status, data?.id]);

  useEffect(() => {
    if (data?.lines && complaintLinesReadyForFinalDecision(data.lines)) {
      setProcessActionErr(null);
    }
  }, [data?.lines]);

  const refundSummary = useMemo(() => aggregateComplaintRefundSummary(data), [data]);

  useEffect(() => {
    if (!data?.id) {
      setCorrespondenceMessages([]);
      return;
    }
    try {
      const raw = localStorage.getItem(correspondenceStorageKey(data.id));
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setCorrespondenceMessages(
            parsed
              .filter((x): x is CorrespondenceMessage =>
                typeof x === "object" &&
                x != null &&
                typeof (x as CorrespondenceMessage).id === "string" &&
                typeof (x as CorrespondenceMessage).text === "string",
              )
              .map((x) => ({
                id: x.id,
                at: typeof x.at === "number" ? x.at : Date.now(),
                text: x.text,
              })),
          );
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setCorrespondenceMessages([]);
  }, [data?.id]);

  const persistCorrespondence = useCallback((messages: CorrespondenceMessage[]) => {
    if (!data?.id) return;
    try {
      localStorage.setItem(correspondenceStorageKey(data.id), JSON.stringify(messages));
    } catch {
      /* ignore */
    }
  }, [data?.id]);

  const sendCorrespondence = useCallback(() => {
    const t = correspondenceDraft.trim();
    if (!t || data == null) return;
    const msg: CorrespondenceMessage = { id: nextKey(), at: Date.now(), text: t };
    setCorrespondenceMessages((prev) => {
      const next = [...prev, msg];
      persistCorrespondence(next);
      return next;
    });
    appendTimeline("Korespondencja", t.length > 120 ? `${t.slice(0, 120)}…` : t);
    setCorrespondenceDraft("");
  }, [appendTimeline, correspondenceDraft, data, persistCorrespondence]);

  const refreshShipment = useCallback(async () => {
    if (!Number.isFinite(cid) || cid <= 0 || warehouseId == null) return;
    try {
      const r = await getComplaintShipment(cid, DAMAGE_TENANT_ID, warehouseId);
      setShipment(r.shipment ?? null);
      setServiceShipment(r.service_shipment ?? null);
      setOutboundShipment(r.outbound_shipment ?? null);
    } catch {
      setShipment(null);
      setServiceShipment(null);
      setOutboundShipment(null);
    }
  }, [cid, warehouseId]);

  const refreshComplaintFromApi = useCallback(async () => {
    if (!Number.isFinite(cid) || cid <= 0 || warehouseId == null) return;
    try {
      const r = await getComplaint(cid, DAMAGE_TENANT_ID, warehouseId);
      setData(r);
    } catch {
      /* zostaw bieżące dane */
    }
  }, [cid, warehouseId]);

  useEffect(() => {
    setShipment(null);
    setServiceShipment(null);
    setOutboundShipment(null);
  }, [cid]);

  useEffect(() => {
    if (data == null || warehouseId == null) return;
    if (data.id !== cid) return;
    void refreshShipment();
  }, [cid, data?.id, refreshShipment, warehouseId]);

  const shipmentTimeline = useMemo((): TimelineEvent[] => {
    if (!shipment?.events?.length) return [];
    return shipment.events.map((e) => ({
      id: `sh-ev-${e.id}`,
      at: e.created_at ? new Date(e.created_at).getTime() : 0,
      title: e.title,
    }));
  }, [shipment]);

  const serviceShipmentTimeline = useMemo((): TimelineEvent[] => {
    if (!serviceShipment?.events?.length) return [];
    return serviceShipment.events.map((e) => ({
      id: `sh-svc-${e.id}`,
      at: e.created_at ? new Date(e.created_at).getTime() : 0,
      title: e.title,
    }));
  }, [serviceShipment]);

  const complaintHistoryRows = useMemo(() => {
    if (data == null) return [];
    const lines = data.lines ?? [];
    const structured = (data.complaint_events ?? []).length
      ? buildStructuredTimelineRows(data.complaint_events, lines)
      : [];

    if (structured.length > 0) {
      const uiRows: ComplaintHistoryRow[] = [];
      const hasCreated = (data.complaint_events ?? []).some((e) => e.event_type === "COMPLAINT_CREATED");
      if (data.created_at && !hasCreated) {
        const at = new Date(data.created_at).getTime();
        uiRows.push({
          id: "ui-created",
          at,
          dateLabel: formatComplaintAuditDateTime(data.created_at),
          actor: COMPLAINT_TIMELINE_ACTOR,
          actionBold: "Utworzono reklamację",
          detail: data.reference_code ? `Ref. ${data.reference_code}` : undefined,
        });
      }
      if (data.auto_accepted || data.accepted_by_law) {
        const evs = data.complaint_events ?? [];
        if (!evs.some((e) => e.event_type === "COMPLAINT_AUTO_ACCEPTED_LAW")) {
          const raw = data.response_deadline?.trim()
            ? Date.parse(data.response_deadline)
            : data.created_at
              ? Date.parse(data.created_at)
              : NaN;
          const at = Number.isFinite(raw) ? raw : Date.now();
          uiRows.push({
            id: "ui-auto-accept-law",
            at,
            dateLabel: formatComplaintAuditDateTime(new Date(at).toISOString()),
            actor: COMPLAINT_TIMELINE_ACTOR,
            actionBold: "Reklamacja uznana z mocy prawa",
            detail: "wpis uzupełniający — brak osobnego wpisu w starszej reklamacji",
          });
        }
      }
      const extraRows = extraTimeline.map((ev) => timelineEventToHistoryRow(ev));
      return dedupeComplaintHistoryRows(mergeAndSortHistoryRows([...uiRows, ...structured, ...extraRows]));
    }

    const auditRows = (data.audit_events ?? [])
      .filter((e) => e.type !== "decision_update")
      .map((e, i) => humanizeComplaintAuditEvent(e, i, lines));

    const uiRows: ComplaintHistoryRow[] = [];
    const hasCreatedAudit = (data.audit_events ?? []).some((e) => e.type === "complaint_created");
    if (data.created_at && !hasCreatedAudit) {
      const at = new Date(data.created_at).getTime();
      uiRows.push({
        id: "ui-created",
        at,
        dateLabel: formatComplaintAuditDateTime(data.created_at),
        actor: COMPLAINT_TIMELINE_ACTOR,
        actionBold: "Utworzono reklamację",
        detail: data.reference_code ? `Ref. ${data.reference_code}` : undefined,
      });
    }
    if (data.auto_accepted || data.accepted_by_law) {
      const evs = data.audit_events ?? [];
      if (!evs.some((e) => e.type === "auto_accepted_by_law")) {
        const raw = data.response_deadline?.trim()
          ? Date.parse(data.response_deadline)
          : data.created_at
            ? Date.parse(data.created_at)
            : NaN;
        const at = Number.isFinite(raw) ? raw : Date.now();
        uiRows.push({
          id: "ui-auto-accept-law",
          at,
          dateLabel: formatComplaintAuditDateTime(new Date(at).toISOString()),
          actor: COMPLAINT_TIMELINE_ACTOR,
          actionBold: "Reklamacja uznana z mocy prawa",
          detail: "wpis uzupełniający — brak osobnego wpisu audytu w starszej reklamacji",
        });
      }
    }

    const shipRows = shipmentTimeline.map((ev) => timelineEventToHistoryRow(ev));
    const svcRows = serviceShipmentTimeline.map((ev) => timelineEventToHistoryRow(ev));
    const extraRows = extraTimeline.map((ev) => timelineEventToHistoryRow(ev));

    return dedupeComplaintHistoryRows(
      mergeAndSortHistoryRows([...uiRows, ...auditRows, ...shipRows, ...svcRows, ...extraRows]),
    );
  }, [
    data,
    extraTimeline,
    serviceShipmentTimeline,
    shipmentTimeline,
  ]);

  const journalTotalPages = useMemo(() => {
    const n = complaintHistoryRows.length;
    if (n === 0) return 1;
    return Math.max(1, Math.ceil(n / journalPageSize));
  }, [complaintHistoryRows.length, journalPageSize]);

  const journalRows = useMemo(() => {
    const start = journalPage * journalPageSize;
    return complaintHistoryRows.slice(start, start + journalPageSize);
  }, [complaintHistoryRows, journalPage, journalPageSize]);

  useEffect(() => {
    setJournalPage(0);
  }, [data?.id, journalPageSize]);

  useEffect(() => {
    setJournalPage((p) => Math.min(p, Math.max(0, journalTotalPages - 1)));
  }, [journalTotalPages]);

  const applyDecisionPatch = useCallback(
    async (partial: ComplaintDecisionPatchPayload, timelineNote?: { title: string; subtitle?: string }) => {
      if (data == null || warehouseId == null) return;
      setDecisionSaving(true);
      setErr(null);
      try {
        const updated = await patchComplaintDecisions(data.id, DAMAGE_TENANT_ID, warehouseId, partial);
        setData(updated);
        if (timelineNote) appendTimeline(timelineNote.title, timelineNote.subtitle);
      } catch {
        setErr("Nie udało się zapisać decyzji — sprawdź warunki rozliczenia (pozycje / poważna wada).");
      } finally {
        setDecisionSaving(false);
      }
    },
    [appendTimeline, data, warehouseId],
  );

  const patchProcessStatus = useCallback(
    (next: ComplaintStatusCode) => {
      if (data == null || warehouseId == null) return;
      if (
        (next === "ZAAKCEPTOWANA" || next === "ODRZUCONA") &&
        !complaintLinesReadyForFinalDecision(data.lines ?? [])
      ) {
        setProcessActionErr(COMPLAINT_FINAL_DECISION_BLOCK_MSG);
        return;
      }
      setProcessActionErr(null);
      setPatching(true);
      void patchComplaintStatus(data.id, DAMAGE_TENANT_ID, warehouseId, next)
        .then((updated) => {
          setData(updated);
        })
        .catch(() => setErr("Nie udało się zapisać etapu reklamacji."))
        .finally(() => setPatching(false));
    },
    [data, warehouseId],
  );

  useEffect(() => {
    if (import.meta.env.DEV) console.log("[complaints] response.items", data?.lines ?? []);
  }, [data?.lines]);

  const closeBlockingLines = useMemo(() => {
    if (data == null) return [];
    const st = normalizeComplaintStatus(data.status);
    if (st === "ZAAKCEPTOWANA" || st === "ODRZUCONA") return [];
    if (complaintLinesReadyForFinalDecision(data.lines ?? [])) return [];
    return getComplaintCloseBlockingLines(data.lines ?? []);
  }, [data, data?.id, data?.status, data?.lines]);

  if (warehouseId == null) {
    return (
      <div className={`${panelDetailPageSectionSpacingClass} rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950`}>
        Wybierz magazyn w górnym pasku.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center gap-2 text-sm text-slate-600">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
        Ładowanie…
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-700">{err ?? "Brak danych."}</p>
        <button
          type="button"
          className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
          onClick={() => navigate(backListPath)}
        >
          ← {fromOrdersContext ? "Lista zamówień" : "Lista reklamacji"}
        </button>
      </div>
    );
  }

  const processStatus = normalizeComplaintStatus(data.status);
  const linesReadyForFinal = complaintLinesReadyForFinalDecision(data.lines ?? []);
  const terminalTimelineLocked =
    !linesReadyForFinal && processStatus !== "ZAAKCEPTOWANA" && processStatus !== "ODRZUCONA";
  const responseDeadlineRaw = data.response_deadline?.trim() ?? "";
  const showResponseDeadlineAside =
    responseDeadlineRaw.length > 0 &&
    !Number.isNaN(Date.parse(responseDeadlineRaw)) &&
    processStatus !== "ODRZUCONA";
  const secondaryUnlocked = complaintSecondaryPathsUnlocked(data);
  const decisionBusy = patching || decisionSaving;
  const isDecisionPhase = processStatus === "DECYZJA";
  const showSettlementSection =
    processStatus === "DECYZJA" ||
    processStatus === "ZAAKCEPTOWANA" ||
    processStatus === "ODRZUCONA";

  const fmtMoney = (rec: Record<string, number>) =>
    Object.entries(rec)
      .filter(([, v]) => v > 0)
      .map(([cur, v]) => `${v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`)
      .join(" · ") || "—";
  const productsRefundDisplay = fmtMoney(refundSummary.productsRefundByCurrency);
  const shippingRefundDisplay = refundSummary.includesShippingRefund ? fmtMoney(refundSummary.shippingRefundByCurrency) : "—";
  const finalRefundDisplay = fmtMoney(refundSummary.finalTotalByCurrency);

  /** Light section chrome inside the single main panel — avoid nested white cards. */
  const sectionShellClass = "rounded-lg border border-slate-200/80 bg-slate-50/40 p-3";
  const sectionTitle = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

  const correspondenceSectionContent = (
    <>
      <div className="max-h-36 overflow-y-auto overflow-x-hidden rounded-md border border-gray-100 bg-gray-50/80 p-1.5 overscroll-contain">
        {correspondenceMessages.length === 0 ? (
          <p className="px-1 py-2 text-center text-[11px] text-gray-500">Brak wiadomości</p>
        ) : (
          correspondenceMessages.map((m) => (
            <div key={m.id} className="mb-1.5 last:mb-0 rounded border border-gray-100 bg-white px-2 py-1 shadow-sm">
              <p className="tabular-nums text-[10px] text-gray-400">{formatTimelineDate(m.at)}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-800">{m.text}</p>
            </div>
          ))
        )}
      </div>
      <textarea
        value={correspondenceDraft}
        onChange={(e) => setCorrespondenceDraft(e.target.value)}
        rows={2}
        placeholder="Treść wiadomości…"
        className="w-full resize-y rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400"
      />
      <button
        type="button"
        onClick={sendCorrespondence}
        disabled={!correspondenceDraft.trim()}
        className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Send className="h-3.5 w-3.5" aria-hidden />
        Wyślij
      </button>
    </>
  );

  const settlementSectionContent = showSettlementSection ? (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 p-3 text-gray-700">
      <p className="text-xs font-semibold text-gray-800">Rozliczenie reklamacji</p>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
        Zwrot wysyłki jest liczony raz na reklamację, gdy zapisano zwrot za przynajmniej jedną pozycję (decyzja zwrot +
        kwota). Wartość dostawy pochodzi z zamówienia.
      </p>
      {processStatus === "DECYZJA" ? (
        <div className="mt-3 rounded-md border border-slate-200/80 bg-white/70 px-2.5 py-2 text-xs text-slate-800">
          <p className="font-medium leading-snug">{SETTLEMENT_MSG_DECISION_PHASE}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{SETTLEMENT_MSG_PREREQ_CLOSE}</p>
        </div>
      ) : null}
      <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-md border border-gray-100 bg-white/90 px-2.5 py-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Pozycje ze zwrotem (decyzja)</dt>
          <dd className="mt-0.5 tabular-nums text-sm font-semibold text-gray-900">{refundSummary.refundLineCount}</dd>
        </div>
        <div className="rounded-md border border-gray-100 bg-white/90 px-2.5 py-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Pozycje z wymianą</dt>
          <dd className="mt-0.5 tabular-nums text-sm font-semibold text-gray-900">{refundSummary.exchangeLineCount}</dd>
        </div>
        <div className="rounded-md border border-gray-100 bg-white/90 px-2.5 py-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Pozycje odrzucone</dt>
          <dd className="mt-0.5 tabular-nums text-sm font-semibold text-gray-900">{refundSummary.rejectedLineCount}</dd>
        </div>
        <div className="rounded-md border border-gray-100 bg-white/90 px-2.5 py-2 sm:col-span-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Wartość zwrotów</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">{productsRefundDisplay}</dd>
        </div>
        <div className="rounded-md border border-gray-100 bg-white/90 px-2.5 py-2 sm:col-span-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Zwrot wysyłki</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">{shippingRefundDisplay}</dd>
        </div>
        <div className="rounded-md border border-gray-200 bg-white px-2.5 py-2 sm:col-span-2">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">Łącznie do zwrotu</dt>
          <dd className="mt-0.5 text-base font-semibold tabular-nums text-gray-900">{finalRefundDisplay}</dd>
        </div>
      </dl>
    </div>
  ) : (
    <p className="text-xs text-gray-500">
      Dostępne w etapie decyzji oraz po zamknięciu reklamacji (zaakceptowana / odrzucona).
    </p>
  );

  const relatedComplaintsAside =
    data.parent_complaint != null || (data.child_complaints?.length ?? 0) > 0 ? (
      <div className={sectionShellClass}>
        <h2 className={sectionTitle}>Powiązane reklamacje</h2>
        <p className="mt-1 text-xs text-slate-500">
          Relacja nadrzędna / kontynuacje — ten sam klient i zamówienie mogą mieć kilka zgłoszeń.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {data.parent_complaint ? (
            <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
              <div>
                <span className="text-xs font-medium text-gray-500">Nadrzędna</span>
                <Link
                  className="ml-2 font-semibold text-blue-700 hover:underline"
                  to={`/complaints/${data.parent_complaint.id}`}
                >
                  #{data.parent_complaint.id}
                  {data.parent_complaint.reference_code ? ` · ${data.parent_complaint.reference_code}` : ""}
                </Link>
              </div>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${complaintRowStatusPresentation(data.parent_complaint.status).badgeClass}`}
              >
                {complaintRowStatusPresentation(data.parent_complaint.status).label}
              </span>
            </li>
          ) : null}
          {(data.child_complaints ?? []).map((ch) => {
            const pr = complaintRowStatusPresentation(ch.status);
            return (
              <li
                key={ch.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2"
              >
                <Link className="font-semibold text-blue-700 hover:underline" to={`/complaints/${ch.id}`}>
                  #{ch.id}
                  {ch.reference_code ? ` · ${ch.reference_code}` : ""}
                </Link>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${pr.badgeClass}`}>
                  {pr.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  return (
    <>
      <nav className="mb-2.5 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Ścieżka nawigacji">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 font-medium text-slate-500 transition hover:text-slate-800"
          aria-label="Panel"
        >
          <Home className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        </Link>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
        {fromOrdersContext ? (
          <Link to="/orders/list" className="font-medium text-slate-500 transition hover:text-slate-800">
            Zamówienia
          </Link>
        ) : (
          <Link to="/complaints" className="font-medium text-slate-500 transition hover:text-slate-800">
            Reklamacje
          </Link>
        )}
      </nav>

      <div className={panelDetailPageSectionSpacingClass}>
            <PanelDetailEntityHeader
              compact
              title={<>Reklamacja #{data.id}</>}
              status={complaintRawStatusToPanelBrief(data.status)}
              meta={
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-slate-500">
                  {data.created_at ? (
                    <span>{formatTimelineDate(new Date(data.created_at).getTime())}</span>
                  ) : null}
                  {data.reference_code ? <span className="text-slate-600">· Ref {data.reference_code}</span> : null}
                  <span className="text-slate-600">· Magazyn #{data.warehouse_id}</span>
                  {data.accepted_by_law || data.auto_accepted ? (
                    <span className="inline-flex items-center gap-1">
                      <ComplaintAutoAcceptBadge />
                    </span>
                  ) : null}
                </div>
              }
              actions={
                <Link
                  to={backListPath}
                  className={listSellasistToolbarSquareBtn}
                  title={fromOrdersContext ? "Lista zamówień" : "Lista reklamacji"}
                  aria-label={fromOrdersContext ? "Lista zamówień" : "Lista reklamacji"}
                >
                  <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                </Link>
              }
            />

            <div className={`${panelDetailMainGridClass} mt-3`}>
              <div
                className={`${
                  relatedComplaintsAside ? panelDetailMainColClass : "col-span-12"
                } flex min-w-0 flex-col gap-4`}
              >
                <div className="space-y-3">
                  <section className="min-w-0 border-b border-slate-200/90 pb-4">
            <h2 className={sectionTitle}>Przebieg reklamacji</h2>
            {terminalTimelineLocked || (processActionErr && processActionErr === COMPLAINT_FINAL_DECISION_BLOCK_MSG) ? (
              <div
                className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
                role="status"
              >
                <p className="font-medium">{COMPLAINT_FINAL_DECISION_BLOCK_MSG}</p>
                {closeBlockingLines.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc space-y-1 text-[11px] text-amber-950/95">
                    {closeBlockingLines.map((row) => (
                      <li key={row.lineId}>
                        <span className="font-medium">{row.productLabel}</span>
                        {" — "}
                        {row.reason === "missing_decision"
                          ? "brak decyzji na pozycji"
                          : "nieukończone operacje"}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {processActionErr && processActionErr !== COMPLAINT_FINAL_DECISION_BLOCK_MSG ? (
              <p className="mt-2 text-sm text-red-700" role="alert">
                {processActionErr}
              </p>
            ) : null}
            <div className="mt-3 flex flex-col gap-4 md:mt-4 md:flex-row md:items-center md:gap-0">
              <div className="min-w-0 flex-1">
                <ComplaintTimeline
                  status={data.status}
                  disabled={patching}
                  terminalClickDisabled={terminalTimelineLocked}
                  onChange={patchProcessStatus}
                />
              </div>
              {showResponseDeadlineAside ? (
                <>
                  <div className="h-px w-full shrink-0 bg-gray-200 md:hidden" aria-hidden />
                  <div
                    className="hidden shrink-0 self-center bg-gray-200 md:block md:h-14 md:w-px md:mx-5"
                    aria-hidden
                  />
                  <div className="shrink-0">
                    <ComplaintResponseDeadlineBanner
                      responseDeadline={data.response_deadline}
                      status={data.status}
                      autoAccepted={data.auto_accepted}
                      acceptedByLaw={data.accepted_by_law}
                      daysRemainingServer={data.response_deadline_days_remaining ?? undefined}
                      isOverdueServer={data.response_deadline_is_overdue ?? undefined}
                      compact
                      hideDeadlineDateDuplicate
                      processAside
                    />
                  </div>
                </>
              ) : null}
            </div>
                  </section>
          {processStatus === "OCZEKIWANIE_NA_PRODUKT" ? (
            <div className="rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-950">
              <p className="font-semibold">Oczekujemy na dostarczenie produktu</p>
              {data.waiting_for_product_since ? (
                <p className="mt-1 text-xs opacity-90">
                  Oczekiwanie od: {formatTimelineDate(new Date(data.waiting_for_product_since).getTime())}
                </p>
              ) : null}
            </div>
          ) : null}
          {data.waiting_product_followup_due ? (
            <div className="rounded-lg border border-orange-200/90 bg-orange-50/90 px-3 py-2.5 text-sm text-orange-950">
              <p className="font-semibold">Przypomnienie (≥ 7 dni)</p>
              <p className="mt-1 text-xs">Oczekiwanie na produkt trwa długo — rozważ kontakt z klientem.</p>
            </div>
          ) : null}
                </div>

          <ComplaintLinesDecisionsPanel
            data={data}
            tenantId={DAMAGE_TENANT_ID}
            warehouseId={warehouseId ?? data.warehouse_id}
            disabled={decisionBusy || patching}
            onUpdated={(next) => setData(next)}
            onExchangePickupModeSelected={() => pickupTransportRef.current?.openPickupModal()}
            onInlineExchangeOrder={(lineId, kind) => setReplacementModal({ lineId, kind })}
            settlementSection={settlementSectionContent}
            correspondenceSection={correspondenceSectionContent}
            shipment={shipment}
            serviceShipment={serviceShipment}
            outboundShipment={outboundShipment}
            onShipmentsUpdated={(r) => {
              setShipment(r.shipment ?? null);
              setServiceShipment(r.service_shipment ?? null);
              setOutboundShipment(r.outbound_shipment ?? null);
            }}
            onComplaintSynced={() => void refreshComplaintFromApi()}
            pickupTransportRef={pickupTransportRef}
            onRejectKind={(kind) =>
              appendTimeline(kind === "photos" ? "Odrzucono na podstawie zdjęć" : "Odrzucono reklamację", undefined)
            }
          />
          <div className="mt-4">
            <ComplaintExchangeOrderSection
              data={data}
              tenantId={DAMAGE_TENANT_ID}
              warehouseId={warehouseId}
              focusLineId={replacementModal?.lineId ?? null}
              focusComplaintOrderKind={replacementModal?.kind ?? null}
              onConsumedFocus={() => {}}
              onComplaintUpdated={(next) => setData(next)}
              modal={{
                open: replacementModal != null,
                onClose: () => setReplacementModal(null),
              }}
              hideComplaintOrderTypeSwitch
            />
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            {isDecisionPhase && (data.major_defect || !secondaryUnlocked) ? (
              <div className="shrink-0">
                <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 p-3">
                  {data.major_defect ? (
                    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-center text-sm font-medium text-green-900 sm:text-left">
                        Oznaczono poważną wadę — możesz wybrać zwrot lub obniżkę.
                      </p>
                      <button
                        type="button"
                        disabled={decisionBusy}
                        onClick={() =>
                          void applyDecisionPatch(
                            { major_defect: false },
                            { title: "Poważna wada", subtitle: "Cofnięto oznaczenie" },
                          )
                        }
                        className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cofnij oznaczenie
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={decisionBusy}
                        onClick={() =>
                          void applyDecisionPatch(
                            { major_defect: true },
                            { title: "Poważna wada", subtitle: "Oznaczono" },
                          )
                        }
                        className="w-full rounded-xl border border-amber-200 bg-white px-4 py-3 text-center text-sm font-semibold text-amber-950 shadow-sm hover:bg-amber-50/80 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Oznacz jako poważna wada
                      </button>
                      <p className="flex items-start gap-1.5 text-xs text-amber-900">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        Użyj, gdy wada uniemożliwia standardową naprawę lub wymianę.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

            </div>
            {relatedComplaintsAside ? (
              <aside className={`${panelDetailAsideColClass} flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start`}>
                {relatedComplaintsAside}
              </aside>
            ) : null}
            </div>

            <div className="mt-4 border-t border-slate-200 pt-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className={sectionTitle}>Dziennik zdarzeń</h2>
              <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
                <span className="whitespace-nowrap">Na stronę</span>
                <select
                  value={journalPageSize}
                  onChange={(ev) => setJournalPageSize(Number(ev.target.value))}
                  className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs text-gray-800"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="table-fixed w-full min-w-[520px] border-collapse text-left text-xs leading-tight text-gray-900">
                <colgroup>
                  <col className="w-[152px]" />
                  <col className="w-[108px]" />
                  <col />
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-300 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    <th scope="col" className="py-1.5 pr-2 align-bottom whitespace-nowrap">
                      Data
                    </th>
                    <th scope="col" className="py-1.5 pr-2 align-bottom whitespace-nowrap">
                      Użytkownik
                    </th>
                    <th scope="col" className="py-1.5 align-bottom">
                      Działanie
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {complaintHistoryRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-2 text-gray-500">
                        Brak zapisanych zdarzeń.
                      </td>
                    </tr>
                  ) : (
                    journalRows.map((row) => {
                      const actionTitle = formatComplaintJournalAction(row);
                      return (
                        <tr
                          key={row.id}
                          className="border-b border-gray-200/90 transition-colors hover:bg-slate-50/90"
                        >
                          <td className="max-h-9 py-1 pr-2 align-middle tabular-nums text-[10px] leading-snug text-gray-400 whitespace-nowrap">
                            {row.dateLabel}
                          </td>
                          <td className="max-h-9 py-1 pr-2 align-middle text-[11px] text-gray-600 whitespace-nowrap">
                            {row.actor}
                          </td>
                          <td className="max-h-9 min-w-0 py-1 align-middle text-[11px] text-gray-800">
                            <div
                              className="min-w-0 truncate whitespace-nowrap"
                              title={actionTitle}
                            >
                              <span className="font-semibold text-gray-900">{row.actionBold}</span>
                              {row.detail ? (
                                <>
                                  <span className="font-normal text-gray-500"> — </span>
                                  <span className="font-normal text-gray-700">{row.detail}</span>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {complaintHistoryRows.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600">
                <span className="tabular-nums">
                  {journalPage * journalPageSize + 1}–
                  {Math.min((journalPage + 1) * journalPageSize, complaintHistoryRows.length)} z {complaintHistoryRows.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={journalPage <= 0}
                    onClick={() => setJournalPage((p) => Math.max(0, p - 1))}
                    className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs disabled:opacity-40"
                  >
                    Poprzednia
                  </button>
                  <span className="tabular-nums px-1">
                    {journalPage + 1} / {journalTotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={journalPage >= journalTotalPages - 1}
                    onClick={() => setJournalPage((p) => Math.min(journalTotalPages - 1, p + 1))}
                    className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs disabled:opacity-40"
                  >
                    Następna
                  </button>
                </div>
              </div>
            ) : null}
            </div>
      </div>
    </>
  );
}
