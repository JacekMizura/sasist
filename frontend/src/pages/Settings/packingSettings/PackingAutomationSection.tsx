import type { WmsPackingExtendedUiSettings } from "../../../types/wmsPackingExtendedUi";
import type { WmsPackingAutoActions, WmsPackingSettingsRead } from "../../../types/wmsPackingSettings";
import {
  BoolRow,
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
        <div className="space-y-1">
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
            capabilityNote="gdy brak konektora kuriera — używany istniejący list z pola „List przewozowy”."
          />
          <BoolRow
            settingId="packing.auto_print_document"
            label="Wydrukuj / pobierz dokument sprzedaży"
            checked={draft.auto_actions.print_document}
            onChange={() => toggleAction("print_document")}
          />
          <BoolRow
            settingId="packing.auto_print_label"
            label="Wydrukuj / pobierz list przewozowy"
            checked={draft.auto_actions.print_label}
            onChange={() => toggleAction("print_label")}
          />
          <BoolRow
            settingId="packing.auto_change_order_status"
            label="Zmień status zamówienia"
            checked={draft.auto_actions.change_order_status}
            onChange={() => toggleAction("change_order_status")}
            help="Po spakowaniu ustawia status z „Status dla spakowanego zamówienia”. Wyłączone = bez zmiany statusu."
          />
        </div>
      </Subsection>

      <Subsection title="Akcje po dokumentach">
        <FieldGrid>
          <SelectField
            settingId="packing.after_sales_document_action"
            label="Akcja po wystawieniu dokumentu sprzedaży"
            value={extended.afterSalesDocumentAction}
            onChange={(v) =>
              patchExtended("afterSalesDocumentAction", v as WmsPackingExtendedUiSettings["afterSalesDocumentAction"])
            }
          >
            <option value="print">Wydrukuj</option>
            <option value="download">Pobierz</option>
          </SelectField>
          <SelectField
            settingId="packing.after_waybill_action"
            label="Akcja po wystawieniu listu przewozowego"
            value={extended.afterWaybillAction}
            onChange={(v) =>
              patchExtended("afterWaybillAction", v as WmsPackingExtendedUiSettings["afterWaybillAction"])
            }
            help="Przy „Wydrukuj” dodatkowo drukowany jest dokument z pola „Dokument sprzedaży”, jeśli istnieje."
          >
            <option value="print">Wydrukuj</option>
            <option value="download">Pobierz</option>
          </SelectField>
        </FieldGrid>
      </Subsection>

      <div className="mt-3 space-y-1">
        <BoolRow
          settingId="packing.show_automation_buttons"
          label="Wyświetlaj Aktywatory Automatyzacji podczas pakowania zamówienia"
          checked={extended.showAutomationButtons}
          onChange={(v) => patchExtended("showAutomationButtons", v)}
          infoKey="packing.show_automation_buttons"
          help="Pokazywane są wyłącznie aktywatory reguł z zaznaczoną opcją „Pakowanie WMS”."
        />
      </div>
    </SectionCard>
  );
}
