import { Info } from "lucide-react";
import type { ReactNode } from "react";

import type { StockIntakeMode } from "../../../types/wmsReturn";
import { IntakeComponentRows, type IntakeComponentRow } from "./IntakeComponentRows";
import type { IntakeCopy, StockIntakeTileId } from "./stockIntakeMode";

type Props = {
  copy: IntakeCopy;
  physicalQty: number;
  mode: StockIntakeMode | null;
  fgQty: number;
  disassemblyQty: number;
  components: IntakeComponentRow[];
  manyQtyLabel: string;
  disabled?: boolean;
  forceDisassemble?: boolean;
  lockedReason?: string | null;
  requiredHint?: boolean;
  overLimit?: boolean;
  underLimit?: boolean;
  footer?: ReactNode;
  onSelectMode: (tile: StockIntakeTileId) => void;
  onMixedFgChange: (fg: number) => void;
  onMixedDqChange: (dq: number) => void;
  onAcceptedChange?: (key: string | number, accepted: number) => void;
};

function modeLabel(copy: IntakeCopy, mode: StockIntakeMode | null): string {
  if (mode === "FG") return copy.segments.find((s) => s.id === "FG")?.label ?? "Gotowy produkt";
  if (mode === "DISASSEMBLE") return copy.segments.find((s) => s.id === "DISASSEMBLE")?.label ?? "Rozmontuj";
  if (mode === "MIXED") return copy.segments.find((s) => s.id === "MIXED")?.label ?? "Częściowo";
  return "—";
}

