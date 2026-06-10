import { useMemo } from "react";
import type { BinState, LayoutState, RackState } from "../../../types/warehouse";
import {
  getLevelConfig,
  isBinDirectionRtl,
  segmentIndexForVisualSlot,
} from "../warehouseUtils";
import { resolveWarehouseLocation } from "../../../utils/resolvedWarehouseLocation";

export type RackSlotSelection = {
  level_index: number;
  segment_index: number;
} | null;

type Props = {
  rack: RackState;
  layout?: LayoutState | null;
  selectedLocation?: RackSlotSelection;
  activeLocationUuid?: string | null;
  activeLocationCode?: string | null;
  className?: string;
};

function getBinAt(rack: RackState, level: number, segment: number): BinState | undefined {
  return rack.bins.find((b) => b.level_index === level && b.segment_index === segment);
}

export function LocationPreviewRackFrontView({
  rack,
  layout = null,
  selectedLocation,
  activeLocationUuid,
  activeLocationCode,
  className = "",
}: Props) {
  const levelConfig = useMemo(() => getLevelConfig(rack), [rack]);
  const binRtl = useMemo(() => isBinDirectionRtl(layout, rack), [layout, rack]);
  const uuid = (activeLocationUuid ?? "").trim();
  const code = (activeLocationCode ?? "").trim();

  const rows = useMemo(() => {
    const out: {
      levelIndex: number;
      levelLabel: string;
      slots: { segmentIndex: number; label: string; isActive: boolean }[];
    }[] = [];
    for (let lev = levelConfig.length - 1; lev >= 0; lev -= 1) {
      const cfg = levelConfig[lev];
      const locs = Math.max(1, cfg?.locations ?? 1);
      const slots = Array.from({ length: locs }, (_, vis) => {
        const seg = segmentIndexForVisualSlot(vis, locs, binRtl);
        const bin = getBinAt(rack, lev, seg);
        const label = bin
          ? resolveWarehouseLocation(rack, bin, layout ?? null).label ||
            (bin.label ?? "").trim() ||
            `L${lev + 1}-${seg + 1}`
          : `—`;
        const binUuid = (bin?.locationUUID ?? "").trim();
        const binLabel = (bin?.label ?? "").trim();
        const isActive =
          (selectedLocation?.level_index === lev && selectedLocation?.segment_index === seg) ||
          (uuid.length > 0 && binUuid === uuid) ||
          (code.length > 0 && binLabel === code);
        return { segmentIndex: seg, label, isActive };
      });
      out.push({
        levelIndex: lev,
        levelLabel: `Poziom ${lev + 1}`,
        slots,
      });
    }
    return out;
  }, [levelConfig, binRtl, rack, layout, selectedLocation, uuid, code]);

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-2.5">
        {rows.map((row) => (
          <div
            key={row.levelIndex}
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${row.slots.length}, minmax(0, 1fr))` }}
          >
            {row.slots.map((slot, vis) => (
              <div
                key={`${row.levelIndex}-${slot.segmentIndex}-${vis}`}
                className={[
                  "flex min-h-[3.75rem] flex-col items-center justify-center rounded-lg border-2 px-2 py-3 text-center sm:min-h-[4.5rem] md:min-h-[5rem]",
                  slot.isActive
                    ? "border-blue-600 bg-blue-600 text-white shadow-lg ring-4 ring-blue-100"
                    : "border-slate-200 bg-white text-slate-800",
                ].join(" ")}
                aria-current={slot.isActive ? "true" : undefined}
                aria-label={slot.isActive ? `Aktywna lokalizacja ${slot.label}` : slot.label}
              >
                <span
                  className={[
                    "font-mono text-base font-bold leading-tight sm:text-lg md:text-xl",
                    slot.isActive ? "text-white" : "text-slate-900",
                  ].join(" ")}
                >
                  {slot.label}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-4 shrink-0 text-center text-xs text-slate-500">
        Góra = wyższy poziom · niebieski = Twoja lokalizacja
      </p>
    </div>
  );
}
