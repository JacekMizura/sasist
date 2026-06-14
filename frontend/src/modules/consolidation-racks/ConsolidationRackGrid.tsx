import { useEffect, useRef, useState } from "react";

import type { ConsolidationRackSegmentDashboard } from "../../api/wmsConsolidationApi";
import { rackSegmentStateClass, rackSegmentStateLabel } from "../../pages/wms/consolidation/consolidationRackDashboardUi";
import ConsolidationRackRenderer from "./ConsolidationRackRenderer";
import {
  buildRackLayoutRowsFromGridLevels,
  inferRackWidthMmFromLevels,
  type RackLayoutCell,
} from "./consolidationRackPreviewLayout";
import { RackLayoutWmsCellContent } from "./rackLayoutCellContent";
import { configSegmentTone, type RackGridLevel } from "./rackLayoutUtils";

export type RackGridSegmentClick = {
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
  state?: string;
  isOverridden?: boolean;
};

type Props = {
  rackName: string;
  levels: RackGridLevel[];
  dashboardBySegmentId?: Map<number, ConsolidationRackSegmentDashboard>;
  onSegmentClick?: (cell: RackGridSegmentClick) => void;
  compact?: boolean;
  overriddenSegmentIds?: Set<number>;
};

function cellToneClass(
  cell: RackLayoutCell,
  dashboardBySegmentId?: Map<number, ConsolidationRackSegmentDashboard>,
  levels?: RackGridLevel[],
): string {
  if (cell.segmentId != null && dashboardBySegmentId?.has(cell.segmentId)) {
    return rackSegmentStateClass(dashboardBySegmentId.get(cell.segmentId)!.state);
  }
  if (cell.segmentId != null && levels) {
    for (const lv of levels) {
      const seg = lv.segments.find((s) => s.id === cell.segmentId);
      if (seg) return configSegmentTone(seg.order_id);
    }
  }
  return configSegmentTone(null);
}

function findGridSegment(levels: RackGridLevel[], cell: RackLayoutCell) {
  for (const lv of levels) {
    const seg = lv.segments.find((s) => (s.id != null ? String(s.id) === cell.key : false));
    if (seg) return { level: lv, segment: seg };
  }
  return null;
}

/**
 * WMS — operacyjny widok regału. Ta sama geometria co OMS + nakładka statusów.
 */
export default function ConsolidationRackGrid({
  rackName,
  levels,
  dashboardBySegmentId,
  onSegmentClick,
  compact = false,
  overriddenSegmentIds,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(520);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 520;
      setViewportHeight(Math.max(280, h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = buildRackLayoutRowsFromGridLevels(levels, viewportHeight);
  const rackWidth = inferRackWidthMmFromLevels(levels);
  const totalLocations = rows.reduce((s, r) => s + r.cells.length, 0);

  return (
    <ConsolidationRackRenderer
      scrollRef={scrollRef}
      rows={rows}
      emptyMessage="Brak półek w regale."
      header={{
        title: `${rackName} — ${rows.length} ${rows.length === 1 ? "poziom" : "poziomów"} · ${totalLocations} segmentów`,
        widthMm: rackWidth,
      }}
      onCellClick={
        onSegmentClick
          ? (cell) => {
              const match = findGridSegment(levels, cell);
              const dash = cell.segmentId != null ? dashboardBySegmentId?.get(cell.segmentId) : undefined;
              const seg = match?.segment;
              const shelfLabel = `${rackName}/${cell.label}`;
              const isOverridden =
                (cell.segmentId != null && overriddenSegmentIds?.has(cell.segmentId)) ?? false;
              onSegmentClick({
                segmentId: cell.segmentId,
                shelfLabel: dash?.shelf_label ?? shelfLabel,
                slotLabel: dash?.slot_label ?? cell.label,
                slotLabelCustom: seg?.slot_label ?? null,
                columnName: match?.level.name ?? cell.levelClientId,
                rowNumber: (seg?.segment_index ?? 0) + 1,
                orderId: seg?.order_id ?? dash?.order_id ?? null,
                orderNumber: seg?.order_number ?? dash?.order_number ?? null,
                fillPercent: seg?.fill_percent ?? dash?.fill_percent,
                lengthMm: seg?.length_mm ?? dash?.length_mm,
                widthMm: seg?.width_mm ?? dash?.width_mm,
                heightMm: seg?.height_mm ?? dash?.height_mm,
                capacityDm3: seg?.capacity_dm3 ?? dash?.capacity_dm3,
                orderVolumeDm3: seg?.order_volume_dm3 ?? dash?.order_volume_dm3,
                utilizationPercent: seg?.utilization_percent ?? dash?.utilization_percent,
                capacityOverflow: seg?.capacity_overflow ?? dash?.capacity_overflow,
                dimensionEstimated: seg?.dimension_estimated ?? dash?.dimension_estimated,
                estimatedItemsCount: seg?.estimated_items_count ?? dash?.estimated_items_count,
                state: dash?.state,
                isOverridden,
              });
            }
          : undefined
      }
      getCellContainerClassName={(cell) =>
        `relative rounded-lg border px-1 py-1.5 transition ${cellToneClass(cell, dashboardBySegmentId, levels)} ${compact ? "text-[10px]" : "text-xs"}`
      }
      renderCell={(cell, ctx) => {
        const dash = cell.segmentId != null ? dashboardBySegmentId?.get(cell.segmentId) : undefined;
        const isOverridden =
          cell.segmentId != null && overriddenSegmentIds?.has(cell.segmentId);
        return (
          <RackLayoutWmsCellContent
            cell={cell}
            ctx={ctx}
            compact={compact}
            showOverrideDot={isOverridden}
            orderNumber={dash?.order_number}
            fillPercent={dash?.fill_percent}
            estimatedItemsCount={dash?.estimated_items_count}
            stateLabel={dash ? rackSegmentStateLabel(dash.state) : undefined}
            capacityDm3={dash?.capacity_dm3 ?? cell.capacityDm3}
          />
        );
      }}
    />
  );
}
