import type {
  WmsOperationalTaskApi,
  WmsOperationalTaskDetailApi,
} from "../../../api/wmsOperationalTasksApi";
import {
  mapRelocationModeToTargetType,
  type RelocationTargetTypeUi,
} from "../../../pages/wms/wmsTerminology";
import { formatOperationalDuration } from "../../../utils/formatOperationalDuration";
import { getEventDisplayLabel } from "../../../utils/eventDisplayLabels";

export type WorkflowStepState = "done" | "current" | "upcoming" | "skipped";

export type WorkflowStep = {
  id: string;
  label: string;
  hint?: string;
  state: WorkflowStepState;
  at?: string | null;
};

export type OperationalNextAction = {
  label: string;
  scanHint?: string;
};

const QUEUE_ROUTE_LABEL: Record<string, string> = {
  DO_DECYZJI: "Strefa decyzji",
  DO_DOGRYWKI: "Trasa dogrywki",
  OCZEKUJE_NA_DOSTAWE: "Oczekiwanie na dostawę",
  DO_ROZLOKOWANIA: "Rozlokowanie produktów",
};

export function queueRouteLabel(queue: string): string {
  return QUEUE_ROUTE_LABEL[queue] ?? "Kolejka operacyjna";
}

export function taskTypeLabel(taskType: string): string {
  switch (taskType) {
    case "WAITING_SUPPLY":
      return "Oczekuje na dostawę";
    case "SHORTAGE_RECOLLECT":
      return "Dogrywka zbierki";
    case "RELOCATION":
      return "Rozlokowanie produktów";
    case "SHORTAGE_DECISION":
      return "Decyzja braku";
    default:
      return "Zadanie operacyjne";
  }
}

export function formatRelativeAge(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "przed chwilą";
  return `${formatOperationalDuration(mins)} temu`;
}

export function progressPct(task: WmsOperationalTaskApi): number {
  const req = task.quantity_required || 0;
  if (req <= 0) return task.status === "done" ? 100 : 0;
  return Math.min(100, ((task.quantity_done || 0) / req) * 100);
}

function eventLabel(action: string): string {
  const map: Record<string, string> = {
    waiting_promoted: "Przyjęcie odblokowało workflow",
    waiting_partial_promoted: "Częściowe przyjęcie",
    assign: "Przypisano do nośnika",
    bulk_assign: "Zbiorcze rozłożenie",
    session_start: "Operator rozpoczął sesję",
    session_takeover: "Przejęcie zadania",
    session_release: "Zwolnienie sesji",
    session_resume: "Wznowienie pracy",
  };
  return map[action] ?? getEventDisplayLabel(action);
}

function isCrossdockInbound(detail: WmsOperationalTaskDetailApi): boolean {
  const events = detail.operational_events ?? detail.relocation_history ?? [];
  return events.some(
    (e) =>
      e.action === "waiting_promoted" ||
      e.action === "waiting_partial_promoted" ||
      (e.carrier_label && (e.action === "assign" || e.action.includes("promot"))),
  );
}

export function detectCrossdock(detail: WmsOperationalTaskDetailApi | null): boolean {
  if (!detail) return false;
  if (detail.task_type === "RELOCATION" && detail.picked_from_location) {
    const src = detail.picked_from_location.toLowerCase();
    if (src.includes("tote") || src.includes("wózek") || src.includes("kosz")) return true;
  }
  return isCrossdockInbound(detail);
}

