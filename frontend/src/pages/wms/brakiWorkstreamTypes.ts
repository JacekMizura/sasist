/** Shared Braki workstream shape — no UI or workflow action imports. */

export type BrakiWorkstreams = {
  has_pick_work: boolean;
  has_relocation_work: boolean;
  has_packing_ready: boolean;
  has_oms_pending: boolean;
  pick_line_count: number;
  relocation_line_count: number;
  packing_ready_line_count: number;
  oms_line_count: number;
  collected_line_count: number;
};
