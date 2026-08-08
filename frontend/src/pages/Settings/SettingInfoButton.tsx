import { useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type SettingInfoButtonProps = {
  /** Tytuł modala = nazwa ustawienia. */
  title: string;
  /** Opis pod nagłówkiem „Jak działa ta opcja:”. */
  description: ReactNode;
  className?: string;
};

/**
 * Generyczna ikona ⓘ przy ustawieniu — otwiera modal z opisem działania.
 */
export function SettingInfoButton({ title, description, className }: SettingInfoButtonProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        className={
          className ??
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-semibold leading-none text-slate-600 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
        }
        aria-label={`Informacja: ${title}`}
        title="Jak działa ta opcja"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        ⓘ
      </button>
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/45 p-4"
              role="presentation"
              onClick={() => setOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="max-h-[min(90vh,36rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id={titleId} className="text-lg font-bold text-slate-900">
                  {title}
                </h2>
                <p className="mt-4 text-sm font-semibold text-slate-800">Jak działa ta opcja:</p>
                <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-700">{description}</div>
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    onClick={() => setOpen(false)}
                  >
                    Zamknij
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
