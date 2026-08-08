import { useMemo, useState, type ReactNode } from "react";

import { AutomationStatusPicker } from "../../../components/orders/automation/AutomationStatusPicker";
import { AutomationValueBadges } from "../../../components/orders/automation/AutomationValueBadges";
import { ORDERS_PANEL_GROUP_LABELS } from "../../../components/orders/OrdersPanelStatusSidebar";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import type { WmsPackingExtendedUiSettings } from "../../../types/wmsPackingExtendedUi";
import type { WmsPackingSettingsRead } from "../../../types/wmsPackingSettings";
import { PackingCapabilityBadge, type PackingSettingCapability } from "../packingSettingCapability";
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

function buildStatusLabelById(summary: OrderUiStatusPanelSummary | null): Map<number, string> {
  const map = new Map<number, string>();
  if (!summary) return map;
  for (const block of summary.groups) {
    const groupLabel = ORDERS_PANEL_GROUP_LABELS[block.main_group] ?? block.main_group;
    for (const s of block.sub_statuses) {
      const name = (s.name || "").trim() || `#${s.id}`;
      map.set(s.id, `${name} — ${groupLabel}`);
    }
  }
  return map;
}

function PackingStatusSetting({
  settingId,
  label,
  capability,
  capabilityNote,
  selectedLabel,
  onClear,
  onFocusSelected,
  children,
}: {
  settingId: string;
  label: string;
  capability?: PackingSettingCapability;
  capabilityNote?: string;
  selectedLabel: string | null;
  onClear?: () => void;
  onFocusSelected?: () => void;
  children: ReactNode;
}) {
  return (
    <WmsControlSettingRow
      settingId={settingId}
      label={label}
      footer={
        <>
          {capability ? (
            <span className="mt-1 block">
              <PackingCapabilityBadge kind={capability} note={capabilityNote} />
            </span>
          ) : null}
          {selectedLabel ? (
            <span className="mt-2 block">
              <AutomationValueBadges
                labels={[selectedLabel]}
                removable={Boolean(onClear)}
                onRemove={onClear ? () => onClear() : undefined}
                onBadgeClick={onFocusSelected}
              />
            </span>
          ) : null}
        </>
      }
    >
      {children}
    </WmsControlSettingRow>
  );
}

