import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { getPackagingIntelligenceDashboard, type PackagingIntelligenceDashboardApi } from "../../api/packagingIntelligenceApi";
import { getOrderPanelSubgroups, getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import { WmsSettingsTabFrame } from "./WmsSettingsTabFrame";
import { WmsSettingsSection } from "./WmsSettingsSection";
import { WMS_SMART_MATCHING_NAV_SECTIONS } from "./wmsSmartMatchingSettingsNavSections";
import {
  PackagingIntelligenceAuditPlaceholderTable,
  PackagingIntelligenceKpiCompact,
  PackagingIntelligenceKpiFull,
} from "./wmsPackagingIntelligenceKpiBlocks";
import {
  DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG,
  loadWmsPackagingProposalLocalConfig,
  saveWmsPackagingProposalLocalConfig,
  type WmsPackagingProposalLocalConfigV1,
} from "./wmsPackagingProposalLocalConfig";
import { WmsPackagingProposalEngineConfigForm } from "./WmsPackagingProposalEngineConfigForm";
import { wmsSettingsTokens } from "./wmsSettingsTokens";

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

function Help({ children }: { children: ReactNode }) {
  return <p className={wmsSettingsTokens.help}>{children}</p>;
}

type Props = {
  warehouseId: number | null;
  sectionNavObserve?: boolean;
};

export function WmsSmartMatchingSettingsPanel({ warehouseId, sectionNavObserve = true }: Props) {
  const [dashboard, setDashboard] = useState<PackagingIntelligenceDashboardApi | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [panelSummary, setPanelSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [panelSubgroups, setPanelSubgroups] = useState<OrderUiPanelSubgroupRead[]>([]);
  const [statusLoadErr, setStatusLoadErr] = useState<string | null>(null);
  const [config, setConfig] = useState<WmsPackagingProposalLocalConfigV1>(DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG);

  const patchConfig = useCallback(
    (patch: Partial<WmsPackagingProposalLocalConfigV1>) => {
      if (warehouseId == null) return;
      setConfig((prev) => {
        const next = { ...prev, ...patch };
        saveWmsPackagingProposalLocalConfig(warehouseId, next);
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
    setConfig(loadWmsPackagingProposalLocalConfig(warehouseId));
    let cancel = false;
    setDashLoading(true);
    void (async () => {
      try {
        const d = await getPackagingIntelligenceDashboard(DAMAGE_TENANT_ID, warehouseId);
        if (!cancel) setDashboard(d);
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
      setStatusLoadErr(null);
      return;
    }
    let cancel = false;
    setStatusLoadErr(null);
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
      description="Uczenie na powtarzalnych decyzjach pakowania dla identycznego składu zamówienia."
      sections={WMS_SMART_MATCHING_NAV_SECTIONS}
      asideLabel="Sekcje Smart Matching"
      observeSections={sectionNavObserve}
      observeRevision={dashLoading ? "loading" : `${dashboard?.suggestions_total ?? 0}-${configRevision}`}
    >
      {statusLoadErr ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">{statusLoadErr}</p>
      ) : null}

      <SectionCard
        id="wms-smart-dashboard"
        title="Widok"
        summary="Operacyjne metryki — uzupełniane z audytu propozycji po stronie backendu."
      >
        <PackagingIntelligenceKpiCompact dashboard={dashLoading ? null : dashboard} />
        <Help>Skuteczność Smart Matching ocenia się po historii dopasowań i nadpisaniach operatorów — nie po statusach zamówienia.</Help>
      </SectionCard>

      <SectionCard
        id="wms-smart-config"
        title="Ogólne"
        summary="Próg uczenia (Smart), wspólne statusy inicjujące propozycję oraz auto-etykiety po dopasowaniu."
      >
        <WmsPackagingProposalEngineConfigForm
          showSmartLearningThreshold
          config={config}
          patchConfig={patchConfig}
          panelSummary={panelSummary}
          panelSubgroups={panelSubgroups}
        />

        <div className="mt-6 rounded-lg border border-blue-200/70 bg-blue-50/40 px-3 py-3 text-xs leading-relaxed text-slate-800">
          <p className="font-semibold text-slate-900">Jak działa uczenie (skrót)</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-slate-700">
            <li>Operator pakuje zamówienie i wybiera karton — zapis decyzji w historii realizacji.</li>
            <li>
              Gdy to samo zestawienie produktów × ilości zostanie spakowane co najmniej{" "}
              <strong className="font-medium text-slate-900">{config.identicalOrdersThreshold}</strong> razy, powstaje reguła
              asocjacji (Smart Matching).
            </li>
            <li>Silnik 3D nadal opiera się na wymiarach, kartonach i pulach przewoźnika — równolegle, zgodnie z konfiguracją magazynu.</li>
          </ul>
          <p className="mt-2 text-slate-600">
            Ustawienia zapisują się lokalnie w przeglądarce — docelowo należy zsynchronizować z API konfiguracji magazynu.
          </p>
        </div>
      </SectionCard>

      <SectionCard id="wms-smart-history" title="Integracje" summary="Audyt propozycji i decyzji operatorów.">
        <PackagingIntelligenceAuditPlaceholderTable moduleLabel="Smart Matching" colSource="Silnik / zestawienie" />
      </SectionCard>

      <SectionCard id="wms-smart-analytics" title="Zaawansowane" summary="Pełny zestaw metryk i ranking kartonów.">
        <PackagingIntelligenceKpiFull dashboard={dashLoading ? null : dashboard} />
      </SectionCard>
    </WmsSettingsTabFrame>
  );
}

export default WmsSmartMatchingSettingsPanel;
