import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  getWmsSmartMatchingSettings,
  postWmsSmartMatchingReset,
  putWmsSmartMatchingSettings,
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
import { SmartMatchingHistoryEventsTable } from "./SmartMatchingHistoryEventsTable";

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
  const [historyKey, setHistoryKey] = useState(0);
  const [dataLoading, setDataLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const reloadSettings = useCallback(async (wid: number) => {
    const s = await getWmsSmartMatchingSettings(DAMAGE_TENANT_ID, wid);
    setConfig(configFromApi(s));
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
    let cancel = false;
    void (async () => {
      try {
        const [sum, subs] = await Promise.all([
          getOrderUiStatusSummary(DAMAGE_TENANT_ID, warehouseId ?? undefined),
          getOrderPanelSubgroups(DAMAGE_TENANT_ID, warehouseId ?? undefined),
        ]);
        if (!cancel) {
          setPanelSummary(sum);
          setPanelSubgroups(subs);
          setStatusLoadErr(null);
        }
      } catch {
        if (!cancel) setStatusLoadErr("Nie udało się wczytać statusów zamówień.");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [warehouseId]);

  useEffect(() => {
    if (warehouseId == null) return;
    let cancel = false;
    setDataLoading(true);
    void (async () => {
      try {
        await reloadSettings(warehouseId);
      } catch {
        if (!cancel) setSaveMsg("Nie udało się wczytać Smart Matching.");
      } finally {
        if (!cancel) setDataLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [warehouseId, reloadSettings]);

  const configRevision = useMemo(() => JSON.stringify(config), [config]);

  const confirmReset = async () => {
    if (warehouseId == null) return;
    setResetBusy(true);
    try {
      await postWmsSmartMatchingReset(DAMAGE_TENANT_ID, warehouseId);
      setHistoryKey((k) => k + 1);
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

  return (
    <WmsSettingsTabFrame
      title="Smart Matching"
      description="Smart Matching tworzy rekomendacje opakowań na podstawie powtarzalnych decyzji pakowania dla identycznego składu zamówienia."
      sections={WMS_SMART_MATCHING_NAV_SECTIONS}
      asideLabel="Sekcje Smart Matching"
      observeSections={sectionNavObserve}
      observeRevision={dataLoading ? "loading" : `${configRevision}-${historyKey}`}
    >
      {statusLoadErr ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">{statusLoadErr}</p>
      ) : null}
      {saveMsg ? <p className="text-xs text-slate-500">{saveBusy ? "Zapisywanie…" : saveMsg}</p> : null}

      <SectionCard
        id="wms-smart-config"
        title="Ogólne"
        summary="Włączenie Smart Matching, próg uczenia oraz wspólny automatyczny dobór opakowania (strategia, status, etykiety)."
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
        summary="Decyzje pakowania (v2): produkt, ilość, opakowanie, nadpisania oraz utworzenie / przerwanie reguły — kliknij wiersz, aby zobaczyć serię uczenia."
      >
        <SmartMatchingHistoryEventsTable
          key={historyKey}
          tenantId={DAMAGE_TENANT_ID}
          warehouseId={warehouseId}
        />
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
