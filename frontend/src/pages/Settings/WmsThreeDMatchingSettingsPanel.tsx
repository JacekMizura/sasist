import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { getPackagingIntelligenceDashboard, type PackagingIntelligenceDashboardApi } from "../../api/packagingIntelligenceApi";
import { getOrderPanelSubgroups, getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import { WmsSettingsTabFrame } from "./WmsSettingsTabFrame";
import { WmsSettingsSection } from "./WmsSettingsSection";
import { WMS_THREE_D_MATCHING_NAV_SECTIONS } from "./wmsThreeDMatchingSettingsNavSections";
import {
  PackagingIntelligenceAuditPlaceholderTable,
  PackagingIntelligenceKpiCompact,
  PackagingIntelligenceKpiFull,
} from "./wmsPackagingIntelligenceKpiBlocks";
import {
  getWmsSmartMatchingSettings,
  putWmsSmartMatchingSettings,
} from "../../api/wmsSmartMatchingApi";
import {
  DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG,
  configFromApi,
  configToApiBody,
  type WmsPackagingProposalLocalConfigV1,
} from "./wmsPackagingProposalLocalConfig";
import { WmsPackagingProposalEngineConfigForm } from "./WmsPackagingProposalEngineConfigForm";
import {
  DEFAULT_WMS_THREE_D_ENGINE_LOCAL_CONFIG,
  loadWmsThreeDEngineLocalConfig,
  saveWmsThreeDEngineLocalConfig,
  type WmsThreeDEngineLocalConfigV1,
} from "./wmsThreeDEngineLocalConfig";
import { WmsThreeDEngineConfigForm } from "./WmsThreeDEngineConfigForm";

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
  return (
    <WmsSettingsSection id={id} title={title} summary={summary}>
      {children}
    </WmsSettingsSection>
  );
}

type Props = {
  warehouseId: number | null;
  sectionNavObserve?: boolean;
};

