import type { WmsPackingExtendedUiSettings } from "../../../types/wmsPackingExtendedUi";
import type { WmsPackingAutoActions, WmsPackingSettingsRead } from "../../../types/wmsPackingSettings";
import {
  BoolRow,
  CAP_NONE,
  CAP_PARTIAL,
  FieldGrid,
  SectionCard,
  SelectField,
  Subsection,
} from "./packingSettingsUi";

type Props = {
  extended: WmsPackingExtendedUiSettings;
  draft: WmsPackingSettingsRead;
  patchExtended: <K extends keyof WmsPackingExtendedUiSettings>(key: K, value: WmsPackingExtendedUiSettings[K]) => void;
  toggleAction: (key: keyof WmsPackingAutoActions) => void;
};

/** Grupa 4: Automatyzacja */
export function PackingAutomationSection({ extended, draft, patchExtended, toggleAction }: Props) {
  return (
    <SectionCard
      id="wms-pack-automation"
      title="Automatyzacja"
      summary="Akcje automatyczne po spakowaniu oraz aktywatory."
    >
      <Subsection title="Akcje automatyczne po spakowaniu zamówienia">
        <div className="space-y-2">
          <BoolRow
            settingId="packing.auto_create_document"
            label="Wystaw dokument sprzedaży"
            checked={draft.auto_actions.create_document}
            onChange={() => toggleAction("create_document")}
          />
          <BoolRow
            settingId="packing.auto_generate_shipment"
            label="Wygeneruj list przewozowy"
            checked={draft.auto_actions.generate_shipment}
            onChange={() => toggleAction("generate_shipment")}
            capability={CAP_PARTIAL}
            capabilityNote="bez realnego połączenia z kurierem."
          />
          <BoolRow
            settingId="packing.auto_print_document"
            label="Wydrukuj / pobierz dokument sprzedaży"
            checked={draft.auto_actions.print_document}
            onChange={() => toggleAction("print_document")}
            capability={CAP_PARTIAL}
            capabilityNote="druk nie jest wykonywany po stronie serwera."
          />
          <BoolRow
            settingId="packing.auto_print_label"
            label="Wydrukuj / pobierz list przewozowy"
            checked={draft.auto_actions.print_label}
            onChange={() => toggleAction("print_label")}
            capability={CAP_PARTIAL}
            capabilityNote="druk etykiety działa w trybie zastępczym."
          />
          <BoolRow
            settingId="packing.auto_change_order_status"
            label="Zmień status zamówienia"
            checked={draft.auto_actions.change_order_status}
            onChange={() => toggleAction("change_order_status")}
            capability={CAP_PARTIAL}
            capabilityNote="status i tak może zostać ustawiony heurystycznie."
          />
        </div>
      </Subsection>

      <Subsection title="Akcje po dokumentach">
        <FieldGrid>
          <SelectField
            settingId="packing.after_sales_document_action"
            label="Akcja po wystawieniu dokumentu sprzedaży"
            capability={CAP_NONE}
            value={extended.afterSalesDocumentAction}
            onChange={(v) =>
              patchExtended("afterSalesDocumentAction", v as WmsPackingExtendedUiSettings["afterSalesDocumentAction"])
            }
          >
            <option value="none">Brak</option>
            <option value="print">Drukuj</option>
            <option value="download">Pobierz</option>
            <option value="open">Otwórz</option>
          </SelectField>
          <SelectField
            settingId="packing.after_waybill_action"
            label="Akcja po wystawieniu listu przewozowego"
            capability={CAP_NONE}
            value={extended.afterWaybillAction}
            onChange={(v) =>
              patchExtended("afterWaybillAction", v as WmsPackingExtendedUiSettings["afterWaybillAction"])
            }
          >
            <option value="none">Brak</option>
            <option value="print">Drukuj</option>
            <option value="download">Pobierz</option>
            <option value="open">Otwórz</option>
          </SelectField>
        </FieldGrid>
      </Subsection>

      <div className="mt-3 space-y-2">
        <BoolRow
          settingId="packing.show_automation_buttons"
          label="Wyświetlaj Aktywatory Automatyzacji podczas pakowania zamówienia"
          checked={extended.showAutomationButtons}
          onChange={(v) => patchExtended("showAutomationButtons", v)}
          capability={CAP_NONE}
          infoKey="packing.show_automation_buttons"
        />
      </div>
    </SectionCard>
  );
}
