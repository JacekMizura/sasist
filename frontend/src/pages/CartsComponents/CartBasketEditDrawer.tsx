import { X } from "lucide-react";

import {
  productLikeFieldLabelClass,
  productLikeInputClass,
} from "../../components/catalog/productLikeTokens";
import type { BasketModel } from "./CartSectionGrid";
import { basketVolume } from "./CartSectionGrid";

type Props = {
  open: boolean;
  basket: BasketModel | null;
  levelLabel: string;
  onClose: () => void;
  onChange: (patch: Partial<BasketModel>) => void;
  onRemove: () => void;
  sectionNameLabel: string;
  sectionNamePlaceholder: string;
  widthLabel: string;
  lengthLabel: string;
  heightLabel: string;
  removeSectionLabel: string;
};

export function CartBasketEditDrawer({
  open,
  basket,
  levelLabel,
  onClose,
  onChange,
  onRemove,
  sectionNameLabel,
  sectionNamePlaceholder,
  widthLabel,
  lengthLabel,
  heightLabel,
  removeSectionLabel,
}: Props) {
  if (!open || !basket) return null;

  const vol = basketVolume(basket);
  const invalid = !basket.name.trim() || basket.length <= 0 || basket.width <= 0 || basket.height <= 0;

  return (
    <div
      className="fixed inset-0 z-[280] flex justify-end bg-slate-900/30 backdrop-blur-[1px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Edycja koszyka"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{levelLabel}</p>
            <h2 className="mt-0.5 text-lg font-semibold text-slate-900">{basket.name.trim() || "Nowy koszyk"}</h2>
            {invalid ? (
              <p className="mt-1 text-xs text-red-600">Uzupełnij nazwę i wymiary większe od zera.</p>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Zamknij"
            onClick={onClose}
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <label className={productLikeFieldLabelClass}>{sectionNameLabel}</label>
            <input
              className={`${productLikeInputClass} mt-1 uppercase ${!basket.name.trim() ? "border-red-300" : ""}`}
              value={basket.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder={sectionNamePlaceholder}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["width", widthLabel],
                ["length", lengthLabel],
                ["height", heightLabel],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <label className={productLikeFieldLabelClass}>{label} (cm)</label>
                <input
                  type="number"
                  min={1}
                  className={`${productLikeInputClass} mt-1 tabular-nums ${Number(basket[field]) <= 0 ? "border-red-300" : ""}`}
                  value={basket[field] || ""}
                  onChange={(e) => onChange({ [field]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pojemność</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{vol.toFixed(1)} dm³</p>
            <p className="mt-0.5 text-xs text-slate-500">Wyliczona z wymiarów (dł. × szer. × wys.)</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            {removeSectionLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Gotowe
          </button>
        </div>
      </div>
    </div>
  );
}
