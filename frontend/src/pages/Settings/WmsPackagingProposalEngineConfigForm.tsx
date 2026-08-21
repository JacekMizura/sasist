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
  type PackagingStrategyApi,
  type SmartMatchingIdenticalThreshold,
  type WmsPackagingProposalLocalConfigV1,
} from "./wmsPackagingProposalLocalConfig";

const STRATEGY_OPTIONS: { value: PackagingStrategyApi; label: string; hint: string }[] = [
  {
    value: "SMART_ONLY",
    label: "Tylko Smart Matching",
    hint: "Tylko reguły Smart Matching. Bez automatycznego 3D.",
  },
  {
    value: "THREE_D_ONLY",
    label: "Tylko 3D Matching",
    hint: "Tylko dobór geometryczny 3D. Bez Smart Matching.",
  },
  {
    value: "SMART_THEN_3D",
    label: "Smart Matching → 3D Matching",
    hint: "Najpierw Smart; gdy brak jednoznacznej reguły — 3D.",
  },
  {
    value: "THREE_D_OVERRIDE_SMART",
    label: "3D Matching ma pierwszeństwo",
    hint: "Gdy 3D znajdzie poprawny fit, nadpisuje propozycję Smart.",
  },
];

type Props = {
  /** Smart Matching: pokaż próg uczenia z identycznych zamówień. */
  showSmartLearningThreshold: boolean;
  /** Smart Matching: toggle Smart engine. */
  showSmartEnable?: boolean;
  /** Shared strategy (single select) + Smart workflow triggers. */
  showSmartWorkflow?: boolean;
  /** @deprecated use showSmartWorkflow */
  showPackagingWorkflow?: boolean;
  config: WmsPackagingProposalLocalConfigV1;
  patchConfig: (patch: Partial<WmsPackagingProposalLocalConfigV1>) => void;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
  wiredToBackend?: boolean;
};

export function WmsPackagingProposalEngineConfigForm({
  showSmartLearningThreshold,
  showSmartEnable = true,
  showSmartWorkflow,
  showPackagingWorkflow = true,
  config,
  patchConfig,
  panelSummary,
  panelSubgroups,
  wiredToBackend = true,
}: Props) {
  const showWorkflow = showSmartWorkflow ?? showPackagingWorkflow;
  const hasStatuses =
    panelSummary != null && panelSummary.groups.some((g) => (g.sub_statuses?.length ?? 0) > 0);
  void wiredToBackend;
  const strategyMeta = STRATEGY_OPTIONS.find((o) => o.value === config.packagingStrategy);

  return (
    <div className="space-y-5">
      {showSmartEnable ? (
        <SettingsSubsection title="Smart Matching">
          <div className={wmsSettingsRowsStackClass}>
            <WmsBoolSettingRow
              settingId="smart.packaging_suggestions_enabled"
              label="Włącz Smart Matching"
              hint="Uczy się z historii pakowań i proponuje opakowanie dla powtarzalnych koszyków. Wyłączenie nie wyłącza 3D Matching."
              checked={config.smartEnabled}
              onChange={(smartEnabled) => patchConfig({ smartEnabled })}
            />
          </div>
        </SettingsSubsection>
      ) : null}

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

      {showWorkflow ? (
        <SettingsSubsection title="Workflow Smart Matching">
          <div className={wmsSettingsRowsStackClass}>
            <WmsControlSettingRow
              settingId="packaging.strategy"
              label="Strategia doboru opakowania"
              hint={
                (strategyMeta?.hint ??
                  "Wspólna kolejność Smart Matching i 3D Matching.") +
                " Strategia jest wspólna dla Smart Matching i 3D Matching."
              }
            >
              <select
                className={wmsSettingControlSelectClass}
                value={config.packagingStrategy}
                onChange={(e) =>
                  patchConfig({ packagingStrategy: e.target.value as PackagingStrategyApi })
                }
              >
                {STRATEGY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </WmsControlSettingRow>

            <WmsControlSettingRow
              settingId="smart.proposal_init_status"
              label="Status inicjujący Smart Matching"
              hint="Po wejściu zamówienia w ten status system uruchamia Smart Matching (zgodnie ze strategią). Gdy brak wybranego kartonu — miękko przypisuje rekomendację."
            >
              {hasStatuses ? (
                <OrderUiStatusField
                  panelSummary={panelSummary}
                  panelSubgroups={panelSubgroups}
                  selectedStatusId={config.smartProposalInitStatusId}
                  allowClear
                  clearLabel="— brak —"
                  placeholder="Wybierz status…"
                  onPick={(id) =>
                    patchConfig({
                      smartProposalInitStatusId: id,
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
              hint="W wybranych statusach system może automatycznie spróbować wygenerować list przewozowy — wyłącznie gdy zamówienie ma już przypisane opakowanie."
              checked={config.smartAutoLabelEnabled}
              onChange={(smartAutoLabelEnabled) =>
                patchConfig({
                  smartAutoLabelEnabled,
                  autoLabelAfterMatchEnabled: smartAutoLabelEnabled,
                })
              }
            />

            {config.smartAutoLabelEnabled ? (
              <WmsControlSettingRow
                settingId="smart.auto_label_statuses"
                label="Statusy automatycznego generowania etykiet"
                hint="Statusy, w których Smart Matching może wyzwolić auto-label (wymaga przypisanego opakowania)."
              >
                {hasStatuses ? (
                  <OrderUiStatusField
                    panelSummary={panelSummary}
                    panelSubgroups={panelSubgroups}
                    selectedStatusIds={config.smartAutoLabelStatusIds}
                    placeholder="Wybierz statusy…"
                    onSelectedIdsChange={(ids) =>
                      patchConfig({
                        smartAutoLabelStatusIds: [...ids].sort((a, b) => a - b),
                        autoLabelWorkflowStatusIds: [...ids].sort((a, b) => a - b),
                      })
                    }
                  />
                ) : (
                  <p className="text-sm text-slate-500">Brak statusów panelu.</p>
                )}
              </WmsControlSettingRow>
            ) : null}
          </div>
        </SettingsSubsection>
      ) : null}
    </div>
  );
}
