import { useMemo } from "react";
import type { WmsPackingExtendedUiSettings } from "../../../types/wmsPackingExtendedUi";
import { SettingInfoButton } from "../SettingInfoButton";
import { WmsSettingField } from "../settingsSearch";
import { PACKING_SETTING_HELP } from "./packingSettingsHelp";
import { BoolRow, CAP_NONE, SectionCard, selectClass } from "./packingSettingsUi";

export type PackingWarehouseOption = { id: number; name: string };

type Props = {
  extended: WmsPackingExtendedUiSettings;
  patchExtended: <K extends keyof WmsPackingExtendedUiSettings>(key: K, value: WmsPackingExtendedUiSettings[K]) => void;
  /** Server-backed: TenantFulfillmentConfiguration.consolidation_warehouse_id */
  mainPackingWarehouseId: number | null;
  onMainPackingWarehouseChange: (warehouseId: number | null) => void;
  warehouses: PackingWarehouseOption[];
  warehousesLoading?: boolean;
};

/** Grupa 1: Ogólne */
export function PackingGeneralSection({
  extended,
  patchExtended,
  mainPackingWarehouseId,
  onMainPackingWarehouseChange,
  warehouses,
  warehousesLoading,
}: Props) {
  const mainWhHelp = PACKING_SETTING_HELP["packing.main_packing_warehouse"];
  const selectValue = mainPackingWarehouseId != null && mainPackingWarehouseId > 0 ? String(mainPackingWarehouseId) : "";

  const options = useMemo(() => {
    const byId = new Map(warehouses.map((w) => [w.id, w]));
    // Keep selected WH visible even if it temporarily dropped from eligible list.
    if (mainPackingWarehouseId != null && mainPackingWarehouseId > 0 && !byId.has(mainPackingWarehouseId)) {
      return [
        ...warehouses,
        { id: mainPackingWarehouseId, name: `Magazyn #${mainPackingWarehouseId} (niedostępny)` },
      ];
    }
    return warehouses;
  }, [warehouses, mainPackingWarehouseId]);

  return (
    <SectionCard id="wms-pack-general" title="Ogólne" summary="Ogólne zachowanie procesu pakowania.">
      <div className="space-y-2">
        <BoolRow
          settingId="packing.show_all_notes"
          label="Pokazuj wszystkie notatki"
          checked={extended.showAllNotes}
          onChange={(v) => patchExtended("showAllNotes", v)}
          infoKey="packing.show_all_notes"
        />
        <BoolRow
          settingId="packing.require_notes_popup"
          label="Otwieraj notatki w wyskakującym oknie"
          checked={extended.requireNotesPopup}
          onChange={(v) => patchExtended("requireNotesPopup", v)}
          infoKey="packing.require_notes_popup"
        />
        <BoolRow
          settingId="packing.packer_is_not_picker"
          label="Osoba pakująca nie jest zbieraczem"
          checked={extended.packerIsNotPicker}
          onChange={(v) => patchExtended("packerIsNotPicker", v)}
          capability={CAP_NONE}
          infoKey="packing.packer_is_not_picker"
        />
      </div>
      <div className="mt-3">
        <WmsSettingField settingId="packing.main_packing_warehouse" className="block text-sm font-medium text-slate-700">
          <span className="mb-1 block">
            <span className="inline text-sm font-medium leading-snug text-slate-700">
              Główny magazyn do pakowania
              {mainWhHelp ? (
                <SettingInfoButton
                  title="Główny magazyn do pakowania"
                  description={mainWhHelp.description}
                  tip={mainWhHelp.tip}
                />
              ) : null}
            </span>
          </span>
          <select
            className={selectClass}
            value={selectValue}
            disabled={warehousesLoading}
            onChange={(e) => {
              const v = e.target.value;
              onMainPackingWarehouseChange(v === "" ? null : Number(v));
            }}
          >
            <option value="">— wybierz magazyn —</option>
            {options.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </WmsSettingField>
      </div>
    </SectionCard>
  );
}
