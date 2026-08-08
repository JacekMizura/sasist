import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type SettingInfoButtonProps = {
  /** Tytuł modala = nazwa ustawienia. */
  title: string;
  /** Treść pod „Jak działa ta opcja:”. */
  description: ReactNode;
  /** Opcjonalna sekcja „Wskazówka:”. */
  tip?: ReactNode;
  className?: string;
};

const INFO_BLUE = "#3b82f6";

/**
 * Niebieska ikona (i) w stylu Sellasist — środkowa kolumna wiersza LABEL | [i] | CONTROL.
 * Modal bez sekcji „czy artykuł był pomocny”.
 */
export function SettingInfoButton({ title, description, tip, className }: SettingInfoButtonProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={
          className ??
          "inline-flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border border-[#3b82f6] bg-white text-[11px] font-semibold leading-none text-[#3b82f6] hover:bg-blue-50"
        }
        style={{ borderColor: INFO_BLUE, color: INFO_BLUE }}
        aria-label={`Informacja: ${title}`}
        title="Jak działa ta opcja"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        i
      </button>
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[6000] flex items-center justify-center bg-slate-900/25 p-4"
              role="presentation"
              onClick={() => setOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="max-h-[min(90vh,36rem)] w-full max-w-[34rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.12)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                  <h2 id={titleId} className="pr-2 text-[17px] font-semibold leading-snug text-slate-900">
                    {title}
                  </h2>
                  <button
                    type="button"
                    className="-mr-1 -mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    aria-label="Zamknij"
                    onClick={() => setOpen(false)}
                  >
                    <X className="h-5 w-5" strokeWidth={1.75} />
                  </button>
                </div>

                <div className="overflow-y-auto px-5 py-4 text-[14px] leading-relaxed text-slate-800">
                  <p className="font-bold text-slate-900">Jak działa ta opcja:</p>
                  <div className="mt-2 space-y-2 [&_strong]:font-semibold [&_b]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_li]:pl-0.5">
                    {description}
                  </div>
                  {tip ? (
                    <div className="mt-5">
                      <p className="font-bold text-slate-900">Wskazówka:</p>
                      <div className="mt-2 space-y-2 [&_strong]:font-semibold [&_b]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
                        {tip}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** Alias kanoniczny (SettingInfoButton / SettingHelpModal). */
export const SettingHelpModal = SettingInfoButton;
