import { orderPanelStatusSelectLabel } from "../../../utils/orderPanelStatusUi";
import type { WmsPackingExtendedUiSettings } from "../../../types/wmsPackingExtendedUi";
import type { OrderStatusOption, WmsPackingSettingsRead } from "../../../types/wmsPackingSettings";
import { PackingCapabilityBadge } from "../packingSettingCapability";
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

type Props = {
  extended: WmsPackingExtendedUiSettings;
  draft: WmsPackingSettingsRead;
  statusOptions: OrderStatusOption[];
  patchExtended: <K extends keyof WmsPackingExtendedUiSettings>(key: K, value: WmsPackingExtendedUiSettings[K]) => void;
  setStatus: (key: "start_status_id" | "packed_status_id" | "missing_status_id", raw: string) => void;
  toggleAllowedStart: (id: number) => void;
};

/** Grupa 3: Proces pakowania */
export function PackingProcessSection({
  extended,
  draft,
  statusOptions,
  patchExtended,
  setStatus,
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
    <SectionCard id="wms-pack-process" title="Proces pakowania" summary="Statusy, kolejność i przebieg pakowania.">
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
        <SelectField
          settingId="packing.single_or_multi_strategy"
          label="Pakowanie według zamówień jednoelementowych lub wieloelementowych"
          capability={CAP_NONE}
          value={extended.packingSingleOrMultiItemStrategy}
          onChange={(v) =>
            patchExtended(
              "packingSingleOrMultiItemStrategy",
              v as WmsPackingExtendedUiSettings["packingSingleOrMultiItemStrategy"],
            )
          }
        >
          <option value="auto">Automatycznie</option>
          <option value="single_first">Najpierw jednoelementowe</option>
          <option value="multi_first">Najpierw wieloelementowe</option>
        </SelectField>
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
      </FieldGrid>

      <div className="mt-3 space-y-2">
        <BoolRow
          settingId="packing.go_next_order_after_packed"
          label="Po spakowaniu zamówienia przejdź do następnego zamówienia"
          checked={extended.goNextOrderAfterPacked}
          onChange={(v) => patchExtended("goNextOrderAfterPacked", v)}
          capability={CAP_NONE}
        />
      </div>

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
  );
}
