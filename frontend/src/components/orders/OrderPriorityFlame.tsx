import { useEffect, useRef, useState } from "react";
import { Flame } from "lucide-react";
import { patchOrderPriority } from "../../api/ordersApi";
import {
  ORDER_PRIORITY_KEYS,
  ORDER_PRIORITY_LABELS_PL,
  normalizePriorityToken,
  priorityFlameTextClass,
  prioritySwatchSurfaceClass,
  type OrderPriorityToken,
} from "./orderPriority";

const TRIGGER_BTN =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200/95 bg-white text-slate-600 shadow-none transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/25 disabled:pointer-events-none disabled:opacity-40";

const TRIGGER_BTN_COMPACT =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200/95 bg-white text-slate-600 shadow-none transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/25 disabled:pointer-events-none disabled:opacity-40";

type PickerProps = {
  orderId: number;
  priorityColor: string | null | undefined;
  onUpdated: (next: string | null) => void;
  disabled?: boolean;
  /** Nagłówek szczegółów — okrągły trigger jak przyciski nawigacji. */
  compactTrigger?: boolean;
};

/** Klik: paleta 6 kolorów; ten sam kolor co aktywny → PATCH null (usuń). */
export function OrderPriorityFlamePicker({
  orderId,
  priorityColor,
  onUpdated,
  disabled,
  compactTrigger,
}: PickerProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = normalizePriorityToken(priorityColor);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const apply = async (token: OrderPriorityToken) => {
    if (saving || disabled) return;
    const next: string | null = current === token ? null : token;
    setSaving(true);
    try {
      await patchOrderPriority(orderId, { priority_color: next });
      onUpdated(next);
      setOpen(false);
    } catch {
      window.alert("Nie udało się zapisać priorytetu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled || saving}
        title="Priorytet zamówienia"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Priorytet zamówienia"
        className={compactTrigger ? TRIGGER_BTN_COMPACT : TRIGGER_BTN}
        onClick={() => setOpen((v) => !v)}
      >
        <Flame
          className={`h-4 w-4 shrink-0 fill-current ${priorityFlameTextClass(current)}`}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Wybór priorytetu"
          className="absolute left-0 top-full z-[90] mt-1 w-[11rem] rounded-lg border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-slate-200/60"
        >
          <p className="mb-2 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Priorytet</p>
          <div className="grid grid-cols-3 gap-1.5">
            {ORDER_PRIORITY_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                title={ORDER_PRIORITY_LABELS_PL[k]}
                disabled={saving}
                className={`flex h-9 w-9 items-center justify-center rounded-md border ${prioritySwatchSurfaceClass(k)} ${
                  current === k ? "ring-2 ring-slate-400 ring-offset-1" : ""
                }`}
                onClick={() => void apply(k)}
              >
                <Flame
                  className={`h-5 w-5 fill-current ${priorityFlameTextClass(k)}`}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
            ))}
          </div>
          <p className="mt-2 px-0.5 text-[10px] leading-snug text-slate-500">
            Ponowny wybór tego samego koloru usuwa priorytet.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Ikona tylko do odczytu (lista zamówień). Brak koloru → nic nie renderuj. */
export function OrderPriorityFlameIcon({ priorityColor }: { priorityColor?: string | null }) {
  const t = normalizePriorityToken(priorityColor);
  if (!t) return null;
  const pulse = t === "red" || t === "orange";
  return (
    <span
      className={`inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border border-current/20 bg-white/80 px-1.5 ${
        pulse ? "animate-pulse" : ""
      }`}
      title={`Priorytet: ${ORDER_PRIORITY_LABELS_PL[t]}`}
      aria-hidden
    >
      <Flame className={`h-4 w-4 fill-current ${priorityFlameTextClass(t)}`} strokeWidth={2} />
    </span>
  );
}
