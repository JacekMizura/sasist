import { ChevronDown, ChevronUp, Pin, PinOff } from "lucide-react";

import type { WmsModuleDefinition } from "../wmsTabConfig";
import { WMS_HOME_BORDER, WMS_HOME_DISPLAY_LABEL } from "./wmsHomeSections";

type Props = {
  modules: WmsModuleDefinition[];
  isPinned: (id: string) => boolean;
  onTogglePin: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  pinnedCount: number;
};

/**
 * Preferencje topbara — tylko dozwolone (permission) + pinnable moduły.
 * Permission ≠ pin ≠ order.
 */
export function WmsTopbarPinSettings({
  modules,
  isPinned,
  onTogglePin,
  onMoveUp,
  onMoveDown,
  pinnedCount,
}: Props) {
  return (
    <details className="rounded-xl border bg-white" style={{ borderColor: WMS_HOME_BORDER }}>
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          Konfiguracja górnego paska
          <span className="text-xs font-normal text-slate-400">
            ({pinnedCount} przypiętych)
          </span>
        </span>
      </summary>
      <div className="border-t px-3 pb-3 pt-2" style={{ borderColor: WMS_HOME_BORDER }}>
        <p className="mb-2 px-1 text-xs text-slate-500">
          Wybierz, które dozwolone tryby mają być widoczne w górnym pasku, i ustaw kolejność.
        </p>
        <ul className="space-y-1">
          {modules.map((mod) => {
            const pinned = isPinned(mod.id);
            const label = WMS_HOME_DISPLAY_LABEL[mod.id] ?? mod.label;
            const Icon = mod.icon;
            return (
              <li
                key={mod.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
              >
                <span className={["flex h-8 w-8 items-center justify-center rounded-lg", mod.accent.iconBg, mod.accent.iconText].join(" ")}>
                  <Icon size={16} strokeWidth={2.25} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{label}</span>
                {pinned ? (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={`Przenieś w górę: ${label}`}
                      onClick={() => onMoveUp(mod.id)}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={`Przenieś w dół: ${label}`}
                      onClick={() => onMoveDown(mod.id)}
                    >
                      <ChevronDown size={16} />
                    </button>
                  </span>
                ) : null}
                <button
                  type="button"
                  role="switch"
                  aria-checked={pinned}
                  aria-label={pinned ? `Odepnij ${label}` : `Przypnij ${label}`}
                  onClick={() => onTogglePin(mod.id)}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
                    pinned
                      ? "border-[#5a4fcf]/35 bg-[#f5f8ff] text-[#5a4fcf]"
                      : "border-slate-200 text-slate-500 hover:border-slate-300",
                  ].join(" ")}
                >
                  {pinned ? <Pin size={14} aria-hidden /> : <PinOff size={14} aria-hidden />}
                  {pinned ? "W pasku" : "Pokaż w pasku"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
