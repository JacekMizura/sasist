import { OrderUiStatusField } from "../../components/orders/OrderUiStatusField";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import { SettingsSubsection } from "./SettingsSubsection";
import {
  WmsBoolSettingRow,
  WmsControlSettingRow,
  wmsSettingControlSelectClass,
  wmsSettingsRowsStackClass,
} from "./wmsSettingsUi";
import {
  type SmartMatchingIdenticalThreshold,
  type WmsPackagingProposalLocalConfigV1,
} from "./wmsPackagingProposalLocalConfig";

type Props = {
  /** Smart Matching: pokaż próg uczenia z identycznych zamówień. 3D: ukryj. */
  showSmartLearningThreshold: boolean;
  config: WmsPackagingProposalLocalConfigV1;
  patchConfig: (patch: Partial<WmsPackagingProposalLocalConfigV1>) => void;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
  /** Gdy true — zapis odbywa się przez API (brak CAP_PARTIAL). */
  wiredToBackend?: boolean;
};

export function WmsPackagingProposalEngineConfigForm({
  showSmartLearningThreshold,
  config,
  patchConfig,
  panelSummary,
  panelSubgroups,
  wiredToBackend = true,
}: Props) {
  const hasStatuses =
    panelSummary != null && panelSummary.groups.some((g) => (g.sub_statuses?.length ?? 0) > 0);
  void wiredToBackend;

  return (
    <div className="space-y-5">
      <SettingsSubsection title="Propozycje opakowań">
        <div className={wmsSettingsRowsStackClass}>
          <WmsBoolSettingRow
            settingId="smart.packaging_suggestions_enabled"
            label="Włącz propozycje opakowań do zamówień"
            hint="Po włączeniu system może tworzyć rekomendacje opakowań na podstawie historii pakowań (Smart Matching) oraz silnika 3D. Po wyłączeniu rekomendacje nie są używane ani aktualizowane (nowe reguły nie powstają). Historia pakowań nadal jest zapisywana."
            checked={config.packagingSuggestionsEnabled}
            onChange={(packagingSuggestionsEnabled) => patchConfig({ packagingSuggestionsEnabled })}
          />
        </div>
      </SettingsSubsection>

      {showSmartLearningThreshold ? (
        <SettingsSubsection title="Reguły na podstawie historii pakowań">
          <div className={wmsSettingsRowsStackClass}>
            <WmsControlSettingRow
              settingId="smart.identical_orders_threshold"
              label="Próg identycznych zamówień"
              hint="Po ilu spakowaniach zamówień o identycznym składzie produktów (product_id + ilość) system tworzy regułę powiązania z kartonem. Dotyczy wyłącznie Smart Matching (nie 3D)."
            >
              <select
                className={wmsSettingControlSelectClass}
                value={config.identicalOrdersThreshold}
                onChange={(e) =>
                  patchConfig({
                    identicalOrdersThreshold: Number(e.target.value) as SmartMatchingIdenticalThreshold,
                  })
                }
              >
                <option value={2}>2 identyczne zamówienia</option>
                <option value={3}>3 identyczne zamówienia</option>
                <option value={5}>5 identycznych zamówień</option>
              </select>
            </WmsControlSettingRow>
          </div>
        </SettingsSubsection>
      ) : null}

      <SettingsSubsection title="Statusy workflow">
        <div className={wmsSettingsRowsStackClass}>
          <WmsControlSettingRow
            settingId="smart.proposal_init_status"
            label="Status inicjujący propozycję opakowania"
            hint="Po osiągnięciu tego statusu Smart Matching generuje propozycję opakowania dla zamówienia. Gdy brak wybranego kartonu — miękko przypisuje rekomendację (ten sam model opakowania co wybór ręczny)."
          >
            {hasStatuses ? (
              <OrderUiStatusField
                panelSummary={panelSummary}
                panelSubgroups={panelSubgroups}
                selectedStatusId={config.proposalInitStatusId}
                allowClear
                clearLabel="— brak —"
                placeholder="Wybierz status…"
                onPick={(id) =>
                  patchConfig({
                    proposalInitStatusId: id,
                    proposalInitStatusIds: id != null && id > 0 ? [id] : [],
                  })
                }
              />
            ) : (
              <p className="text-sm text-slate-500">Brak statusów panelu.</p>
            )}
          </WmsControlSettingRow>

          <WmsBoolSettingRow
            settingId="smart.auto_label_enabled"
            label="Automatyczne generowanie etykiet"
            hint="Gdy włączone, w wybranych statusach system może automatycznie spróbować wygenerować list przewozowy — wyłącznie gdy zamówienie ma przypisane opakowanie (Smart Matching lub wybór ręczny)."
            checked={config.autoLabelAfterMatchEnabled}
            onChange={(autoLabelAfterMatchEnabled) => patchConfig({ autoLabelAfterMatchEnabled })}
          />

          {config.autoLabelAfterMatchEnabled ? (
            <WmsControlSettingRow
              settingId="smart.auto_label_statuses"
              label="Statusy automatycznego generowania etykiet"
              hint="Wiele statusów — w każdym z nich, przy obecnym opakowaniu, system może spróbować wygenerować list przewozowy. Bez opakowania generowanie jest pomijane."
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
      </SettingsSubsection>
    </div>
  );
}
