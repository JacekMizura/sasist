import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  getWmsSmartMatchingHistory,
  getWmsSmartMatchingRules,
  getWmsSmartMatchingSettings,
  postWmsSmartMatchingReset,
  putWmsSmartMatchingSettings,
  type WmsSmartMatchingBreakApi,
  type WmsSmartMatchingHistoryApi,
  type WmsSmartMatchingRuleApi,
} from "../../api/wmsSmartMatchingApi";
import { getOrderPanelSubgroups, getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import { WmsSettingsTabFrame } from "./WmsSettingsTabFrame";
import { WmsSettingsSection } from "./WmsSettingsSection";
import { WMS_SMART_MATCHING_NAV_SECTIONS } from "./wmsSmartMatchingSettingsNavSections";
import {
  DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG,
  configFromApi,
  configToApiBody,
  type WmsPackagingProposalLocalConfigV1,
} from "./wmsPackagingProposalLocalConfig";
import { WmsPackagingProposalEngineConfigForm } from "./WmsPackagingProposalEngineConfigForm";
import { ConfirmModal } from "../../components/ui/ConfirmModal";

function SectionCard({
  id,
  title,
  summary,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  children: ReactNode;
}) {
  const meta = WMS_SMART_MATCHING_NAV_SECTIONS.find((s) => s.id === id);
  return (
    <WmsSettingsSection
      id={id}
      title={title}
      summary={summary}
      icon={meta?.icon}
      iconClassName={meta?.iconClassName}
      searchText={meta?.searchText}
    >
      {children}
    </WmsSettingsSection>
  );
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL");
  } catch {
    return iso;
  }
}

function BreakTooltip({ br }: { br: WmsSmartMatchingBreakApi }) {
  return (
    <div className="space-y-1 text-left text-xs leading-relaxed text-slate-700">
      <p>
        <span className="font-semibold">Zamówienie:</span> {br.order_number || `#${br.order_id}`}
      </p>
      <p>
        <span className="font-semibold">Użytkownik:</span> {br.user_display || "—"}
      </p>
      <p>
        <span className="font-semibold">Ilość:</span>{" "}
        {br.quantity_units != null ? String(br.quantity_units) : "—"}
      </p>
      <p>
        <span className="font-semibold">Sugerowane:</span> {br.suggested_carton_id || "—"}
      </p>
      <p>
        <span className="font-semibold">Wybrane opakowanie:</span>{" "}
        {br.chosen_carton_name || br.chosen_carton_id || "—"}
      </p>
      <p>
        <span className="font-semibold">Data:</span> {formatWhen(br.created_at)}
      </p>
    </div>
  );
}

function InterruptedCell({
  hasBreak,
  latestBreak,
}: {
  hasBreak: boolean;
  latestBreak?: WmsSmartMatchingBreakApi | null;
}) {
  if (!hasBreak || !latestBreak) {
    return <span className="text-slate-400">–</span>;
  }
  return (
    <span className="group relative inline-flex cursor-help font-bold text-amber-600" title="Nadpisanie reguły">
      !
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg group-hover:block">
        <BreakTooltip br={latestBreak} />
      </span>
    </span>
  );
}

type Props = {
  warehouseId: number | null;
  sectionNavObserve?: boolean;
};

