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
  size?: "md" | "lg" | "xl";
}) {
  const box =
    size === "xl" ? "h-16 w-full min-h-[4rem]" : size === "lg" ? "h-12 w-12" : "h-11 w-11";
  const icon = size === "xl" ? 40 : size === "lg" ? 26 : 24;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title="Spakuj wszystko"
      aria-label="Spakuj wszystko"
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
        box,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <PackageCheck size={icon} strokeWidth={2.25} className="text-slate-800" aria-hidden />
    </button>
  );
}

/** Badge wózka / koszyka — czytelniejszy chip z ikoną + mono kod. */
export function PackingCartBasketBadges({
  cartLabel,
  basketCode,
}: {
  cartLabel: string;
  basketCode?: string | null;
}) {
  const basket = (basketCode ?? "").trim();
  const chip =
    "inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-slate-800 shadow-sm";
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className={chip}>
        <Icon name="cart" size={20} className="shrink-0 text-slate-700" />
        <span className="truncate font-mono text-sm font-extrabold tracking-tight text-slate-900">
          {cartLabel}
        </span>
      </span>
      {basket ? (
        <span className={chip}>
          <Icon name="basket" size={20} className="shrink-0 text-slate-700" />
          <span className="truncate font-mono text-sm font-extrabold tracking-tight text-slate-900">
            {basket}
          </span>
        </span>
      ) : null}
    </div>
  );
}
