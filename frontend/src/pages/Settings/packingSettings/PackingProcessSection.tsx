import type { ComponentProps } from "react";

import { OrderUiStatusField } from "../../../components/orders/OrderUiStatusField";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import type { WmsPackingExtendedUiSettings } from "../../../types/wmsPackingExtendedUi";
import type { WmsPackingSettingsRead } from "../../../types/wmsPackingSettings";
import { PackingCapabilityBadge } from "../packingSettingCapability";
import { WmsControlSettingRow } from "../wmsSettingRow";
import {
  BoolRow,
  CAP_NONE,
  CAP_PARTIAL,
  FieldGrid,
  SectionCard,
  SelectField,
  SettingsStack,
  Subsection,
} from "./packingSettingsUi";

type Props = {
  extended: WmsPackingExtendedUiSettings;
  draft: WmsPackingSettingsRead;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
  patchExtended: <K extends keyof WmsPackingExtendedUiSettings>(key: K, value: WmsPackingExtendedUiSettings[K]) => void;
  setStatus: (key: "start_status_id" | "packed_status_id" | "missing_status_id", raw: string) => void;
};

type StatusFieldProps = Omit<ComponentProps<typeof OrderUiStatusField>, "panelSummary" | "panelSubgroups">;

/** Grupa 3: Proces pakowania */
export function PackingProcessSection({
  extended,
  draft,
  panelSummary,
  panelSubgroups,
  patchExtended,
  setStatus,
}: Props) {
  const hasStatuses =
    panelSummary != null && panelSummary.groups.some((g) => (g.sub_statuses?.length ?? 0) > 0);

  const statusField = (props: StatusFieldProps) =>
    hasStatuses ? (
      <OrderUiStatusField panelSummary={panelSummary} panelSubgroups={panelSubgroups} {...props} />
    ) : (
      <p className="text-sm text-slate-500">Brak statusów dla magazynu.</p>
    );

  return (
    <SectionCard id="wms-pack-process" title="Proces pakowania" summary="Statusy, kolejność i przebieg pakowania.">
      <SettingsStack>
        <WmsControlSettingRow
          settingId="packing.start_status_id"
          label="Status zamówienia do rozpoczęcia pakowania"
          hint="Status startowy pakowania, gdy nie korzystasz ze zbierania. Konfiguracja zbierania działa niezależnie."
        >
          {statusField({
            selectedStatusId: draft.start_status_id,
            allowClear: true,
            clearLabel: "— brak —",
            onPick: (id) => setStatus("start_status_id", id != null ? String(id) : ""),
          })}
        </WmsControlSettingRow>

        <WmsControlSettingRow
          settingId="packing.packed_status_id"
          label="Status dla spakowanego zamówienia"
        >
          {statusField({
            selectedStatusId: draft.packed_status_id,
            allowClear: true,
            clearLabel: "— brak —",
            onPick: (id) => setStatus("packed_status_id", id != null ? String(id) : ""),
          })}
        </WmsControlSettingRow>

        <WmsControlSettingRow
          settingId="packing.missing_status_id"
          label="Status dla braków w zamówieniu"
          hint="Używany przy akcji „Oznacz jako brak” na kafelku produktu w pakowaniu."
        >
          {statusField({
            selectedStatusId: draft.missing_status_id,
            allowClear: true,
            clearLabel: "— brak —",
            onPick: (id) => setStatus("missing_status_id", id != null ? String(id) : ""),
          })}
        </WmsControlSettingRow>
      </SettingsStack>

      <div className="mt-2">
        <BoolRow
          settingId="packing.single_or_multi_strategy"
          label="Pakowanie według zamówień jednoelementowych lub wieloelementowych"
          checked={extended.packingBySingleOrMultiItemEnabled}
          onChange={(v) => patchExtended("packingBySingleOrMultiItemEnabled", v)}
          help="Po włączeniu na ekranie wyboru trybu pakowania pojawią się kafelki: zamówienia jednoelementowe i wieloelementowe."
        />
      </div>

      <div className="mt-2">
        <FieldGrid>
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
      </div>

      <div className="mt-2">
        <BoolRow
          settingId="packing.go_next_order_after_packed"
          label="Po spakowaniu zamówienia przejdź do następnego zamówienia"
          checked={extended.goNextOrderAfterPacked}
          onChange={(v) => patchExtended("goNextOrderAfterPacked", v)}
          capability={CAP_NONE}
        />
      </div>

      <Subsection title="">
        <WmsControlSettingRow
          settingId="packing.allowed_start_status_ids"
          label="Statusy zamówienia do rozpoczęcia pakowania (wiele)"
          footer={
            <span className="mt-1 block">
              <PackingCapabilityBadge kind="none" />
            </span>
          }
        >
          {statusField({
            selectedStatusIds: extended.allowedStartStatusIds,
            onSelectedIdsChange: (ids) =>
              patchExtended(
                "allowedStartStatusIds",
                [...ids].sort((a, b) => a - b),
              ),
            placeholder: "Wybierz statusy…",
            listMaxHeightClass: "max-h-72",
          })}
        </WmsControlSettingRow>
      </Subsection>
    </SectionCard>
  );
}
