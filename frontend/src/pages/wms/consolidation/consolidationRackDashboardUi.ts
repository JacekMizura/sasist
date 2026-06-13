import type { ConsolidationRackSegmentDashboard } from "../../../api/wmsConsolidationApi";

export const RACK_SEGMENT_STATE_CLASS: Record<string, string> = {
  FREE: "border-emerald-300 bg-emerald-50 text-emerald-950",
  STAGING: "border-sky-300 bg-sky-50 text-sky-950",
  READY_TO_PACK: "border-orange-300 bg-orange-50 text-orange-950",
  EXCEPTION: "border-red-300 bg-red-50 text-red-950",
};

export const RACK_SEGMENT_STATE_LABEL: Record<string, string> = {
  FREE: "Wolne",
  STAGING: "Rozkładanie",
  READY_TO_PACK: "Gotowe do pakowania",
  EXCEPTION: "Wyjątek",
};

export function rackSegmentStateClass(state: string): string {
  return RACK_SEGMENT_STATE_CLASS[state.toUpperCase()] ?? "border-slate-200 bg-slate-50 text-slate-700";
}

export function rackSegmentStateLabel(state: string): string {
  return RACK_SEGMENT_STATE_LABEL[state.toUpperCase()] ?? state;
}

export function rackSegmentHeadline(seg: ConsolidationRackSegmentDashboard): string {
  if (seg.state === "FREE") return "Wolne";
  return seg.order_number ? `Zamówienie ${seg.order_number}` : "Zajęte";
}
