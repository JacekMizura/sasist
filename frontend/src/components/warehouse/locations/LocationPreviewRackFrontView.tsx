import { useMemo, useState } from "react";
import type { LocationVisualBin } from "../../../api/wmsLocationVisualApi";
import type { BinState, LayoutState, RackState } from "../../../types/warehouse";
import {
  getLevelConfig,
  isBinDirectionRtl,
  segmentIndexForVisualSlot,
} from "../warehouseUtils";
import { resolveWarehouseLocation } from "../../../utils/resolvedWarehouseLocation";
import {
  binHoverLines,
  LOCATION_SLOT_COLORS,
  resolveSlotVisualKind,
  storageTypeLabelPl,
  type LocationSlotVisualKind,
} from "./locationPreviewVisual";

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
  rackBins?: LocationVisualBin[];
  className?: string;
};

function getBinAt(rack: RackState, level: number, segment: number): BinState | undefined {
  return rack.bins.find((b) => b.level_index === level && b.segment_index === segment);
}

function findApiBin(
  rackBins: LocationVisualBin[] | undefined,
  level: number,
  segment: number,
  code: string,
): LocationVisualBin | undefined {
  if (!rackBins?.length) return undefined;
  return (
    rackBins.find((b) => b.level_index === level && b.segment_index === segment) ||
    rackBins.find((b) => (b.code || "").trim() === code)
  );
}

export function LocationPreviewRackFrontView({
  rack,
  layout = null,
  selectedLocation,
  activeLocationUuid,
  activeLocationCode,
  rackBins = [],
  className = "",
}: Props) {
  const levelConfig = useMemo(() => getLevelConfig(rack), [rack]);
  const binRtl = useMemo(() => isBinDirectionRtl(layout, rack), [layout, rack]);
  const uuid = (activeLocationUuid ?? "").trim();
  const code = (activeLocationCode ?? "").trim();
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const rows = useMemo(() => {
    const out: {
      levelIndex: number;
      levelLabel: string;
      slots: {
        key: string;
        segmentIndex: number;
        label: string;
        kind: LocationSlotVisualKind;
        apiBin?: LocationVisualBin;
        tip: string[];
      }[];
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
        const apiBin = findApiBin(rackBins, lev, seg, label);
        const storageType = apiBin?.storage_type ?? bin?.storage_type ?? null;
        const isEmpty = apiBin ? Boolean(apiBin.is_empty) : !(bin?.used_volume_dm3 || bin?.current_load_dm3);
        const isBlocked = Boolean(apiBin?.is_blocked) || storageType === "damaged";
        const kind = resolveSlotVisualKind({
          isActive,
          isBlocked,
          isEmpty: isEmpty && !isActive,
          storageType,
        });
        const tipBin: LocationVisualBin = apiBin ?? {
          code: label,
          level_index: lev,
          level_number: lev + 1,
          segment_index: seg,
          segment_label: String(seg + 1),
          is_active: isActive,
          storage_type: storageType,
          is_empty: isEmpty,
          is_blocked: isBlocked,
          sku: null,
          quantity: 0,
          carrier_code: null,
        };
        return {
          key: `${lev}-${seg}-${vis}`,
          segmentIndex: seg,
          label,
          kind,
          apiBin,
          tip: binHoverLines(tipBin),
        };
      });
      out.push({
        levelIndex: lev,
        levelLabel: `Poziom ${lev + 1}`,
        slots,
      });
    }
    return out;
  }, [levelConfig, binRtl, rack, layout, selectedLocation, uuid, code, rackBins]);

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <div className="min-h-0 flex-1 overflow-auto pr-1 [scrollbar-width:thin]">
        <div className="flex min-w-0 flex-col gap-3 py-1">
          {rows.map((row) => (
            <div key={row.levelIndex} className="min-w-0">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {row.levelLabel}
              </p>
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${row.slots.length}, minmax(4.5rem, 1fr))` }}
              >
                {row.slots.map((slot) => {
                  const colors = LOCATION_SLOT_COLORS[slot.kind];
                  const showTip = hoverKey === slot.key;
                  return (
                    <div
                      key={slot.key}
                      className="relative"
                      onMouseEnter={() => setHoverKey(slot.key)}
                      onMouseLeave={() => setHoverKey((k) => (k === slot.key ? null : k))}
                      onFocus={() => setHoverKey(slot.key)}
                      onBlur={() => setHoverKey((k) => (k === slot.key ? null : k))}
                    >
                      <button
                        type="button"
                        className="flex min-h-[3.75rem] w-full flex-col items-center justify-center rounded-xl border-2 px-1.5 py-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                        style={{
                          backgroundColor: colors.bg,
                          borderColor: colors.border,
                          color: colors.text,
                        }}
                        aria-current={slot.kind === "active" ? "true" : undefined}
                        aria-label={`${slot.label} — ${storageTypeLabelPl(slot.apiBin?.storage_type, slot.apiBin?.location_kind)}`}
                        title={slot.tip.join(" · ")}
                      >
                        <span className="font-mono text-xs font-bold leading-tight sm:text-sm">{slot.label}</span>
                      </button>
                      {showTip ? (
                        <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 w-max min-w-[11rem] -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-[11px] leading-relaxed text-slate-700 shadow-lg">
                          {slot.tip.map((line) => (
                            <p key={line}>{line}</p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-2">
        {(Object.keys(LOCATION_SLOT_COLORS) as LocationSlotVisualKind[]).map((k) => {
          const c = LOCATION_SLOT_COLORS[k];
          return (
            <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
              <span
                className="inline-block h-3 w-3 rounded-sm border"
                style={{ backgroundColor: c.bg, borderColor: c.border }}
                aria-hidden
              />
              {c.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
