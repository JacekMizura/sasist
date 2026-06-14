import { useRef, useEffect, useState } from "react";
import { Plus } from "lucide-react";

import ConsolidationRackRenderer from "./ConsolidationRackRenderer";
import {
  buildRackLayoutRowsFromDraft,
  formatPreviewDimsCompact,
} from "./consolidationRackPreviewLayout";
import { computeCapacityDm3 } from "./rackLayoutUtils";
import { omsCellContainerStyle, RackLayoutOmsCellContent } from "./rackLayoutCellContent";
import type { RackStructureDraft, SegmentSelection } from "./rackStructureModel";

type Props = {
  draft: RackStructureDraft;
  selection?: SegmentSelection;
  readOnly?: boolean;
  structureLocked?: boolean;
  onSegmentClick?: (levelClientId: string, segmentClientId: string) => void;
  onAddLevel?: () => void;
  className?: string;
};

/**
 * OMS — wizualizacja regału (poziomy × segmenty), klik → panel boczny.
 * Geometria wspólna z WMS (`ConsolidationRackRenderer`).
 */
export default function ConsolidationRackOmsPreview({
  draft,
  selection = null,
  readOnly = false,
  structureLocked = false,
  onSegmentClick,
  onAddLevel,
  className = "",
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(520);
  const canEditStructure = !readOnly && !structureLocked;
  const clickable = Boolean(onSegmentClick);

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

  const rows = buildRackLayoutRowsFromDraft(draft, viewportHeight);
  const rackWidth = draft.totalWidthMm ?? 2000;
  const totalLocations = rows.reduce((s, r) => s + r.cells.length, 0);
  const rackTitle = draft.rackName.trim() || "RK-XX";
  const selectedCellKey =
    selection?.segmentClientId && selection.levelClientId ? selection.segmentClientId : null;

  return (
    <ConsolidationRackRenderer
      className={className}
      scrollRef={scrollRef}
      rows={rows}
      emptyMessage="Dodaj poziom w panelu bocznym."
      header={{
        title: `${rackTitle} — ${rows.length} ${rows.length === 1 ? "poziom" : "poziomów"} · ${totalLocations} segmentów`,
        widthMm: rackWidth,
      }}
      selectedCellKey={selectedCellKey}
      onCellClick={
        clickable
          ? (cell) => onSegmentClick?.(cell.levelClientId, cell.key)
          : undefined
      }
      getCellContainerStyle={(cell) =>
        omsCellContainerStyle(
          selection?.levelClientId === cell.levelClientId && selection?.segmentClientId === cell.key,
        )
      }
      renderCell={(cell, ctx) => {
        const isSelected =
          selection?.levelClientId === cell.levelClientId && selection?.segmentClientId === cell.key;
        const dims = formatPreviewDimsCompact(cell.widthMm, cell.depthMm, cell.heightMm);
        const cap = cell.capacityDm3 ?? computeCapacityDm3(cell.depthMm, cell.widthMm, cell.heightMm);
        return (
          <div
            title={`${cell.label}\n${dims}${cap != null ? `\n${cap.toFixed(0)} dm³` : ""}`}
            className="flex w-full flex-col items-center"
          >
            <RackLayoutOmsCellContent cell={cell} ctx={ctx} isSelected={isSelected} />
          </div>
        );
      }}
      footer={
        canEditStructure && onAddLevel ? (
          <button
            type="button"
            onClick={onAddLevel}
            className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:border-violet-300 hover:text-violet-900"
          >
            <Plus className="h-4 w-4" />
            Dodaj poziom
          </button>
        ) : null
      }
    />
  );
}
