import { PackageCheck } from "lucide-react";
import { Icon } from "../../ui/Icon";

/** Ikona „Spakuj wszystko” — pudełko z checkiem (outline button). */
export function PackingPackAllIconButton({
  disabled,
  onClick,
  className,
  size = "md",
}: {
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  size?: "md" | "lg";
}) {
  const box = size === "lg" ? "h-12 w-12" : "h-11 w-11";
  const icon = size === "lg" ? 26 : 24;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title="Spakuj wszystko"
      aria-label="Spakuj wszystko"
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
        box,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <PackageCheck size={icon} strokeWidth={2} className="text-slate-800" aria-hidden />
    </button>
  );
}

/** Badge wózka / koszyka — ikona + mono kod (jak w zbieraniu). */
export function PackingCartBasketBadges({
  cartLabel,
  basketCode,
}: {
  cartLabel: string;
  basketCode?: string | null;
}) {
  const basket = (basketCode ?? "").trim();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
        <Icon name="cart" size={15} className="shrink-0 text-slate-600" />
        <span className="truncate font-mono text-[11px] font-bold text-slate-900">{cartLabel}</span>
      </span>
      {basket ? (
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
          <Icon name="basket" size={15} className="shrink-0 text-slate-600" />
          <span className="truncate font-mono text-[11px] font-bold text-slate-900">{basket}</span>
        </span>
      ) : null}
    </div>
  );
}
