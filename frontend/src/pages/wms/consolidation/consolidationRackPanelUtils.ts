import type { SegmentPanelData } from "./ConsolidationRackSegmentPanel";
import type { RackGridLevel } from "./rackLayoutUtils";

export type ConsolidationRack = {
  id: number;
  name: string;
  warehouse_id?: number;
  levels: RackGridLevel[];
};

export type ApiSegment = RackGridLevel["segments"][number];

export function segmentToPanel(
  rackName: string,
  cell: {
    segmentId?: number;
    shelfLabel: string;
    slotLabel: string;
    slotLabelCustom?: string | null;
    columnName: string | null;
    rowNumber: number;
    orderId: number | null;
    orderNumber: string | null;
    fillPercent?: number;
    lengthMm?: number | null;
    widthMm?: number | null;
    heightMm?: number | null;
    capacityDm3?: number | null;
    orderVolumeDm3?: number | null;
    utilizationPercent?: number | null;
    capacityOverflow?: boolean;
    dimensionEstimated?: boolean;
    estimatedItemsCount?: number;
  },
  seg?: ApiSegment,
  readOnly = false,
): SegmentPanelData {
  return {
    segmentId: cell.segmentId,
    rackName,
    shelfLabel: cell.shelfLabel,
    slotLabel: cell.slotLabel,
    effectiveSlotLabel: seg?.effective_slot_label ?? cell.slotLabel,
    columnName: cell.columnName,
    rowNumber: cell.rowNumber,
    statusLabel: cell.orderId != null ? "Zajęty" : "Wolny",
    orderId: cell.orderId,
    orderNumber: cell.orderNumber,
    fillPercent: cell.fillPercent,
    slotLabelCustom: seg?.slot_label ?? cell.slotLabelCustom ?? null,
    lengthMm: seg?.length_mm ?? cell.lengthMm,
    widthMm: seg?.width_mm ?? cell.widthMm,
    heightMm: seg?.height_mm ?? cell.heightMm,
    capacityDm3: seg?.capacity_dm3 ?? cell.capacityDm3,
    orderVolumeDm3: seg?.order_volume_dm3 ?? cell.orderVolumeDm3,
    utilizationPercent: seg?.utilization_percent ?? cell.utilizationPercent,
    capacityOverflow: seg?.capacity_overflow ?? cell.capacityOverflow,
    dimensionEstimated: seg?.dimension_estimated ?? cell.dimensionEstimated,
    estimatedItemsCount: seg?.estimated_items_count ?? cell.estimatedItemsCount,
    readOnly,
  };
}

export function findSegmentInRack(
  rack: ConsolidationRack,
  segmentId: number,
): { seg: ApiSegment; level: RackGridLevel } | null {
  for (const level of rack.levels ?? []) {
    for (const seg of level.segments ?? []) {
      if (seg.id === segmentId) {
        return { seg, level };
      }
    }
  }
  return null;
}
