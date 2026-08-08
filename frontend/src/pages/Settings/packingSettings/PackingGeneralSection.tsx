import type { WmsPackingExtendedUiSettings } from "../../../types/wmsPackingExtendedUi";
import { PackingFieldLabel } from "../packingSettingCapability";
import { SettingInfoButton } from "../SettingInfoButton";
import { WmsSettingField } from "../settingsSearch";
import { PACKING_SETTING_HELP } from "./packingSettingsHelp";
import { BoolRow, CAP_NONE, SectionCard, textInputClass } from "./packingSettingsUi";

type Props = {
  extended: WmsPackingExtendedUiSettings;
  patchExtended: <K extends keyof WmsPackingExtendedUiSettings>(key: K, value: WmsPackingExtendedUiSettings[K]) => void;
};

/** Grupa 1: Ogólne */
export function PackingGeneralSection({ extended, patchExtended }: Props) {
  const mainWhHelp = PACKING_SETTING_HELP["packing.main_packing_warehouse"];
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
          <span className="mb-1 flex items-start gap-2">
            <PackingFieldLabel capability={CAP_NONE}>Główny magazyn do pakowania</PackingFieldLabel>
            {mainWhHelp ? (
              <SettingInfoButton title="Główny magazyn do pakowania" description={mainWhHelp} />
            ) : null}
          </span>
          <input
            type="text"
            className={textInputClass}
            value={extended.mainPackingWarehouse}
            onChange={(e) => patchExtended("mainPackingWarehouse", e.target.value)}
            placeholder="Kod lub nazwa magazynu"
          />
        </WmsSettingField>
      </div>
    </SectionCard>
  );
}
