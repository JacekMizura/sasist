import { Check, X } from "lucide-react";

import { useWmsSettingsSectionRegistry } from "../../../pages/Settings/WmsSettingsSectionRegistryContext";
import type { WmsPickingExtendedUiSettings } from "../../../types/wmsPickingExtendedUi";

type ModeSummary = {
  name: string;
  pickingModeLabel: string;
  singleLabel: string;
  multiLabel: string;
  afterLabel: string;
};

type Props = {
  activeMode: ModeSummary | null;
  extended: WmsPickingExtendedUiSettings;
};

function Row({ ok, label, value }: { ok?: boolean; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs leading-snug">
      <span className="text-slate-500">{label}</span>
      <span className="inline-flex max-w-[55%] items-center justify-end gap-1 text-right font-medium text-slate-800">
        {ok === true ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden /> : null}
        {ok === false ? <X className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden /> : null}
        {value}
      </span>
    </div>
  );
}

/** Sticky right-hand configuration preview — read-only snapshot of key picking settings. */
export function PickingConfigPreviewPanel({ activeMode, extended }: Props) {
  const { scrollToSection } = useWmsSettingsSectionRegistry();
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">Podgląd konfiguracji</h3>
      <p className="mt-0.5 text-[11px] text-slate-500">Szybkie podsumowanie bez przełączania sekcji.</p>

      <div className="mt-4 space-y-4">
        <section>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Aktywny tryb</p>
          {activeMode ? (
            <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2">
              <p className="text-sm font-semibold text-blue-900">{activeMode.name}</p>
              <p className="mt-0.5 text-[11px] text-blue-800/80">{activeMode.pickingModeLabel}</p>
              <p className="mt-1 text-[11px] text-slate-600">
                1-poz.: {activeMode.singleLabel}
                <br />
                Multi: {activeMode.multiLabel}
              </p>
              <p className="mt-1 text-[11px] text-slate-600">Po zebraniu: {activeMode.afterLabel}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Brak zapisanych trybów.</p>
          )}
        </section>

        <section className="space-y-1.5 border-t border-slate-100 pt-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Skanowanie</p>
          <Row
            ok={extended.requireProductScanAtLeastOnce}
            label="Skan produktu"
            value={extended.requireProductScanAtLeastOnce ? "Tak" : "Nie"}
          />
          <Row
            ok={extended.requireLocationScan}
            label="Skan lokalizacji"
            value={extended.requireLocationScan ? "Tak" : "Nie"}
          />
          <Row
            ok={extended.requireCartScanStart}
            label="Skan wózka"
            value={extended.requireCartScanStart ? "Tak" : "Nie"}
          />
        </section>

        <section className="space-y-1.5 border-t border-slate-100 pt-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Kolejkowanie</p>
          <Row label="Batch multi" value={`${extended.multiItemBatchOrdersCount}`} />
          <Row label="Batch 1-poz." value={`${extended.singleItemBatchOrdersCount}`} />
          <Row
            label="Limit objętości"
            value={extended.singleItemVolumeLimit > 0 ? String(extended.singleItemVolumeLimit) : "Brak"}
          />
        </section>

        <section className="space-y-1.5 border-t border-slate-100 pt-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Braki</p>
          <Row
            ok={extended.showMissingProductsHints}
            label="Podpowiedzi braków"
            value={extended.showMissingProductsHints ? "Tak" : "Nie"}
          />
          <Row
            ok={!extended.disableAutoDetachMissingOrdersFromCarts}
            label="Auto-odpinanie"
            value={extended.disableAutoDetachMissingOrdersFromCarts ? "Wyłączone" : "Włączone"}
          />
        </section>

        <section className="space-y-1.5 border-t border-slate-100 pt-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Automatyzacja</p>
          <Row ok={extended.autoStartNextOrder} label="Następne zamówienie" value={extended.autoStartNextOrder ? "Tak" : "Nie"} />
          <Row
            ok={extended.autoMoveToPackingStatus}
            label="Do pakowania"
            value={extended.autoMoveToPackingStatus ? "Tak" : "Nie"}
          />
          <Row
            ok={extended.autoPrintTransferLabels}
            label="Druk etykiet"
            value={extended.autoPrintTransferLabels ? "Tak" : "Nie"}
          />
        </section>
      </div>

      <button
        type="button"
        onClick={() => scrollToSection("wms-pick-advanced")}
        className="mt-4 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
      >
        Pokaż wszystkie ustawienia
      </button>
    </div>
  );
}
