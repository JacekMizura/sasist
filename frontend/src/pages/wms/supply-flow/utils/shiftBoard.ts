/**
 * Presentation mappers — warehouse language only.
 * Consumes existing plan JSON; does not change engine contracts.
 */

import type {
  SupplyFlowCta,
  SupplyFlowExplainable,
  SupplyFlowLivingPlan,
  SupplyFlowNextAction,
} from "../../../../api/supplyFlowApi";
import type { DeliveryListRow } from "../../../../api/inboundDeliveriesApi";

export type UrgencyBand = "urgent" | "first" | "next" | "later";

export type DeliveryEnrichment = {
  supplierName?: string | null;
  documentNumber?: string | null;
};

export type AttentionView = {
  title: string;
  deliveryId: number | null;
  whyBullets: string[];
  ctaLabel: string;
  ctaHref: string;
  blockedReason?: string | null;
};

export type QueueCardView = {
  deliveryId: number;
  title: string;
  supplier: string;
  documentLabel: string;
  urgencyLabel: string;
  urgencyBand: UrgencyBand;
  effectLine: string;
  phaseLabel: string;
  why: string[];
  ctaLabel: string;
  ctaHref: string;
};

export type WorkStepView = {
  seq: number;
  title: string;
  statusLabel: string;
  statusKey: string;
  goal: string;
};

export type AlertView = {
  severity: "critical" | "warning";
  title: string;
  detail?: string;
  ctaLabel: string;
  ctaHref: string;
};

export type WarehouseStateView = {
  onRamp: number;
  unloading: number;
  awaitingPutaway: number;
  putawayInProgress: number;
  inboundPending: number;
  unlockableOrders: number;
};

export type NextAfterView = {
  title: string;
  ctaLabel: string;
  ctaHref: string;
} | null;

export type ShiftBoardView = {
  hasPlan: boolean;
  attention: AttentionView | null;
  queue: QueueCardView[];
  remainingAfterQueue: number;
  nextAfter: NextAfterView;
  workPlan: WorkStepView[];
  alerts: AlertView[];
  warehouseState: WarehouseStateView;
  emptyGuide: {
    title: string;
    detail: string;
    ctaLabel: string;
    ctaHref: string;
  } | null;
};

const PHASE_PL: Record<string, string> = {
  AWIZOWANA: "Awizowana",
  W_DRODZE: "W drodze",
  NA_RAMPIE: "Na rampie",
  ROZLADUNEK: "Rozładunek",
  OCZEKUJE_ROZLOKOWANIA: "Oczekuje rozlokowania",
  ROZLOKOWANIE: "Rozlokowanie",
  ZAKONCZONA: "Zakończona",
};

function phasePl(phase?: string | null): string {
  if (!phase) return "—";
  return PHASE_PL[String(phase).toUpperCase()] ?? String(phase);
}

export function urgencyBand(score?: number | null): UrgencyBand {
  const n = Number(score);
  if (!Number.isFinite(n)) return "later";
  if (n >= 150) return "urgent";
  if (n >= 100) return "first";
  if (n >= 50) return "next";
  return "later";
}

export function urgencyLabel(band: UrgencyBand): string {
  switch (band) {
    case "urgent":
      return "Pilne";
    case "first":
      return "Najpierw";
    case "next":
      return "Następne";
    default:
      return "Do wykonania";
  }
}

export function urgencyBandClass(band: UrgencyBand): string {
  switch (band) {
    case "urgent":
      return "bg-orange-100 text-orange-900 border-orange-200";
    case "first":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "next":
      return "bg-sky-50 text-sky-800 border-sky-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function deliveryTitle(id: number | null | undefined, enrichment?: DeliveryEnrichment): string {
  if (id == null) return "Praca na magazynie";
  if (enrichment?.documentNumber) return enrichment.documentNumber;
  return `Dostawa D-${id}`;
}

function isJargon(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /polic(y|ies)|resolver|planner|monitor|pipeline|capability|score|weight|source=|priorityresolver|phasepolicy|demandpolicy|etapolicy|capacitypolicy|slottingpolicy|recoverypolicy|living plan|supply flow|execution|recommendation|trigger|plan_version|computed_at|start_|continue_|consider_|podpowiedz|priorytet|przelicz|ścieżk|sciez|obsłuż|obsluz|śledź|sledz|regułach rozmieszczenia|reguly rozmieszczenia/i.test(
      t,
    ) || /wynik priority|projekcja|capability pack|recovery/i.test(t)
  );
}

