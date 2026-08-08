import { OrderUiStatusField } from "../../components/orders/OrderUiStatusField";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import {
  WmsBoolSettingRow,
  WmsControlSettingRow,
  WmsSettingCapabilityFooter,
  wmsSettingControlSelectClass,
  wmsSettingsRowsStackClass,
} from "./wmsSettingsUi";
import {
  type SmartMatchingIdenticalThreshold,
  type WmsPackagingProposalLocalConfigV1,
} from "./wmsPackagingProposalLocalConfig";

type Props = {
  /** Smart Matching: pokaż próg uczenia z identycznych zamówień. 3D: ukryj (nie uczy się z historii). */
  showSmartLearningThreshold: boolean;
  config: WmsPackagingProposalLocalConfigV1;
  patchConfig: (patch: Partial<WmsPackagingProposalLocalConfigV1>) => void;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
};

export function WmsPackagingProposalEngineConfigForm({
  showSmartLearningThreshold,
  config,
  patchConfig,
  panelSummary,
  panelSubgroups,
}: Props) {
  const hasStatuses =
    panelSummary != null && panelSummary.groups.some((g) => (g.sub_statuses?.length ?? 0) > 0);

  return (
    <div className={wmsSettingsRowsStackClass}>
      <WmsBoolSettingRow
        label="Włącz propozycje opakowań dla zamówień"
        hint="Globalny przełącznik: gdy wyłączony, ani Smart Matching, ani 3D Matching nie aktywują silnika propozycji w przepływie realizacji."
        footer={<WmsSettingCapabilityFooter capability="partial" capabilityNote="do pełnego podpięcia pod backend." />}
        checked={config.packagingSuggestionsEnabled}
        onChange={(packagingSuggestionsEnabled) => patchConfig({ packagingSuggestionsEnabled })}
      />

      {showSmartLearningThreshold ? (
        <WmsControlSettingRow
          label="Wymagana liczba identycznych, spakowanych zamówień"
          hint="Po N-krotnym spakowaniu zamówień o identycznej strukturze system tworzy regułę powiązania z kartonem (tylko Smart Matching)."
        >
          <select
            className={wmsSettingControlSelectClass}
            value={config.identicalOrdersThreshold}
            onChange={(e) =>
              patchConfig({ identicalOrdersThreshold: Number(e.target.value) as SmartMatchingIdenticalThreshold })
            }
          >
            <option value={2}>2 identyczne zamówienia</option>
            <option value={3}>3 identyczne zamówienia</option>
            <option value={5}>5 identycznych zamówień</option>
          </select>
        </WmsControlSettingRow>
      ) : (
        <div className="rounded-lg border border-slate-100 bg-blue-50/35 px-3 py-3 text-xs leading-relaxed text-slate-800">
          <p className="font-semibold text-slate-900">3D Matching a uczenie</p>
          <p className="mt-1 text-slate-700">
            Ten silnik nie uczy się z historii — dobór kartonu wynika z wymiarów i obliczeń fizycznego dopasowania.
          </p>
        </div>
      )}

      <WmsControlSettingRow
        label="Statusy inicjujące propozycję opakowania"
        hint="Wejście zamówienia w dowolny z wybranych statusów uruchamia generowanie propozycji."
        footer={<WmsSettingCapabilityFooter capability="partial" />}
      >
        {hasStatuses ? (
          <OrderUiStatusField
            panelSummary={panelSummary}
            panelSubgroups={panelSubgroups}
            selectedStatusIds={config.proposalInitStatusIds}
            placeholder="Wybierz statusy…"
            onSelectedIdsChange={(ids) =>
              patchConfig({ proposalInitStatusIds: [...ids].sort((a, b) => a - b) })
            }
          />
        ) : (
          <p className="text-sm text-slate-500">Brak statusów panelu.</p>
        )}
      </WmsControlSettingRow>

      <WmsBoolSettingRow
        label="Włącz automatyczne generowanie etykiet po dopasowaniu"
        hint="Działanie po udanym dopasowaniu opakowania — nie jest częścią uczenia."
        footer={<WmsSettingCapabilityFooter capability="partial" />}
        checked={config.autoLabelAfterMatchEnabled}
        onChange={(autoLabelAfterMatchEnabled) => patchConfig({ autoLabelAfterMatchEnabled })}
      />

      {config.autoLabelAfterMatchEnabled ? (
        <WmsControlSettingRow
          label="Statusy workflow z auto-generowaniem etykiet"
          hint="Wiele statusów operacyjnych powiązanych z wydrukiem etykiety po dopasowaniu."
        >
          {hasStatuses ? (
            <OrderUiStatusField
              panelSummary={panelSummary}
              panelSubgroups={panelSubgroups}
              selectedStatusIds={config.autoLabelWorkflowStatusIds}
              placeholder="Wybierz statusy…"
              onSelectedIdsChange={(ids) =>
                patchConfig({ autoLabelWorkflowStatusIds: [...ids].sort((a, b) => a - b) })
              }
            />
          ) : (
            <p className="text-sm text-slate-500">Brak statusów panelu.</p>
          )}
        </WmsControlSettingRow>
      ) : null}
    </div>
  );
}
