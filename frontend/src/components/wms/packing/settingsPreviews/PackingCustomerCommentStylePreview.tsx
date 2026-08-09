import type { PackingCustomerCommentStyle } from "../../../../types/wmsPackingExtendedUi";
import { PackingCustomerCommentBanner } from "../PackingCustomerCommentBanner";
import { PackingSettingsPreviewCollapse } from "./PackingSettingsPreviewCollapse";

type Props = {
  style: PackingCustomerCommentStyle;
};

const SAMPLE_COMMENT = "Proszę o szybką wysyłkę — prezent urodzinowy.";

/**
 * Podgląd „Wygląd komentarzy klienta”:
 * - wyróżniony → czerwony banner nad produktami
 * - zwykły → komentarz w lewym sidebarze
 */
export function PackingCustomerCommentStylePreview({ style }: Props) {
  const highlighted = style === "highlighted";
  const label = highlighted ? "Wyróżniony" : "Zwykły";

  return (
    <PackingSettingsPreviewCollapse>
      <p className="mb-2 text-sm font-bold text-slate-900">{label}</p>
      <div className="overflow-hidden rounded-md border border-slate-100 bg-slate-50 p-2">
        <div className="flex gap-2 rounded-md border border-slate-200 bg-white p-2">
          <div className="flex w-[7.5rem] shrink-0 flex-col gap-1.5 rounded border border-slate-200 bg-white p-2">
            <div className="h-2.5 w-14 rounded bg-emerald-200/80" />
            <div className="h-2 w-full rounded bg-slate-100" />
            {!highlighted ? (
              <div className="mt-1 rounded border border-slate-100 bg-slate-50 p-1.5">
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Uwagi klienta</p>
                <p className="mt-0.5 text-[10px] font-medium leading-snug text-slate-800">{SAMPLE_COMMENT}</p>
              </div>
            ) : (
              <div className="mt-1 h-8 rounded bg-slate-50" aria-hidden />
            )}
            <div className="mt-auto h-6 w-full rounded bg-[#4caf50]/80" />
          </div>
          <div className="min-w-0 flex-1">
            {highlighted ? (
              <div className="-mx-1 mb-2">
                <PackingCustomerCommentBanner comment={SAMPLE_COMMENT} />
              </div>
            ) : null}
            <div className="rounded border border-dashed border-slate-200 bg-slate-50/80 p-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Produkty</p>
              <div className="flex flex-col gap-1.5">
                <div className="h-8 rounded border border-slate-200 bg-white" />
                <div className="h-8 rounded border border-slate-200 bg-white" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </PackingSettingsPreviewCollapse>
  );
}