function businessWhyFromRow(
  row: Record<string, unknown> | null,
  explanation: SupplyFlowExplainable | null,
  effect: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  const unlock = Number(row?.unlockable_order_count || effect.unlockable_order_estimate || 0);
  const openPz = Number(row?.open_pz_count || 0);
  const phase = String(row?.operational_phase || "").toUpperCase();

  if (unlock > 0) out.push(`odblokuje ${unlock} zamówień`);
  if (phase === "NA_RAMPIE" || phase === "ROZLADUNEK") {
    out.push("zwolni miejsce na rampie");
  }
  if (phase === "OCZEKUJE_ROZLOKOWANIA" || phase === "ROZLOKOWANIE") {
    out.push("udostępni towar do kompletacji i pakowania");
  }
  if (openPz > 0 && out.length < 2) {
    out.push(openPz === 1 ? "czeka na rozlokowanie z PZ" : `czeka na rozlokowanie (${openPz} PZ)`);
  }

  for (const line of explanation?.why || []) {
    if (out.length >= 2) break;
    if (!line || isJargon(line)) continue;
    const cleaned = line
      .replace(/^Rekomendacja «[^»]+»[^.]*\.\s*/i, "")
      .replace(/regułach rozmieszczenia/gi, "strefach magazynu")
      .trim();
    if (cleaned && !isJargon(cleaned) && cleaned.length < 120) {
      if (!out.some((x) => x.toLowerCase() === cleaned.toLowerCase())) {
        out.push(cleaned.charAt(0).toLowerCase() + cleaned.slice(1));
      }
    }
  }

  for (const p of explanation?.top_policies || []) {
    if (out.length >= 2) break;
    const reason = String(p.reason || "").trim();
    if (!reason || isJargon(reason)) continue;
    if (!out.some((x) => x.toLowerCase().includes(reason.toLowerCase().slice(0, 24)))) {
      out.push(reason.charAt(0).toLowerCase() + reason.slice(1));
    }
  }

  if (!out.length) {
    if (phase === "W_DRODZE" || phase === "AWIZOWANA") out.push("trzeba przygotować przyjęcie");
    else out.push("przyspieszy pracę wysyłki");
  }

  return out.slice(0, 2);
}

function effectLine(row: Record<string, unknown>): string {
  const unlock = Number(row.unlockable_order_count || 0);
  const openPz = Number(row.open_pz_count || 0);
  const phase = String(row.operational_phase || "").toUpperCase();
  if (unlock > 0) return `Odblokuje ${unlock} zamówień`;
  if (openPz > 0) return `Czeka na rozlokowanie (${openPz} PZ)`;
  if (phase === "NA_RAMPIE" || phase === "ROZLADUNEK") return "Czeka na rampie";
  if (phase === "W_DRODZE" || phase === "AWIZOWANA") return "Do przygotowania przyjęcia";
  return phasePl(phase);
}

function fallbackHref(phase: string | null | undefined, deliveryId: number | null): string {
  const p = String(phase || "").toUpperCase();
  if (p.includes("ROZLOKOW")) return "/wms/putaway";
  if (p === "NA_RAMPIE" || p === "ROZLADUNEK") return "/wms/receiving";
  if (p === "AWIZOWANA" || p === "W_DRODZE") {
    return deliveryId != null ? `/wms/goods-orders/${deliveryId}` : "/wms/goods-orders";
  }
  return "/wms/receiving";
}

function ctaFor(
  phase: string | null | undefined,
  cta: SupplyFlowCta | null | undefined,
  next: SupplyFlowNextAction | null | undefined,
  deliveryId: number | null,
  opts?: { pathHint?: string | null; moduleHint?: string | null },
): { label: string; href: string; blockedReason: string | null } {
  const rawHref = resolveHref(opts?.pathHint || next?.path || cta?.path || null);
  const path = rawHref || "";
  const p = String(phase || "").toUpperCase();
  const module = String(opts?.moduleHint || next?.kind || cta?.module || "").toLowerCase();

  let label = "Przejdź do przyjęcia";
  if (path.includes("/putaway") || module === "putaway" || p.includes("ROZLOKOW")) {
    label = "Rozpocznij rozlokowanie";
  } else if (
    path.includes("/receiving") ||
    module === "receiving" ||
    p === "NA_RAMPIE" ||
    p === "ROZLADUNEK"
  ) {
    label = "Rozpocznij rozładunek";
  } else if (path.includes("/goods-orders") || module === "inbound_delivery") {
    label = "Przejdź do przyjęcia";
  } else if (p === "AWIZOWANA" || p === "W_DRODZE") {
    label = "Przygotuj przyjęcie";
  } else if (cta?.label && !/wykonan|execute|open|run|ścież|sciez|podpowiedz|przelicz/i.test(cta.label)) {
    label = cta.label;
  }

  const href = rawHref || fallbackHref(phase, deliveryId);
  return { label, href, blockedReason: null };
}

