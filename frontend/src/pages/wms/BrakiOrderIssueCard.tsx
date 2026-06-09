import type { NormalizedShortageQueueCard } from "./brakiQueueMerge";
import type { OrderIssueTaskListItemApi } from "../../api/wmsOrderIssueTasksApi";
import {
  priorityBadgeClass,
  priorityLabelForTask,
  priorityLevelFromTask,
} from "./brakiPriority";
import { brakiQueueCardAccent, type BrakiQueueWorkflowId } from "./brakiWorkstreamUi";
import { WMS_TASK_CARD, WMS_TERMINAL_LABEL } from "../../components/wms/execution/wmsLayoutTokens";
import { ChevronRight } from "lucide-react";

type BrakiWorkflowFilterId =
  | "all"
  | "awaiting"
  | "relocation"
  | "relocation_partial"
  | "pick"
  | "ready_pack"
  | "pick_and_relocation";

const WORKFLOW_IDS: BrakiWorkflowFilterId[] = [
  "awaiting",
  "relocation",
  "relocation_partial",
  "pick",
  "ready_pack",
  "pick_and_relocation",
];

function displayOrderNumber(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "—";
  return s.startsWith("#") ? s.replace("#", "") : s;
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(Number(n) || 0);
}

function cardStatusLabel(card: NormalizedShortageQueueCard): string {
  return card.workflow_stage || (card.raw.braki_workflow_status_label ?? "").trim() || "Braki w realizacji";
}

function readinessLabel(card: NormalizedShortageQueueCard, t: OrderIssueTaskListItemApi): string {
  if (t.recovery_packing_allowed) return "Gotowe do pakowania";
  const line =
    (t.issue_queue_summary_line ?? "").trim() ||
    card.workflow_stage ||
    (t.issue_queue_status_label ?? "").trim();
  return line || "W trakcie obsługi";
}

type Props = {
  card: NormalizedShortageQueueCard;
  onOpen: (task: OrderIssueTaskListItemApi) => void;
};

export function BrakiOrderIssueCard({ card, onOpen }: Props) {
  const t = card.raw;
  const wf = card.queue_stage as BrakiWorkflowFilterId;
  const badgeCount =
    card.recovery_count + card.relocation_count + card.ready_to_pack_count + card.missing_count;
  const missingNumber = Math.max(1, badgeCount);
  const num = displayOrderNumber(t.order_number);
  const wfId = (WORKFLOW_IDS.includes(wf) ? wf : "awaiting") as BrakiQueueWorkflowId;
  const { accent, shortageBadge, statusBadge, icon } = brakiQueueCardAccent(wfId);

  const statusLabel = cardStatusLabel(card);
  const prLevel = priorityLevelFromTask(t);
  const prLabel = priorityLabelForTask(t);
  const prBadge = priorityBadgeClass(prLevel);
  const readiness = readinessLabel(card, t);
  const docHint = (t.recommended_action ?? "").trim() || (t.braki_workflow_status_label ?? "").trim();

  return (
    <button type="button" onClick={() => onOpen(t)} className={WMS_TASK_CARD}>
      <div className={`absolute bottom-0 left-0 top-0 w-1 ${accent}`} aria-hidden />

      <div className="flex flex-1 flex-col pl-2">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={WMS_TERMINAL_LABEL}>Zamówienie nr</p>
            <p className="mt-1 font-mono text-2xl font-black tracking-tight text-slate-900">{num}</p>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <div className={`rounded-xl px-3 py-2 text-center ${shortageBadge}`}>
              <div className="text-[10px] font-bold uppercase tracking-wide opacity-80">Braki</div>
              <div className="text-xl font-black leading-none tabular-nums">
                {fmtQty(missingNumber)}
                <span className="ml-0.5 text-xs font-semibold">szt</span>
              </div>
            </div>
            <ChevronRight className="mt-2 h-5 w-5 text-slate-300 transition group-hover:text-slate-500" aria-hidden />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3">
          {card.partial_data ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              Niepełne dane operacyjne
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${prBadge}`}>
              {prLabel}
            </span>
            {(t.shortage_priority_score ?? 0) > 0 ? (
              <span className="text-[10px] font-semibold text-slate-400">score {t.shortage_priority_score}</span>
            ) : null}
          </div>

          <div className="grid gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs font-semibold text-slate-500">Status</span>
              <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${statusBadge}`}>
                <i className={`fa-solid ${icon} text-[9px]`} aria-hidden />
                {statusLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs font-semibold text-slate-500">Gotowość</span>
              <span className="font-medium text-slate-800">{readiness}</span>
            </div>
            {docHint ? (
              <div className="flex items-start gap-2">
                <span className="w-24 shrink-0 text-xs font-semibold text-slate-500">Dokument</span>
                <span className="text-xs font-medium leading-snug text-slate-700">{docHint}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <span className="text-xs font-bold uppercase tracking-wide text-blue-600 group-hover:text-blue-700">
            Otwórz zlecenie →
          </span>
        </div>
      </div>
    </button>
  );
}
