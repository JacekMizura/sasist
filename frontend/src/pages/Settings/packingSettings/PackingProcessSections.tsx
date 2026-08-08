import { orderPanelStatusSelectLabel } from "../../../utils/orderPanelStatusUi";
import type { WmsPackingExtendedUiSettings } from "../../../types/wmsPackingExtendedUi";
import type {
  OrderStatusOption,
  WmsPackingAutoActions,
  WmsPackingSettingsRead,
} from "../../../types/wmsPackingSettings";
import {
  BoolRow,
  CAP_NONE,
  CAP_PARTIAL,
  checkboxClass,
  FieldGrid,
  SectionCard,
  SelectField,
  Subsection,
} from "./packingSettingsUi";
import { PackingCapabilityBadge } from "../packingSettingCapability";

type Props = {
  extended: WmsPackingExtendedUiSettings;
  draft: WmsPackingSettingsRead;
  statusOptions: OrderStatusOption[];
  patchExtended: <K extends keyof WmsPackingExtendedUiSettings>(key: K, value: WmsPackingExtendedUiSettings[K]) => void;
  setStatus: (key: "start_status_id" | "packed_status_id" | "missing_status_id", raw: string) => void;
  toggleAction: (key: keyof WmsPackingAutoActions) => void;
  toggleAllowedStart: (id: number) => void;
};

export function PackingProcessSections({
  extended,
  draft,
  statusOptions,
  patchExtended,
  setStatus,
  toggleAction,
  toggleAllowedStart,
}: Props) {
  const statusOpts = (
    <>
      <option value="">— brak —</option>
      {statusOptions.map((o) => (
        <option key={o.id} value={o.id}>
          {orderPanelStatusSelectLabel(o)}
        </option>
      ))}
    </>
  );

  return (
    <>
      <SectionCard
        id="wms-pack-mode-settings"
        title="Tryb pakowania - ustawienia"
        summary="Statusy używane przy starcie, spakowaniu i brakach."
      >
        <FieldGrid>
          <SelectField
            settingId="packing.start_status_id"
            label="Status zamówienia do rozpoczęcia pakowania"
            capability={CAP_PARTIAL}
            capabilityNote="używane po zbieraniu / domknięciu braków, nie jako filtr startu ekranu pakowania."
            value={draft.start_status_id != null ? String(draft.start_status_id) : ""}
            onChange={(v) => setStatus("start_status_id", v)}
          >
            {statusOpts}
          </SelectField>
          <SelectField
            settingId="packing.packed_status_id"
            label="Status dla spakowanego zamówienia"
            value={draft.packed_status_id != null ? String(draft.packed_status_id) : ""}
            onChange={(v) => setStatus("packed_status_id", v)}
          >
            {statusOpts}
          </SelectField>
          <SelectField
            settingId="packing.missing_status_id"
            label="Status dla braków w zamówieniu"
            capability={CAP_NONE}
            value={draft.missing_status_id != null ? String(draft.missing_status_id) : ""}
            onChange={(v) => setStatus("missing_status_id", v)}
          >
            {statusOpts}
          </SelectField>
        </FieldGrid>

        <Subsection title="Statusy zamówienia do rozpoczęcia pakowania (wiele)">
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
                    checked={extended.allowedStartStatusIds.includes(o.id)}
                    onChange={() => toggleAllowedStart(o.id)}
                  />
                  <span className="text-sm leading-snug text-slate-800">{orderPanelStatusSelectLabel(o)}</span>
                </label>
              ))}
            </div>
          )}
        </Subsection>
      </SectionCard>

      <SectionCard
        id="wms-pack-auto-actions"
        title="Akcje automatyczne po spakowaniu zamówienia"
        summary="Czynności uruchamiane po domknięciu pakowania."
      >
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
      </SectionCard>

      <SectionCard id="wms-pack-after-documents" title="Akcje po dokumentach" summary="Co zrobić po wystawieniu dokumentów.">
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
      </SectionCard>

      <SectionCard
        id="wms-pack-effect-after-auto"
        title="Efekt po wykonaniu akcji automatycznych"
        summary="Co ma się stać z ekranem po automatyce."
      >
        <SelectField
          settingId="packing.effect_after_auto_actions"
          label="Efekt po wykonaniu akcji automatycznych"
          capability={CAP_PARTIAL}
          capabilityNote="„Zostań” i „Wróć na listę” działają; „Następne zamówienie” jeszcze nie."
          value={extended.afterActionsBehavior}
          onChange={(v) =>
            patchExtended("afterActionsBehavior", v as WmsPackingExtendedUiSettings["afterActionsBehavior"])
          }
        >
          <option value="stay_here">Zostań przy bieżącym zamówieniu</option>
          <option value="return_to_list">Wróć na listę zamówień</option>
          <option value="next_order">Przejdź do następnego zamówienia</option>
        </SelectField>
      </SectionCard>
    </>
  );
}
