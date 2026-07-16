import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { getPackagingIntelligenceDashboard, type PackagingIntelligenceDashboardApi } from "../../api/packagingIntelligenceApi";
import { listOrderStatuses } from "../../api/orderStatusesApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import type { OrderStatusOption } from "../../types/wmsPackingSettings";
import { orderPanelStatusSelectLabel } from "../../utils/orderPanelStatusUi";
import { WmsSettingsLayout } from "./WmsSettingsLayout";
import { WmsSettingsSection } from "./WmsSettingsSection";
import { WMS_THREE_D_MATCHING_NAV_SECTIONS } from "./wmsThreeDMatchingSettingsNavSections";
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
  const [panelStatusOptions, setPanelStatusOptions] = useState<OrderStatusOption[]>([]);
  const [panelStatusErr, setPanelStatusErr] = useState<string | null>(null);
  const [flowConfig, setFlowConfig] = useState<WmsPackagingProposalLocalConfigV1>(DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG);
  const [engineConfig, setEngineConfig] = useState<WmsThreeDEngineLocalConfigV1>(DEFAULT_WMS_THREE_D_ENGINE_LOCAL_CONFIG);

  const patchFlowConfig = useCallback(
    (patch: Partial<WmsPackagingProposalLocalConfigV1>) => {
      if (warehouseId == null) return;
      setFlowConfig((prev) => {
        const next = { ...prev, ...patch };
        saveWmsPackagingProposalLocalConfig(warehouseId, next);
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
    setFlowConfig(loadWmsPackagingProposalLocalConfig(warehouseId));
    setEngineConfig(loadWmsThreeDEngineLocalConfig(warehouseId));
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
      setPanelStatusOptions([]);
      setPanelStatusErr(null);
      return;
    }
    let cancel = false;
    setPanelStatusErr(null);
    void (async () => {
      try {
        const items = await listOrderStatuses(DAMAGE_TENANT_ID, warehouseId);
        if (!cancel) setPanelStatusOptions(Array.isArray(items) ? items : []);
      } catch {
        if (!cancel) {
          setPanelStatusOptions([]);
          setPanelStatusErr("Nie udało się wczytać statusów panelu.");
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [warehouseId]);

  const sortedPanelStatuses = useMemo(() => {
    return [...panelStatusOptions].sort((a, b) =>
      orderPanelStatusSelectLabel(a).localeCompare(orderPanelStatusSelectLabel(b), "pl", { sensitivity: "base" }),
    );
  }, [panelStatusOptions]);

  const flowRevision = useMemo(() => JSON.stringify(flowConfig), [flowConfig]);
  const engineRevision = useMemo(() => JSON.stringify(engineConfig), [engineConfig]);

  if (warehouseId == null) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Wybierz magazyn w górnym pasku, aby konfigurować 3D Matching.
      </p>
    );
  }

  const missingDim = dashboard?.products_missing_dimensions ?? null;
  const failed = dashboard?.failed_suggestions ?? null;

  return (
    <WmsSettingsLayout
      sections={WMS_THREE_D_MATCHING_NAV_SECTIONS}
      asideLabel="Sekcje 3D Matching"
      observeSections={sectionNavObserve}
      observeRevision={
        dashLoading ? "loading" : `${dashboard?.products_missing_dimensions ?? 0}-${flowRevision}-${engineRevision}`
      }
      mainClassName="space-y-5"
    >
      <header className="border-b border-slate-200 pb-3">
        <h2 className="text-base font-semibold text-slate-900">3D Matching</h2>
        <p className="mt-1 text-xs text-slate-500">
          <span className="font-medium text-slate-700">Silnik geometryczny</span> — dopasowanie kartonu z wymiarów produktów, definicji
          kartonów i reguł przewoźnika. <strong className="font-medium text-slate-700">Nie uczy się z historii</strong> i nie „trenuje” po
          statusach: statusy panelu są wyłącznie <strong className="font-medium text-slate-700">triggerami workflow</strong> (kiedy
          uruchomić obliczenia i etykiety), tak jak w Smart Matching. Parametry tolerancji i strategii ustawiasz poniżej w sekcji{" "}
          <span className="font-medium text-slate-700">Ustawienia 3D Matching</span>.
        </p>
      </header>

      {panelStatusErr ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">{panelStatusErr}</p>
      ) : null}

      <SectionCard
        id="wms-3d-dashboard"
        title="1. Dashboard"
        summary="Metryki dopasowań 3D i jakość danych wymiarowych."
      >
        <PackagingIntelligenceKpiCompact dashboard={dashLoading ? null : dashboard} />
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-amber-200/90 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-950">
            <span className="font-semibold">SKU bez wymiarów (agregat): </span>
            {missingDim != null ? missingDim : dashLoading ? "…" : "—"}
          </div>
          <div className="rounded-lg border border-red-200/80 bg-red-50/60 px-3 py-2.5 text-sm text-red-950">
            <span className="font-semibold">Nieudane propozycje: </span>
            {failed != null ? failed : dashLoading ? "…" : "—"}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        id="wms-3d-settings"
        title="2. Konfiguracja przepływu"
        summary="Wspólna z Smart Matching: włączenie propozycji, wiele statusów inicjujących obliczenia, auto-etykiety — bez progu uczenia i bez „tabel uczących się po statusach”."
      >
        <p className="mb-4 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs leading-relaxed text-slate-700">
          Zmiany tutaj zapisują się w tym samym miejscu co zakładka Smart Matching. Statusy określają{" "}
          <span className="font-medium text-slate-800">kiedy</span> uruchomić silniki propozycji, a nie jak mają się uczyć.
        </p>
        <WmsPackagingProposalEngineConfigForm
          showSmartLearningThreshold={false}
          config={flowConfig}
          patchConfig={patchFlowConfig}
          sortedStatuses={sortedPanelStatuses}
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
        summary="Jakość danych wymiarowych wpływająca na poprawność obliczeń."
      >
        <div className="overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Typ
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Liczba
                </th>
                <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Działanie
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="hover:bg-slate-50/80">
                <td className="border-b border-slate-100 px-3 py-2 font-medium text-slate-800">Nieudane dopasowania 3D</td>
                <td className="border-b border-slate-100 px-3 py-2 text-right tabular-nums text-slate-900">
                  {failed != null ? failed : dashLoading ? "…" : "—"}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-slate-600">Lista szczegółów — API</td>
              </tr>
              <tr className="hover:bg-slate-50/80">
                <td className="border-b border-slate-100 px-3 py-2 font-medium text-slate-800">Produkty bez kompletu wymiarów</td>
                <td className="border-b border-slate-100 px-3 py-2 text-right tabular-nums text-slate-900">
                  {missingDim != null ? missingDim : dashLoading ? "…" : "—"}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-slate-600">Eksport SKU — API</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard id="wms-3d-analytics" title="6. Analityka" summary="Pełne metryki i rankingi.">
        <PackagingIntelligenceKpiFull dashboard={dashLoading ? null : dashboard} />
      </SectionCard>
    </WmsSettingsLayout>
  );
}

export default WmsThreeDMatchingSettingsPanel;