export function buildWorkflowTimeline(
  detail: WmsOperationalTaskDetailApi,
): WorkflowStep[] {
  const events = detail.operational_events ?? detail.relocation_history ?? [];
  const hasPromote = events.some(
    (e) => e.action === "waiting_promoted" || e.action === "waiting_partial_promoted",
  );
  const hasReceiving = events.some((e) => e.action.includes("promot") || e.action.includes("recv"));
  const hasAssign = events.some((e) => e.action === "assign" || e.action === "bulk_assign");
  const done = detail.status === "done";
  const inProgress = detail.status === "in_progress";

  const mark = (id: string, label: string, hint: string, state: WorkflowStepState): WorkflowStep => ({
    id,
    label,
    hint,
    state,
  });

  if (detail.task_type === "WAITING_SUPPLY") {
    return [
      mark("shortage", "Brak zgłoszony", "OMS / zbieranie", "done"),
      mark("waiting", "Oczekiwanie na dostawę", `${detail.waiting_order_count ?? 0} zamówień`, "current"),
      mark(
        "inbound",
        "Przyjęcie PZ / receiving",
        hasReceiving || hasPromote ? "Towar dotarł" : "Czeka na inbound",
        hasReceiving || hasPromote ? "done" : "upcoming",
      ),
      mark(
        "next",
        "Następny krok",
        hasPromote ? "Dogrywka lub rozlokowanie produktów" : "Auto po przyjęciu",
        hasPromote ? "current" : "upcoming",
      ),
      mark("done", "Gotowe", "Zamknięte operacyjnie", done ? "done" : "upcoming"),
    ];
  }

  if (detail.task_type === "SHORTAGE_RECOLLECT") {
    return [
      mark("shortage", "Brak / decyzja", "Workflow braków", "done"),
      mark("recollect", "Dogrywka zbierki", detail.summary_line, inProgress || done ? "current" : "upcoming"),
      mark("done", "Domknięcie linii", "Pick complete", done ? "done" : "upcoming"),
    ];
  }

  if (detail.task_type === "RELOCATION") {
    const targetType = relocationTargetTypeFromDetail(detail);
    const src = detail.picked_from_location ?? "Towar po zbieraniu";
    const assignHint =
      targetType === "LOCATION"
        ? hasAssign
          ? "Część przypisana"
          : "Skan lokacji → przypisz"
        : hasAssign
          ? "Część przypisana"
          : "Skan nośnika (PAL, BOX…) → przypisz";
    return [
      mark("batch", "Batch po zbieraniu", src, "done"),
      hasPromote || detectCrossdock(detail)
        ? mark("inbound", "Przyjęcie crossdock", "Towar z nośnika inbound", "done")
        : mark("inbound", "Towar gotowy", src, "done"),
      mark(
        "relocate",
        "Rozlokowanie produktów",
        `${detail.relocation_allocation_count ?? 0} alokacji`,
        done ? "done" : inProgress ? "current" : "upcoming",
      ),
      mark(
        "assign",
        "Rozłożone",
        assignHint,
        hasAssign ? (done ? "done" : "current") : "upcoming",
      ),
      mark("done", "Gotowe", "Wszystkie alokacje", done ? "done" : "upcoming"),
    ];
  }

  return [
    mark("open", taskTypeLabel(detail.task_type), detail.summary_line, "current"),
    mark("done", "Zamknięte", "", done ? "done" : "upcoming"),
  ];
}

export function relocationTargetTypeFromDetail(
  detail: WmsOperationalTaskDetailApi,
): RelocationTargetTypeUi {
  const mode = detail.relocation_mode;
  return mapRelocationModeToTargetType(mode ?? "CARRIER");
}

export function nextOperationalAction(
  detail: WmsOperationalTaskDetailApi,
): OperationalNextAction {
  if (detail.task_type === "RELOCATION") {
    if (detail.status === "done") return { label: "Zadanie zakończone" };
    const sess = detail.relocation_session;
    if (sess && !sess.can_edit && sess.operator_name) {
      return { label: `Zajęte: ${sess.operator_name}`, scanHint: "Przejmij lub podgląd" };
    }
    const targetType = relocationTargetTypeFromDetail(detail);
    if (targetType === "LOCATION") {
      return {
        label: "Skanuj lokalizację docelową",
        scanHint: "Potem kliknij alokację lub zbiorczo",
      };
    }
    return {
      label: "Skanuj nośnik docelowy",
      scanHint: "Paleta, skrzynia lub kontener (PAL, BOX…) — potem alokacja",
    };
  }
  if (detail.task_type === "WAITING_SUPPLY") {
    return {
      label: "Czeka na przyjęcie magazynowe",
      scanHint: "Po PZ/receiving task odblokuje się automatycznie",
    };
  }
  if (detail.task_type === "SHORTAGE_RECOLLECT" && detail.order_id) {
    return {
      label: "Zbierz brakującą ilość",
      scanHint: `Zamówienie ${detail.order_number ?? detail.order_id}`,
    };
  }
  return { label: "Kontynuuj operację" };
}

export function lastEventSummary(detail: WmsOperationalTaskDetailApi): string | null {
  const events = detail.operational_events ?? detail.relocation_history ?? [];
  if (events.length === 0) return null;
  const last = events[events.length - 1];
  const who = last.operator_name?.trim();
  const when = formatRelativeAge(last.at);
  return `${eventLabel(last.action)}${who ? ` · ${who}` : ""} · ${when}`;
}
