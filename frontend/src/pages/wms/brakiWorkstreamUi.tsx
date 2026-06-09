/** Shared Braki workstream / status visuals — light WMS industrial style. */

export type BrakiWorkstreamTone = "amber" | "indigo" | "emerald" | "blue" | "red" | "slate";

const WORKSTREAM_TONES: Record<BrakiWorkstreamTone, string> = {
  amber: "bg-amber-50 text-amber-900 border-amber-200",
  indigo: "bg-slate-50 text-slate-800 border-slate-200",
  emerald: "bg-emerald-50 text-emerald-900 border-emerald-200",
  blue: "bg-blue-50 text-blue-900 border-blue-200",
  red: "bg-orange-50 text-orange-900 border-orange-200",
  slate: "bg-slate-50 text-slate-700 border-slate-200",
};

export function BrakiWorkstreamPill({
  label,
  count,
  tone,
}: {
  label: string;
  count?: number;
  tone: BrakiWorkstreamTone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${WORKSTREAM_TONES[tone]}`}
    >
      {label}
      {count != null && count > 0 ? <span className="font-bold">{count}</span> : null}
    </span>
  );
}

export type BrakiQueueWorkflowId =
  | "awaiting"
  | "relocation"
  | "relocation_partial"
  | "pick"
  | "ready_pack"
  | "pick_and_relocation";

export function brakiQueueCardAccent(wf: BrakiQueueWorkflowId): {
  accent: string;
  shortageBadge: string;
  statusBadge: string;
  icon: string;
} {
  if (wf === "awaiting") {
    return {
      accent: "bg-orange-400",
      shortageBadge: "bg-orange-50 text-orange-800",
      statusBadge: "bg-orange-50 text-orange-800",
      icon: "fa-triangle-exclamation",
    };
  }
  if (wf === "relocation_partial" || wf === "relocation" || wf === "pick_and_relocation") {
    return {
      accent: "bg-amber-400",
      shortageBadge: "bg-amber-50 text-amber-800",
      statusBadge: "bg-amber-50 text-amber-800",
      icon: "fa-clock",
    };
  }
  if (wf === "ready_pack") {
    return {
      accent: "bg-blue-400",
      shortageBadge: "bg-blue-50 text-blue-800",
      statusBadge: "bg-blue-50 text-blue-800",
      icon: "fa-box",
    };
  }
  return {
    accent: "bg-emerald-400",
    shortageBadge: "bg-emerald-50 text-emerald-800",
    statusBadge: "bg-emerald-50 text-emerald-800",
    icon: "fa-check",
  };
}