export function WmsThreeDMatchingSettingsPanel({ warehouseId, sectionNavObserve = true }: Props) {
  const [dashboard, setDashboard] = useState<PackagingIntelligenceDashboardApi | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [panelSummary, setPanelSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [panelSubgroups, setPanelSubgroups] = useState<OrderUiPanelSubgroupRead[]>([]);
  const [panelStatusErr, setPanelStatusErr] = useState<string | null>(null);
  const [flowConfig, setFlowConfig] = useState<WmsPackagingProposalLocalConfigV1>(DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG);
  const [engineConfig, setEngineConfig] = useState<WmsThreeDEngineLocalConfigV1>(DEFAULT_WMS_THREE_D_ENGINE_LOCAL_CONFIG);

  const patchFlowConfig = useCallback(
    (patch: Partial<WmsPackagingProposalLocalConfigV1>) => {
      if (warehouseId == null) return;
      setFlowConfig((prev) => {
        const next = { ...prev, ...patch };
        void putWmsSmartMatchingSettings(configToApiBody(next, DAMAGE_TENANT_ID, warehouseId)).then(
          (saved) => setFlowConfig(configFromApi(saved)),
          () => undefined,
        );
        return next;
      });
    },
    [warehouseId],
  );

  const patchEngineConfig = useCallback(
    (patch: Partial<WmsThreeDEngineLocalConfigV1>) => {
      if (warehouseId == null) return;
      setEngineConfig((prev) => {
        const next = { ...prev, ...patch };
        saveWmsThreeDEngineLocalConfig(warehouseId, next);
        return next;
      });
    },
    [warehouseId],
  );

  useEffect(() => {
    if (warehouseId == null) {
      setDashboard(null);
      return;
    }
    setEngineConfig(loadWmsThreeDEngineLocalConfig(warehouseId));
    let cancel = false;
    setDashLoading(true);
    void (async () => {
      try {
        const [d, sm] = await Promise.all([
          getPackagingIntelligenceDashboard(DAMAGE_TENANT_ID, warehouseId),
          getWmsSmartMatchingSettings(DAMAGE_TENANT_ID, warehouseId),
        ]);
        if (!cancel) {
          setDashboard(d);
          setFlowConfig(configFromApi(sm));
        }
      } catch {
        if (!cancel) setDashboard(null);
      } finally {
        if (!cancel) setDashLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [warehouseId]);

  useEffect(() => {
    if (warehouseId == null) {
      setPanelSummary(null);
      setPanelSubgroups([]);
      setPanelStatusErr(null);
      return;
    }
    let cancel = false;
    setPanelStatusErr(null);
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
          setPanelStatusErr("Nie udało się wczytać statusów panelu.");
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [warehouseId]);

  const flowRevision = useMemo(() => JSON.stringify(flowConfig), [flowConfig]);
  const engineRevision = useMemo(() => JSON.stringify(engineConfig), [engineConfig]);

  if (warehouseId == null) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Wybierz magazyn w górnym pasku, aby konfigurować 3D Matching.
      </p>
    );
  }

  return (
    <WmsSettingsTabFrame
      title="Dopasowanie przestrzenne"
      description="Silnik 3D, progi dopasowania i analityka opakowań."
      sections={WMS_THREE_D_MATCHING_NAV_SECTIONS}
      asideLabel="Sekcje dopasowania przestrzennego"
      observeSections={sectionNavObserve}
      observeRevision={dashLoading ? "loading" : `${flowRevision}-${engineRevision}`}
    >
      {panelStatusErr ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">{panelStatusErr}</p>
      ) : null}

      <SectionCard
        id="wms-3d-dashboard"
        title="1. Dashboard"
        summary="Aktywne reguły dopasowania i udział nadpisań (bez atrap pewności/wypełnienia)."
      >
        <PackagingIntelligenceKpiCompact dashboard={dashLoading ? null : dashboard} />
      </SectionCard>

      <SectionCard
        id="wms-3d-settings"
        title="2. Konfiguracja przepływu"
        summary="Wspólna z Smart Matching: włączenie propozycji, status inicjujący oraz auto-etykiety — bez progu uczenia."
      >
        <WmsPackagingProposalEngineConfigForm
          showSmartLearningThreshold={false}
          config={flowConfig}
          patchConfig={patchFlowConfig}
          panelSummary={panelSummary}
          panelSubgroups={panelSubgroups}
          wiredToBackend
        />
      </SectionCard>

      <SectionCard
        id="wms-3d-engine"
        title="3. Ustawienia 3D Matching"
        summary="Parametry geometrycznego silnika: tolerancje, strategia kartonu, obrót, pewność — to właściwe miejsce logiki 3D, nie tabele statusów."
      >
        <WmsThreeDEngineConfigForm config={engineConfig} patchConfig={patchEngineConfig} />
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Zapis lokalny w przeglądarce — docelowo synchronizacja z API konfiguracji magazynu i silnika 3D.
        </p>
      </SectionCard>

      <SectionCard
        id="wms-3d-history"
        title="4. Historia dopasowań"
        summary="Audyt zdarzeń THREE_D_MATCHING (nie jest to dane treningowe — wyłącznie rejestr operacyjny)."
      >
        <PackagingIntelligenceAuditPlaceholderTable moduleLabel="3D Matching" colSource="Silnik / tolerancja" />
      </SectionCard>

      <SectionCard
        id="wms-3d-errors-dimensions"
        title="5. Błędy i brakujące wymiary"
        summary="Agregaty jakości danych wymiarowych — dopiero gdy backend będzie je liczył realnie."
      >
        <p className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-4 text-sm text-slate-500">
          Liczniki „SKU bez wymiarów” i „nieudane propozycje” nie są jeszcze wyliczane przez API — sekcja bez atrap.
        </p>
      </SectionCard>

      <SectionCard id="wms-3d-analytics" title="6. Analityka" summary="Aktywne reguły dopasowania, nadpisania i ranking kartonów z historii.">
        <PackagingIntelligenceKpiFull dashboard={dashLoading ? null : dashboard} />
      </SectionCard>
    </WmsSettingsTabFrame>
  );
}

export default WmsThreeDMatchingSettingsPanel;
