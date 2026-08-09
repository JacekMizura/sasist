import type { PackingLayoutMode } from "../../../../types/wmsPackingExtendedUi";
import { PackingSettingsPreviewCollapse } from "./PackingSettingsPreviewCollapse";

type Props = {
  mode: PackingLayoutMode;
};

function MiniProductTiles({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="h-10 flex-1 rounded border border-slate-200 bg-white min-w-[3.5rem] max-w-[5rem]"
          aria-hidden
        />
      ))}
    </div>
  );
}

function MiniSidebar() {
  return (
    <div className="flex w-[4.5rem] shrink-0 flex-col gap-1.5 rounded border border-slate-200 bg-white p-1.5">
      <div className="h-2 w-6 rounded bg-slate-200" />
      <div className="h-2.5 w-full rounded bg-emerald-200/80" />
      <div className="mt-1 h-2 w-10 rounded bg-slate-100" />
      <div className="h-2 w-8 rounded bg-slate-100" />
      <div className="mt-auto h-5 w-full rounded bg-[#4caf50]/80" />
    </div>
  );
}

/**
 * Podgląd „Wybierz układ”: Z sidebarem vs Pełna szerokość — miniatura faktycznego widoku pakowania.
 */
export function PackingLayoutModePreview({ mode }: Props) {
  const label = mode === "full_width" ? "Pełna szerokość" : "Z sidebarem";

  return (
    <PackingSettingsPreviewCollapse>
      <p className="mb-2 text-sm font-bold text-slate-900">{label}</p>
      <div className="overflow-hidden rounded-md border border-slate-100 bg-slate-50 p-2">
        {mode === "with_sidebar" ? (
          <div className="flex gap-2 rounded-md border border-slate-200 bg-white p-2">
            <MiniSidebar />
            <div className="min-w-0 flex-1 rounded border border-dashed border-slate-200 bg-slate-50/80 p-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Produkty</p>
              <MiniProductTiles count={4} />
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 bg-white p-2">
            <div className="mb-2 flex gap-2 border-b border-slate-100 pb-2">
              <div className="h-2.5 w-16 rounded bg-emerald-200/80" />
              <div className="h-2.5 w-20 rounded bg-slate-100" />
              <div className="h-2.5 flex-1 rounded bg-slate-50" />
            </div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Produkty</p>
            <MiniProductTiles count={6} />
          </div>
        )}
      </div>
    </PackingSettingsPreviewCollapse>
  );
}
