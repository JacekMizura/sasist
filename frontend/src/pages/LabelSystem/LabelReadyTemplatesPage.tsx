import type { LucideIcon } from "lucide-react";
import {
  GripHorizontal,
  LayoutGrid,
  MapPin,
  Package,
  ScanBarcode,
  Signpost,
  Warehouse,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  generatePreset,
  PRESET_CARD_META,
  PRESET_LABELS,
  PRESET_TYPES,
  PRESET_USAGE_HINTS,
  type PresetType,
} from "../../services/labelPresets";
import { labelModuleBasePath } from "./labelModuleBasePath";

const PRESET_ICONS: Record<PresetType, LucideIcon> = {
  LOCATION_BASIC: MapPin,
  LOCATION_BARCODE_LARGE: ScanBarcode,
  RACK_SEGMENT_STRIP: LayoutGrid,
  PALLET_LABEL: Package,
  AISLE_LABEL: Signpost,
  FLOOR_LOCATION: Warehouse,
  RACK_BEAM_MULTISECTION: GripHorizontal,
};

/**
 * Lista gotowych szablonów — trasa `/admin/print-templates/ready`.
 */
export function LabelReadyTemplatesPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const labelBase = labelModuleBasePath(pathname);

  const openInDesigner = (type: PresetType) => {
    const preset = generatePreset(type);
    navigate(`${labelBase}/designer/new`, { state: { presetTemplate: preset } });
  };

  return (
    <div className="min-w-0 space-y-6 px-1 pb-8 pt-2">
      <div className="border-b border-slate-200/90 pb-4">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">Gotowe szablony</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
          Wybierz układ startowy — otworzysz go w edytorze, dostosujesz pola i zapiszesz jako własny szablon wydruku.
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {PRESET_TYPES.map((type) => {
          const Icon = PRESET_ICONS[type];
          const meta = PRESET_CARD_META[type];
          return (
            <li key={type}>
              <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white via-white to-slate-50/90 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_8px_24px_-12px_rgba(15,23,42,0.18)] ring-1 ring-slate-900/[0.04] transition hover:border-orange-300/90 hover:shadow-[0_12px_32px_-14px_rgba(15,23,42,0.22)]">
                <div className="flex min-h-0 flex-1 gap-3 p-4">
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-800 to-slate-950 text-orange-100 shadow-inner"
                    aria-hidden
                  >
                    <Icon className="h-8 w-8" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold leading-snug text-slate-900">{PRESET_LABELS[type]}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{PRESET_USAGE_HINTS[type]}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center rounded-md border border-slate-200/90 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                        {meta.formatLabel}
                      </span>
                      <span className="inline-flex items-center rounded-md border border-slate-200/90 bg-white px-2 py-0.5 font-mono text-[10px] font-medium text-slate-700">
                        {meta.widthMm}×{meta.heightMm} mm
                      </span>
                      <span className="inline-flex items-center rounded-md border border-slate-200/90 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700">
                        {meta.barcodeLabel}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="border-t border-slate-200/80 bg-slate-50/80 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => openInDesigner(type)}
                    className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
                  >
                    Edytuj szablon
                  </button>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