/** Grupa 3: Proces pakowania */
export function PackingProcessSection({
  extended,
  draft,
  panelSummary,
  panelSubgroups,
  patchExtended,
  setStatus,
}: Props) {
  const statusLabelById = useMemo(() => buildStatusLabelById(panelSummary), [panelSummary]);
  const [focusStart, setFocusStart] = useState<number | null>(null);
  const [focusPacked, setFocusPacked] = useState<number | null>(null);
  const [focusMissing, setFocusMissing] = useState<number | null>(null);
  const [focusMulti, setFocusMulti] = useState<number | null>(null);

  const labelFor = (id: number | null | undefined) =>
    id != null && id > 0 ? statusLabelById.get(id) ?? `#${id}` : null;

  const hasStatuses =
    panelSummary != null && panelSummary.groups.some((g) => (g.sub_statuses?.length ?? 0) > 0);

  return (
    <SectionCard id="wms-pack-process" title="Proces pakowania" summary="Statusy, kolejność i przebieg pakowania.">
      <SettingsStack>
        <PackingStatusSetting
          settingId="packing.start_status_id"
          label="Status zamówienia do rozpoczęcia pakowania"
          capability={CAP_PARTIAL}
          capabilityNote="używane po zbieraniu / domknięciu braków, nie jako filtr startu ekranu pakowania."
          selectedLabel={labelFor(draft.start_status_id)}
          onClear={() => setStatus("start_status_id", "")}
          onFocusSelected={() => {
            if (draft.start_status_id != null) setFocusStart(draft.start_status_id);
          }}
        >
          {hasStatuses ? (
            <AutomationStatusPicker
              panelSummary={panelSummary}
              panelSubgroups={panelSubgroups}
              selectedStatusId={draft.start_status_id}
              allowClear
              clearLabel="— brak —"
              focusStatusId={focusStart}
              onFocusStatusHandled={() => setFocusStart(null)}
              listMaxHeightClass="max-h-64"
              onPick={(id) => setStatus("start_status_id", id != null ? String(id) : "")}
            />
          ) : (
            <p className="text-sm text-slate-500">Brak statusów dla magazynu.</p>
          )}
        </PackingStatusSetting>

        <PackingStatusSetting
          settingId="packing.packed_status_id"
          label="Status dla spakowanego zamówienia"
          selectedLabel={labelFor(draft.packed_status_id)}
          onClear={() => setStatus("packed_status_id", "")}
          onFocusSelected={() => {
            if (draft.packed_status_id != null) setFocusPacked(draft.packed_status_id);
          }}
        >
          {hasStatuses ? (
            <AutomationStatusPicker
              panelSummary={panelSummary}
              panelSubgroups={panelSubgroups}
              selectedStatusId={draft.packed_status_id}
              allowClear
              clearLabel="— brak —"
              focusStatusId={focusPacked}
              onFocusStatusHandled={() => setFocusPacked(null)}
              listMaxHeightClass="max-h-64"
              onPick={(id) => setStatus("packed_status_id", id != null ? String(id) : "")}
            />
          ) : (
            <p className="text-sm text-slate-500">Brak statusów dla magazynu.</p>
          )}
        </PackingStatusSetting>

        <PackingStatusSetting
          settingId="packing.missing_status_id"
          label="Status dla braków w zamówieniu"
          capability={CAP_NONE}
          selectedLabel={labelFor(draft.missing_status_id)}
          onClear={() => setStatus("missing_status_id", "")}
          onFocusSelected={() => {
            if (draft.missing_status_id != null) setFocusMissing(draft.missing_status_id);
          }}
        >
          {hasStatuses ? (
            <AutomationStatusPicker
              panelSummary={panelSummary}
              panelSubgroups={panelSubgroups}
              selectedStatusId={draft.missing_status_id}
              allowClear
              clearLabel="— brak —"
              focusStatusId={focusMissing}
              onFocusStatusHandled={() => setFocusMissing(null)}
              listMaxHeightClass="max-h-64"
              onPick={(id) => setStatus("missing_status_id", id != null ? String(id) : "")}
            />
          ) : (
            <p className="text-sm text-slate-500">Brak statusów dla magazynu.</p>
          )}
        </PackingStatusSetting>
      </SettingsStack>

      <div className="mt-2">
        <FieldGrid>
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
            <>
              <span className="mt-1 block">
                <PackingCapabilityBadge kind="none" />
              </span>
              {extended.allowedStartStatusIds.length > 0 ? (
                <span className="mt-2 block">
                  <AutomationValueBadges
                    labels={extended.allowedStartStatusIds.map((id) => statusLabelById.get(id) ?? `#${id}`)}
                    removable
                    onRemove={(index) => {
                      const next = extended.allowedStartStatusIds.filter((_, i) => i !== index);
                      patchExtended("allowedStartStatusIds", next);
                    }}
                    onBadgeClick={(index) => {
                      const id = extended.allowedStartStatusIds[index];
                      if (id != null) setFocusMulti(id);
                    }}
                  />
                </span>
              ) : null}
            </>
          }
        >
          {hasStatuses ? (
            <AutomationStatusPicker
              panelSummary={panelSummary}
              panelSubgroups={panelSubgroups}
              selectedStatusIds={extended.allowedStartStatusIds}
              focusStatusId={focusMulti}
              onFocusStatusHandled={() => setFocusMulti(null)}
              listMaxHeightClass="max-h-72"
              onSelectedIdsChange={(ids) =>
                patchExtended(
                  "allowedStartStatusIds",
                  [...ids].sort((a, b) => a - b),
                )
              }
            />
          ) : (
            <p className="text-sm text-slate-500">Brak statusów dla magazynu.</p>
          )}
        </WmsControlSettingRow>
      </Subsection>
    </SectionCard>
  );
}