export function ReturnStockIntakeSection({
  copy,
  physicalQty,
  mode,
  fgQty,
  disassemblyQty,
  components,
  manyQtyLabel,
  disabled = false,
  forceDisassemble = false,
  lockedReason = null,
  requiredHint = false,
  overLimit = false,
  underLimit = false,
  footer,
  onSelectMode,
  onMixedFgChange,
  onMixedDqChange,
  onAcceptedChange,
}: Props) {
  const qtyOne = physicalQty <= 1;
  const activeMode = mode ?? (disassemblyQty > 0 ? (fgQty > 0 ? "MIXED" : "DISASSEMBLE") : fgQty > 0 ? "FG" : null);

  if (disabled) {
    const recovered = components.filter((c) => c.accepted > 0);
    const scrapped = components.filter((c) => c.scrap > 0);
    let intakeSummary = "—";
    if (activeMode === "FG") {
      intakeSummary = `${copy.fgResultLabel}: ${fgQty} szt.`;
    } else if (activeMode === "DISASSEMBLE") {
      intakeSummary = `Rozmontowano ${disassemblyQty} szt.`;
    } else if (activeMode === "MIXED") {
      intakeSummary = `${copy.mixedFgLabel} ${fgQty} szt. · Rozmontowano ${disassemblyQty} szt.`;
    }

    return (
      <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
        {lockedReason ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-950">
            {lockedReason}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[13px] font-semibold text-slate-900">{copy.sectionTitle}</h3>
          <span
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
            title={copy.badgeHint}
          >
            {copy.badgeLabel}
          </span>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[12px] leading-relaxed text-slate-800">
          <p>
            <span className="text-slate-500">Sposób przyjęcia:</span>{" "}
            <span className="font-medium">{intakeSummary}</span>
          </p>
          {recovered.length > 0 || disassemblyQty > 0 ? (
            <p className="mt-1.5 text-slate-500">
              Odzyskano:{" "}
              <span className="font-medium text-slate-800">
                {recovered.length > 0
                  ? recovered.map((c) => `${c.name} — ${c.accepted} szt.`).join("; ")
                  : "brak"}
              </span>
            </p>
          ) : null}
          {disassemblyQty > 0 || scrapped.length > 0 ? (
            <p className="mt-1 text-slate-500">
              Odrzut:{" "}
              <span className="font-medium text-slate-800">
                {scrapped.length > 0
                  ? scrapped.map((c) => `${c.name} — ${c.scrap} szt.`).join("; ")
                  : "brak"}
              </span>
            </p>
          ) : null}
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      {lockedReason ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-950">
          {lockedReason}
        </p>
      ) : null}
      {requiredHint ? (
        <p className="text-[11px] font-medium text-slate-600">Wymagane rozmontowanie produktu.</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-semibold text-slate-900">{copy.sectionTitle}</h3>
        <span
          className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-800"
          title={copy.badgeHint}
        >
          {copy.badgeLabel}
          <Info className="h-3 w-3 shrink-0 text-orange-600/80" aria-hidden />
        </span>
      </div>

      <div
        role="group"
        aria-label={copy.sectionTitle}
        className="flex h-8 w-full max-w-xl items-stretch overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-0.5"
      >
        {copy.segments.map((seg) => {
          const active =
            activeMode === seg.id || (seg.id === "FG" && activeMode == null && fgQty > 0 && disassemblyQty < 1);
          const segDisabled = (forceDisassemble && seg.id === "FG") || (seg.id === "MIXED" && qtyOne);
          return (
            <button
              key={seg.id}
              type="button"
              disabled={segDisabled}
              aria-pressed={active}
              title={seg.id === "MIXED" && qtyOne ? "Przy 1 szt. częściowe rozmontowanie jest niedostępne" : undefined}
              onClick={() => onSelectMode(seg.id)}
              className={`flex h-full min-w-0 flex-1 items-center justify-center truncate px-2 text-[12px] font-medium leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? "rounded-[5px] bg-orange-50 text-orange-900 ring-1 ring-inset ring-orange-300"
                  : "rounded-[5px] text-slate-600 hover:bg-white/80 hover:text-slate-900"
              }`}
            >
              {seg.label}
            </button>
          );
        })}
      </div>

      {activeMode === "FG" ? (
        <p className="text-[12px] leading-snug text-slate-700">
          {copy.fgResultLabel}:{" "}
          <span className="font-semibold tabular-nums text-slate-900">{fgQty} szt.</span>
        </p>
      ) : null}

      {activeMode === "DISASSEMBLE" ? (
        qtyOne ? (
          <p className="text-[12px] leading-snug text-slate-700">
            {copy.qtyOneDisassembleLead}
            <span className="ml-1.5 font-semibold tabular-nums text-slate-900">1 szt.</span>
          </p>
        ) : (
          <p className="text-[12px] leading-snug text-slate-700">
            {copy.disassembleResultLabel}:{" "}
            <span className="font-semibold tabular-nums text-slate-900">{disassemblyQty} szt.</span>
          </p>
        )
      ) : null}

      {activeMode === "MIXED" && !qtyOne ? (
        <div className="flex flex-nowrap items-center gap-x-3 overflow-x-auto text-[12px] leading-none text-slate-700">
          <label className="inline-flex shrink-0 items-center gap-1.5">
            <span>{copy.mixedFgLabel}</span>
            <input
              type="number"
              min={0}
              max={physicalQty}
              step={1}
              value={fgQty}
              onChange={(e) => onMixedFgChange(Number(e.target.value))}
              className="h-7 w-12 rounded border border-slate-200 bg-white px-1 text-right tabular-nums focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
            <span>szt.</span>
          </label>
          <label className="inline-flex shrink-0 items-center gap-1.5">
            <span>{copy.mixedDqLabel}</span>
            <input
              type="number"
              min={0}
              max={physicalQty}
              step={1}
              value={disassemblyQty}
              onChange={(e) => onMixedDqChange(Number(e.target.value))}
              className="h-7 w-12 rounded border border-slate-200 bg-white px-1 text-right tabular-nums focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
            <span>szt.</span>
          </label>
          <span className="shrink-0 tabular-nums text-slate-500">
            Razem{" "}
            <span className="font-semibold text-slate-800">
              {fgQty + disassemblyQty} / {physicalQty}
            </span>
          </span>
        </div>
      ) : null}

      {overLimit ? (
        <p className="text-[11px] font-medium text-rose-700">
          Suma nie może przekroczyć ilości zwróconej ({physicalQty} szt.).
        </p>
      ) : null}
      {underLimit ? (
        <p className="text-[11px] font-medium text-amber-800">
          Suma powinna wynosić {physicalQty} szt. (obecnie {fgQty + disassemblyQty}).
        </p>
      ) : null}

      {disassemblyQty > 0 ? (
        <IntakeComponentRows
          title={copy.componentsTitle}
          manyQtyLabel={manyQtyLabel}
          perUnitSuffix={copy.perUnitSuffix}
          rows={components}
          onAcceptedChange={onAcceptedChange}
        />
      ) : null}

      {footer}
      <span className="sr-only">Aktywny tryb: {modeLabel(copy, activeMode)}</span>
    </div>
  );
}