export function WmsSmartMatchingSettingsPanel({ warehouseId, sectionNavObserve = true }: Props) {
  const [panelSummary, setPanelSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [panelSubgroups, setPanelSubgroups] = useState<OrderUiPanelSubgroupRead[]>([]);
  const [statusLoadErr, setStatusLoadErr] = useState<string | null>(null);
  const [config, setConfig] = useState<WmsPackagingProposalLocalConfigV1>(DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<WmsSmartMatchingHistoryApi[]>([]);
  const [rules, setRules] = useState<WmsSmartMatchingRuleApi[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const reloadData = useCallback(async (wid: number) => {
    const [s, h, r] = await Promise.all([
      getWmsSmartMatchingSettings(DAMAGE_TENANT_ID, wid),
      getWmsSmartMatchingHistory(DAMAGE_TENANT_ID, wid),
      getWmsSmartMatchingRules(DAMAGE_TENANT_ID, wid),
    ]);
    setConfig(configFromApi(s));
    setHistory(h);
    setRules(r);
  }, []);

  const persistConfig = useCallback(
    async (next: WmsPackagingProposalLocalConfigV1) => {
      if (warehouseId == null) return;
      setSaveBusy(true);
      setSaveMsg(null);
      try {
        const saved = await putWmsSmartMatchingSettings(configToApiBody(next, DAMAGE_TENANT_ID, warehouseId));
        setConfig(configFromApi(saved));
        setSaveMsg("Zapisano.");
      } catch {
        setSaveMsg("Nie udało się zapisać ustawień.");
      } finally {
        setSaveBusy(false);
      }
    },
    [warehouseId],
  );

  const patchConfig = useCallback(
    (patch: Partial<WmsPackagingProposalLocalConfigV1>) => {
      setConfig((prev) => {
        const next = { ...prev, ...patch };
        void persistConfig(next);
        return next;
      });
    },
    [persistConfig],
  );

  useEffect(() => {
    if (warehouseId == null) {
      setHistory([]);
      setRules([]);
      return;
    }
    let cancel = false;
    setDataLoading(true);
    void (async () => {
      try {
        await reloadData(warehouseId);
      } catch {
        if (!cancel) setStatusLoadErr("Nie udało się wczytać Smart Matching.");
      } finally {
        if (!cancel) setDataLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [warehouseId, reloadData]);

  useEffect(() => {
    if (warehouseId == null) {
      setPanelSummary(null);
      setPanelSubgroups([]);
      setStatusLoadErr(null);
      return;
    }
    let cancel = false;
    void (async () => {
      try {
        const [summary, subgroups] = await Promise.all([
          getOrderUiStatusSummary(DAMAGE_TENANT_ID, warehouseId, { includeInactive: true }),
          getOrderPanelSubgroups(DAMAGE_TENANT_ID, warehouseId),
        ]);
        if (!cancel) {
          setPanelSummary(summary);
          setPanelSubgroups(subgroups);
        }
      } catch {
        if (!cancel) {
          setPanelSummary(null);
          setPanelSubgroups([]);
          setStatusLoadErr("Nie udało się wczytać statusów panelu.");
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [warehouseId]);

  const configRevision = useMemo(() => JSON.stringify(config), [config]);

  const confirmReset = async () => {
    if (warehouseId == null) return;
    setResetBusy(true);
    try {
      await postWmsSmartMatchingReset(DAMAGE_TENANT_ID, warehouseId);
      await reloadData(warehouseId);
      setResetOpen(false);
      setSaveMsg("Usunięto aktywne reguły dopasowania.");
    } catch {
      setSaveMsg("Usuwanie reguł nie powiodło się.");
    } finally {
      setResetBusy(false);
    }
  };

  if (warehouseId == null) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Wybierz magazyn w górnym pasku, aby konfigurować Smart Matching.
      </p>
    );
  }

  const th =
    "border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500";
  const td = "border-b border-slate-100 px-3 py-2 text-sm text-slate-800";

  return (
    <WmsSettingsTabFrame
      title="Smart Matching"
      description="Smart Matching tworzy rekomendacje opakowań na podstawie powtarzalnych decyzji pakowania dla identycznego składu zamówienia."
      sections={WMS_SMART_MATCHING_NAV_SECTIONS}
      asideLabel="Sekcje Smart Matching"
      observeSections={sectionNavObserve}
      observeRevision={dataLoading ? "loading" : `${configRevision}-${history.length}-${rules.length}`}
    >
      {statusLoadErr ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">{statusLoadErr}</p>
      ) : null}
      {saveMsg ? <p className="text-xs text-slate-500">{saveBusy ? "Zapisywanie…" : saveMsg}</p> : null}

      <SectionCard
        id="wms-smart-config"
        title="Ogólne"
        summary="Włączenie, próg reguł z historii pakowań, status inicjujący oraz auto-etykiety."
      >
        <WmsPackagingProposalEngineConfigForm
          showSmartLearningThreshold
          config={config}
          patchConfig={patchConfig}
          panelSummary={panelSummary}
          panelSubgroups={panelSubgroups}
          wiredToBackend
        />
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
            onClick={() => setResetOpen(true)}
          >
            Usuń aktywne reguły
          </button>
          <p className="max-w-md text-xs text-slate-500">
            Historia decyzji pozostanie i może ponownie utworzyć reguły po kolejnych pakowaniach.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        id="wms-smart-history"
        title="Historia doboru"
        summary="Historia decyzji pakowania używana do budowania reguł Smart Matching."
      >
        <div className="overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm">
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[880px] border-collapse">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className={th}>Zamówienie</th>
                  <th className={th}>Skład / fingerprint</th>
                  <th className={th}>Sugerowane</th>
                  <th className={th}>Wybrane</th>
                  <th className={th}>Operator</th>
                  <th className={th}>Data</th>
                  <th className={`${th} text-center`}>Nadpisanie</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={`${td} text-slate-500`}>
                      Brak historii — pojawi się po spakowaniu zamówień z wybranym opakowaniem.
                    </td>
                  </tr>
                ) : (
                  history.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50/80">
                      <td className={td}>{h.order_number || `#${h.order_id}`}</td>
                      <td className={`${td} max-w-[14rem]`}>
                        <div className="font-medium text-slate-900">{h.composition_label || "—"}</div>
                        <div className="truncate font-mono text-[10px] text-slate-400" title={h.composition_key}>
                          {h.composition_key.slice(0, 12)}…
                        </div>
                      </td>
                      <td className={td}>{h.suggested_carton_id || "—"}</td>
                      <td className={td}>{h.carton_name || h.carton_id || "—"}</td>
                      <td className={td}>{h.user_display || "—"}</td>
                      <td className={`${td} whitespace-nowrap`}>{formatWhen(h.created_at)}</td>
                      <td className={`${td} text-center`}>
                        <InterruptedCell hasBreak={h.broke_series} latestBreak={h.latest_break} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm">
          <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Aktywne reguły dopasowania
          </p>
          <div className="max-h-72 overflow-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className={th}>Zestawienie</th>
                  <th className={th}>Opakowanie</th>
                  <th className={`${th} text-right`}>Trafienia</th>
                  <th className={`${th} text-center`}>Nadpisanie</th>
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={`${td} text-slate-500`}>
                      Brak automatycznych reguł — pojawią się po osiągnięciu progu identycznych spakowań.
                    </td>
                  </tr>
                ) : (
                  rules.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className={`${td} max-w-[16rem]`}>{r.composition_label || "—"}</td>
                      <td className={td}>{r.carton_name || r.carton_id}</td>
                      <td className={`${td} text-right tabular-nums`}>{r.hit_count}</td>
                      <td className={`${td} text-center`}>
                        <InterruptedCell
                          hasBreak={r.has_interrupted_series}
                          latestBreak={r.latest_break}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </SectionCard>

      {resetOpen ? (
        <ConfirmModal
          title="Usunąć aktywne reguły?"
          message="Usunięte zostaną wyłącznie automatycznie utworzone powiązania. Historia decyzji pakowania pozostanie i może ponownie utworzyć reguły po kolejnych pakowaniach."
          confirmLabel="Usuń aktywne reguły"
          confirmTone="danger"
          onConfirm={() => void confirmReset()}
          onCancel={() => {
            if (!resetBusy) setResetOpen(false);
          }}
        />
      ) : null}
    </WmsSettingsTabFrame>
  );
}

export default WmsSmartMatchingSettingsPanel;
