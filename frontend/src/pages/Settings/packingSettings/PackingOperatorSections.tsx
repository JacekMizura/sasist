import type { WmsPackingExtendedUiSettings } from "../../../types/wmsPackingExtendedUi";
import { PackingCapabilityBadge, PackingFieldLabel } from "../packingSettingCapability";
import { SettingInfoButton } from "../SettingInfoButton";
import { WmsSettingField } from "../settingsSearch";
import { PACKING_SETTING_HELP } from "./packingSettingsHelp";
import {
  BoolRow,
  CAP_NONE,
  checkboxClass,
  SectionCard,
  textInputClass,
} from "./packingSettingsUi";
import { orderPanelStatusSelectLabel } from "../../../utils/orderPanelStatusUi";
import type { OrderStatusOption } from "../../../types/wmsPackingSettings";

type Props = {
  extended: WmsPackingExtendedUiSettings;
  patchExtended: <K extends keyof WmsPackingExtendedUiSettings>(key: K, value: WmsPackingExtendedUiSettings[K]) => void;
};

/** Operator / notatki / asystent / listy — bez statusów (te są w Process). */
export function PackingOperatorSections({ extended, patchExtended }: Props) {
  const mainWhHelp = PACKING_SETTING_HELP["packing.main_packing_warehouse"];
  return (
    <>
      <SectionCard id="wms-pack-packer-warehouse" title="Osoba pakująca / magazyn" summary="Rola pakującego i magazyn docelowy.">
        <div className="space-y-2">
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

      <SectionCard
        id="wms-pack-automation-activators"
        title="Automatyzacja / aktywatory"
        summary="Widoczność aktywatorów automatyzacji w oknie pakowania."
      >
        <BoolRow
          settingId="packing.show_automation_buttons"
          label="Wyświetlaj Aktywatory Automatyzacji podczas pakowania zamówienia"
          checked={extended.showAutomationButtons}
          onChange={(v) => patchExtended("showAutomationButtons", v)}
          capability={CAP_NONE}
          infoKey="packing.show_automation_buttons"
        />
      </SectionCard>

      <SectionCard id="wms-pack-notes" title="Notatki" summary="Widoczność i popup notatek w pakowaniu.">
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
        </div>
      </SectionCard>

      <SectionCard id="wms-pack-legacy-templates" title="Szablony zastępcze" summary="Awaryjne szablony ze starszych integracji.">
        <BoolRow
          settingId="packing.fallback_legacy_templates"
          label="[BETA] W przypadku braku dostępnych szablonów w nowych integracjach kurierskich korzystaj ze starych integracji"
          checked={extended.fallbackLegacyTemplates}
          onChange={(v) => patchExtended("fallbackLegacyTemplates", v)}
          capability={CAP_NONE}
        />
      </SectionCard>

      <SectionCard id="wms-pack-orders-list-packed" title="Lista zamówień" summary="Widoczność spakowanych zamówień na liście.">
        <BoolRow
          settingId="packing.show_packed_orders"
          label="Wyświetlaj spakowane zamówienia na liście zamówień"
          checked={extended.showPackedOrders}
          onChange={(v) => patchExtended("showPackedOrders", v)}
          capability={CAP_NONE}
          infoKey="packing.show_packed_orders"
        />
      </SectionCard>

      <SectionCard id="wms-pack-assistant" title="Asystent pakowania" summary="Nawigacja po spakowaniu.">
        <BoolRow
          settingId="packing.go_next_order_after_packed"
          label="Po spakowaniu zamówienia przejdź do następnego zamówienia"
          checked={extended.goNextOrderAfterPacked}
          onChange={(v) => patchExtended("goNextOrderAfterPacked", v)}
          capability={CAP_NONE}
        />
      </SectionCard>
    </>
  );
}

/** Multi-status checklist — używane z ProcessSections. */
export function PackingAllowedStartStatusesChecklist({
  statusOptions,
  selectedIds,
  onToggle,
}: {
  statusOptions: OrderStatusOption[];
  selectedIds: number[];
  onToggle: (id: number) => void;
}) {
  return (
    <div>
      <div className="mb-2">
        <PackingCapabilityBadge kind="none" />
      </div>
      {statusOptions.length === 0 ? (
        <p className="text-sm text-slate-500">Brak statusów dla magazynu.</p>
      ) : (
        <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2">
          {statusOptions.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-white">
              <input
                type="checkbox"
                className={checkboxClass}
                checked={selectedIds.includes(o.id)}
                onChange={() => onToggle(o.id)}
              />
              <span className="text-sm leading-snug text-slate-800">{orderPanelStatusSelectLabel(o)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