function attentionTitle(
  phase: string | null | undefined,
  deliveryId: number | null,
  enr?: DeliveryEnrichment,
): string {
  const name = deliveryTitle(deliveryId, enr);
  const p = String(phase || "").toUpperCase();
  if (p === "NA_RAMPIE" || p === "ROZLADUNEK") return `Rozładuj dostawę ${name}`;
  if (p === "OCZEKUJE_ROZLOKOWANIA" || p === "ROZLOKOWANIE") return `Rozlokuj dostawę ${name}`;
  if (p === "AWIZOWANA" || p === "W_DRODZE") return `Przygotuj przyjęcie: ${name}`;
  if (deliveryId == null) return "Sprawdź braki na magazynie";
  return `Zacznij od dostawy ${name}`;
}

function stepTitle(
  action: string | undefined,
  deliveryId: number | null | undefined,
  enr?: DeliveryEnrichment,
): string {
  const a = String(action || "").toUpperCase();
  const name = deliveryTitle(deliveryId ?? null, enr);
  if (a.includes("PUTAWAY") || a.includes("CROSS_DOCK")) {
    if (a.includes("CROSS")) return `Skieruj towary z ${name} na Cross Dock`;
    return `Rozlokuj produkty z ${name}`;
  }
  if (a.includes("RECEIV") || a.includes("UNLOAD")) return `Rozładuj ${name}`;
  if (a.includes("MONITOR")) return `Przygotuj przyjęcie ${name} (w drodze)`;
  if (a.includes("RECOVERY")) return "Rozlokuj towar, żeby odblokować braki";
  return deliveryId != null ? `Kontynuuj pracę przy ${name}` : "Wykonaj kolejną pracę na magazynie";
}

function stepGoal(row: Record<string, unknown> | null, action?: string): string {
  const unlock = Number(row?.unlockable_order_count || 0);
  const a = String(action || "").toUpperCase();
  if (unlock > 0) return `Odblokowanie ${unlock} zamówień`;
  if (a.includes("PUTAWAY")) return "Udostępnienie towaru do kompletacji i pakowania";
  if (a.includes("RECEIV") || a.includes("UNLOAD")) return "Zwolnienie rampy i przyjęcie towaru";
  if (a.includes("CROSS")) return "Szybsze wydanie bez pełnego składowania";
  return "Kontynuacja pracy przy dostawie";
}

function statusLabel(status?: string | null): string {
  switch (String(status || "").toUpperCase()) {
    case "READY":
      return "Do wykonania";
    case "IN_PROGRESS":
      return "W toku";
    case "DONE":
      return "Gotowe";
    case "BLOCKED":
      return "Zablokowane";
    case "SKIPPED":
      return "Nie dotyczy";
    case "FAILED":
      return "Wymaga interwencji";
    default:
      return "Oczekuje";
  }
}

function resolveHref(path?: string | null): string | null {
  if (!path) return null;
  return path.startsWith("/") ? path : `/${path}`;
}

function alertAction(
  deliveryId: number | null,
  enrichmentById: Record<number, DeliveryEnrichment>,
  rowById: Map<number, Record<string, unknown>>,
): { ctaLabel: string; ctaHref: string } {
  if (deliveryId != null) {
    const row = rowById.get(deliveryId);
    const phase = String(row?.operational_phase || "");
    const c = ctaFor(phase, null, null, deliveryId);
    return { ctaLabel: c.label, ctaHref: c.href };
  }
  return { ctaLabel: "Przejdź do przyjęcia", ctaHref: "/wms/receiving" };
}

