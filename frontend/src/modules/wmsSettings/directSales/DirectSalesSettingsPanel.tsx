import { forwardRef, useEffect, useImperativeHandle } from "react";

import { DAMAGE_TENANT_ID } from "../../../constants/panelTenant";
import { WmsSettingsLayout } from "../../../pages/Settings/WmsSettingsLayout";
import { ValidationWarnings } from "./components/ValidationWarnings";
import { DIRECT_SALES_SETTINGS_NAV_SECTIONS } from "./directSalesSettingsNavSections";
import { useDirectSalesSettings } from "./hooks/useDirectSalesSettings";
import { CustomersSection } from "./sections/CustomersSection";
import { GeneralSection } from "./sections/GeneralSection";
import { PaymentsSection } from "./sections/PaymentsSection";
import { PricingSection } from "./sections/PricingSection";
import { StockSection } from "./sections/StockSection";
import { TerminalSection } from "./sections/TerminalSection";

export type DirectSalesSettingsPanelHandle = {
  saveAll: () => Promise<void>;
  discardUnsaved: () => Promise<void>;
};

type Props = {
  warehouseId: number | null;
  onDirtyChange?: (dirty: boolean) => void;
  sectionNavObserve?: boolean;
};

export const DirectSalesSettingsPanel = forwardRef<DirectSalesSettingsPanelHandle, Props>(
  function DirectSalesSettingsPanel({ warehouseId, onDirtyChange, sectionNavObserve = true }, ref) {
    const state = useDirectSalesSettings(DAMAGE_TENANT_ID, warehouseId);

    useEffect(() => {
      onDirtyChange?.(state.dirty);
    }, [state.dirty, onDirtyChange]);

    useImperativeHandle(ref, () => ({
      saveAll: async () => {
        await state.save();
      },
      discardUnsaved: async () => {
        state.discard();
      },
    }));

    if (warehouseId == null) {
      return <p className="text-sm text-slate-600">Wybierz magazyn w nagłówku, aby skonfigurować sprzedaż bezpośrednią.</p>;
    }

    if (state.loading || !state.draft) {
      return <p className="text-sm text-slate-500">Ładowanie ustawień sprzedaży bezpośredniej…</p>;
    }

    if (state.error) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {state.error}
          <button type="button" className="ml-2 underline" onClick={() => void state.reload()}>
            Spróbuj ponownie
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Zakres konfiguracji</h2>
              <p className="text-xs text-slate-500">
                Magazyn: #{warehouseId}
                {state.hasWarehouseOverride ? " · aktywne nadpisanie magazynu" : " · dziedziczy domyślne tenanta"}
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
              <button
                type="button"
                onClick={() => state.switchScope("tenant")}
                className={`rounded-md px-3 py-1.5 font-medium ${state.scope === "tenant" ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                Domyślne tenanta
              </button>
              <button
                type="button"
                onClick={() => state.switchScope("warehouse")}
                className={`rounded-md px-3 py-1.5 font-medium ${state.scope === "warehouse" ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                Ten magazyn
              </button>
            </div>
          </div>
          <ValidationWarnings config={state.draft} />
        </div>
        <WmsSettingsLayout sections={DIRECT_SALES_SETTINGS_NAV_SECTIONS} observeSections={sectionNavObserve}>
          <GeneralSection config={state.draft} onChange={state.patch} />
          <PaymentsSection config={state.draft} onChange={state.patch} />
          <StockSection config={state.draft} onChange={state.patch} />
          <PricingSection config={state.draft} onChange={state.patch} />
          <CustomersSection config={state.draft} onChange={state.patch} />
          <TerminalSection config={state.draft} onChange={state.patch} />
        </WmsSettingsLayout>
      </div>
    );
  },
);
