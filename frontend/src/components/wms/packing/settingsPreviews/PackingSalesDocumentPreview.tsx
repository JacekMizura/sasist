import type { PackingSalesDocPreview } from "../../../../types/wmsPackingExtendedUi";
import { PackingSettingsPreviewCollapse } from "./PackingSettingsPreviewCollapse";

type Props = {
  mode: PackingSalesDocPreview;
};

const DOC_GREEN = "#2e7d32";

/**
 * Podgląd „Widok dokumentu sprzedaży” w kontekście sidebara pakowania.
 * - uproszczony: numer + typ
 * - pełny: + kupujący, NIP, adres
 */
export function PackingSalesDocumentPreview({ mode }: Props) {
  const detailed = mode === "full";
  const label = detailed ? "Pełny" : "Uproszczony";

  return (
    <PackingSettingsPreviewCollapse>
      <p className="mb-2 text-sm font-bold text-slate-900">{label}</p>
      <div className="overflow-hidden rounded-md border border-slate-100 bg-slate-50 p-2">
        <div className="flex gap-2 rounded-md border border-slate-200 bg-white p-2">
          <aside className="w-[11.5rem] shrink-0 rounded-lg border border-slate-200 bg-white p-2.5" aria-label="Sidebar dokumentu">
            <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500">
              ☰
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded px-1 text-[11px] font-bold text-white"
                style={{ background: DOC_GREEN }}
              >
                Fa
              </span>
              <span className="text-xs font-bold tabular-nums text-slate-900">FV/2026/0842</span>
              <span className="text-[10px] font-semibold text-slate-500">Faktura</span>
            </div>

            {detailed ? (
              <div className="mt-2.5 min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Kupujący</p>
                <p className="mt-0.5 text-xs font-bold leading-snug text-slate-900">Hurtownia Nowak Sp. z o.o.</p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-600">NIP: 525-000-00-00</p>
                <p className="mt-1 text-[11px] font-medium leading-snug text-slate-600">
                  ul. Magazynowa 12
                  <br />
                  00-001 Warszawa
                </p>
              </div>
            ) : null}

            <div className="mt-2.5 border-t border-slate-100 pt-2">
              <div className="h-5 w-20 rounded bg-slate-100" />
              <p className="mt-1.5 text-[10px] text-slate-600">
                Wysyłka: <span className="font-semibold text-slate-800">DPD</span>
              </p>
              <p className="mt-1 text-[10px] text-slate-600">
                Płatność: <span className="font-semibold text-slate-800">Przelew</span>
              </p>
            </div>
          </aside>
          <div className="min-w-0 flex-1 rounded border border-dashed border-slate-200 bg-slate-50/80 p-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Produkty</p>
            <div className="flex flex-col gap-1.5">
              <div className="h-9 rounded border border-slate-200 bg-white" />
              <div className="h-9 rounded border border-slate-200 bg-white" />
            </div>
          </div>
        </div>
      </div>
    </PackingSettingsPreviewCollapse>
  );
}