export function buildShiftBoard(
  plan: SupplyFlowLivingPlan | null,
  enrichmentById: Record<number, DeliveryEnrichment> = {},
): ShiftBoardView {
  const emptyState: WarehouseStateView = {
    onRamp: 0,
    unloading: 0,
    awaitingPutaway: 0,
    putawayInProgress: 0,
    inboundPending: 0,
    unlockableOrders: 0,
  };

  if (!plan || !plan.has_plan) {
    return {
      hasPlan: false,
      attention: null,
      queue: [],
      remainingAfterQueue: 0,
      nextAfter: null,
      workPlan: [],
      alerts: [],
      warehouseState: emptyState,
      emptyGuide: {
        title: "Na tym magazynie nie ma teraz pracy przy dostawach",
        detail: "Gdy na rampie pojawi się dostawa albo skończy się przyjęcie, wróć tutaj i zacznij od pierwszej pozycji.",
        ctaLabel: "Przejdź do przyjęcia",
        ctaHref: "/wms/receiving",
      },
    };
  }

  const proj = plan.projection || {};
  const rows = (proj.meta?.active_deliveries || proj.meta?.all_deliveries || []) as Array<
    Record<string, unknown>
  >;
  const active = rows.filter((r) => r.active !== false);
  const sorted = [...active].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  const effect = (proj.business_effect || {}) as Record<string, unknown>;
  const recommendations = proj.recommendations || [];
  const explainable = proj.explainable_decisions || [];
  const execPlan = proj.execution_plan;
  const execState = proj.execution_state;

  const rowById = new Map<number, Record<string, unknown>>();
  for (const r of sorted) {
    const id = Number(r.delivery_id);
    if (Number.isFinite(id)) rowById.set(id, r);
  }

  const focusId =
    plan.next_action?.delivery_id ??
    plan.cta?.delivery_id ??
    (sorted[0] ? Number(sorted[0].delivery_id) : null);
  const focusRow = focusId != null ? rowById.get(Number(focusId)) || null : sorted[0] || null;
  const focusPhase = String(focusRow?.operational_phase || plan.next_action?.extras?.phase || "");
  const focusExpl =
    explainable.find((e) => e.delivery_id != null && Number(e.delivery_id) === Number(focusId)) ||
    recommendations.find((r) => r.delivery_id != null && Number(r.delivery_id) === Number(focusId))
      ?.explanation ||
    explainable[0] ||
    null;

  const focusDeliveryId = focusId != null ? Number(focusId) : null;
  const cta = ctaFor(focusPhase, plan.cta, plan.next_action, focusDeliveryId);
  const enr = focusDeliveryId != null ? enrichmentById[focusDeliveryId] : undefined;
  const why = businessWhyFromRow(focusRow, focusExpl, effect);

  const attention: AttentionView | null =
    sorted.length === 0 && !plan.cta && !plan.next_action
      ? null
      : {
          title: attentionTitle(focusPhase, focusDeliveryId, enr),
          deliveryId: focusDeliveryId,
          whyBullets: why,
          ctaLabel: cta.label,
          ctaHref: cta.href,
          blockedReason: cta.blockedReason,
        };

  const afterFocus = sorted.filter(
    (row) => focusId == null || Number(row.delivery_id) !== Number(focusId),
  );
  const queueRows = afterFocus.slice(0, 3);
  const remainingAfterQueue = Math.max(0, afterFocus.length - queueRows.length);

  const queue: QueueCardView[] = queueRows.map((row) => {
    const id = Number(row.delivery_id);
    const e = enrichmentById[id] || {};
    const band = urgencyBand(Number(row.priority));
    const phase = String(row.operational_phase || "");
    const expl =
      explainable.find((x) => Number(x.delivery_id) === id) ||
      recommendations.find((r) => Number(r.delivery_id) === id)?.explanation ||
      null;
    const rec = recommendations.find((r) => Number(r.delivery_id) === id);
    const pathFromRec =
      rec?.module === "putaway"
        ? rec.pz_id
          ? `/wms/putaway/${rec.pz_id}`
          : "/wms/putaway"
        : rec?.module === "receiving"
          ? rec.pz_id
            ? `/wms/receiving/pz/${rec.pz_id}`
            : "/wms/receiving"
          : null;
    const cta2 = ctaFor(phase, null, null, id, {
      pathHint: pathFromRec,
      moduleHint: rec?.module,
    });

    return {
      deliveryId: id,
      title: deliveryTitle(id, e),
      supplier: e.supplierName || "Dostawca nieokreślony",
      documentLabel: e.documentNumber || `D-${id}`,
      urgencyLabel: urgencyLabel(band),
      urgencyBand: band,
      effectLine: effectLine(row),
      phaseLabel: phasePl(phase),
      why: businessWhyFromRow(row, expl, effect),
      ctaLabel: cta2.label,
      ctaHref: cta2.href,
    };
  });

  const nextQueue = queue[0] || null;
  const nextAfter: NextAfterView = nextQueue
    ? {
        title: nextQueue.title,
        ctaLabel: nextQueue.ctaLabel,
        ctaHref: nextQueue.ctaHref,
      }
    : null;

  const planSteps = execPlan?.steps || [];
  const workPlan: WorkStepView[] = (planSteps.length
    ? planSteps
    : recommendations.map((r, i) => ({
        seq: i + 1,
        action: r.action,
        delivery_id: r.delivery_id,
        status: "PLANNED",
        label: r.label,
      }))
  )
    .slice(0, 8)
    .map((step) => {
      const seq = Number((step as { seq?: number }).seq || 0);
      const did =
        (step as { delivery_id?: number | null }).delivery_id != null
          ? Number((step as { delivery_id?: number }).delivery_id)
          : null;
      const live = execState?.steps?.find((s) => Number(s.seq) === seq);
      const status = live?.status || (step as { status?: string }).status || "PLANNED";
      const action = (step as { action?: string }).action;
      return {
        seq: seq || 0,
        title: stepTitle(action, did, did != null ? enrichmentById[did] : undefined),
        statusLabel: statusLabel(status),
        statusKey: String(status).toUpperCase(),
        goal: stepGoal(did != null ? rowById.get(did) || null : null, action),
      };
    });

  const alerts: AlertView[] = [];
  for (const s of execState?.steps || []) {
    const st = String(s.status || "").toUpperCase();
    const note = s.note && !isJargon(s.note) ? s.note : undefined;
    const did = s.delivery_id != null ? Number(s.delivery_id) : null;
    const action = alertAction(did, enrichmentById, rowById);
    if (st === "FAILED") {
      alerts.push({
        severity: "critical",
        title: "Wymagana interwencja przy dostawie",
        detail:
          did != null
            ? `${deliveryTitle(did, enrichmentById[did])}${note ? ` — ${note}` : ""}`
            : note,
        ...action,
      });
    }
    if (st === "BLOCKED") {
      const blockedTitle = /brak miejsca|capacity|miejsce/i.test(String(s.note || ""))
        ? "Brak miejsca — praca zablokowana"
        : /konflikt|operator/i.test(String(s.note || ""))
          ? "Konflikt operatorów"
          : /rampa|ramp/i.test(String(s.note || ""))
            ? "Przeciążona rampa"
            : "Praca zablokowana";
      alerts.push({
        severity: "warning",
        title: blockedTitle,
        detail: did != null ? deliveryTitle(did, enrichmentById[did]) : note,
        ...action,
      });
    }
  }

  const warehouseState: WarehouseStateView = {
    onRamp: active.filter((r) => String(r.operational_phase).toUpperCase() === "NA_RAMPIE").length,
    unloading: active.filter((r) => String(r.operational_phase).toUpperCase() === "ROZLADUNEK").length,
    awaitingPutaway: active.filter(
      (r) => String(r.operational_phase).toUpperCase() === "OCZEKUJE_ROZLOKOWANIA",
    ).length,
    putawayInProgress: active.filter(
      (r) => String(r.operational_phase).toUpperCase() === "ROZLOKOWANIE",
    ).length,
    inboundPending: active.filter((r) =>
      ["AWIZOWANA", "W_DRODZE"].includes(String(r.operational_phase).toUpperCase()),
    ).length,
    unlockableOrders: Number(effect.unlockable_order_estimate || 0),
  };

  return {
    hasPlan: true,
    attention,
    queue,
    remainingAfterQueue,
    nextAfter,
    workPlan,
    alerts,
    warehouseState,
    emptyGuide:
      sorted.length === 0
        ? {
            title: "Brak aktywnych dostaw wymagających pracy",
            detail: "Sprawdź przyjęcie albo wróć, gdy na rampie pojawi się kolejna dostawa.",
            ctaLabel: "Przejdź do przyjęcia",
            ctaHref: "/wms/receiving",
          }
        : null,
  };
}

export function enrichmentFromDeliveries(list: DeliveryListRow[]): Record<number, DeliveryEnrichment> {
  const out: Record<number, DeliveryEnrichment> = {};
  for (const d of list) {
    out[Number(d.id)] = {
      supplierName: d.supplier_name || null,
      documentNumber: (d.name && String(d.name).trim()) || `D-${d.id}`,
    };
  }
  return out;
}

export const SUPPLY_FLOW_RETURN_KEY = "wms.supplyFlow.returnContext";

export type SupplyFlowReturnContext = {
  leftAt: number;
  title: string;
  deliveryId: number | null;
};

export function markLeavingForWork(ctx: SupplyFlowReturnContext): void {
  try {
    sessionStorage.setItem(SUPPLY_FLOW_RETURN_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
}

export function consumeReturnContext(): SupplyFlowReturnContext | null {
  try {
    const raw = sessionStorage.getItem(SUPPLY_FLOW_RETURN_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(SUPPLY_FLOW_RETURN_KEY);
    return JSON.parse(raw) as SupplyFlowReturnContext;
  } catch {
    return null;
  }
}
