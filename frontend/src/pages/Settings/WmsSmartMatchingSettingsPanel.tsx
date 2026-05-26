import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { getPackagingIntelligenceDashboard, type PackagingIntelligenceDashboardApi } from "../../api/packagingIntelligenceApi";
import { listOrderStatuses } from "../../api/orderStatusesApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import type { OrderStatusOption } from "../../types/wmsPackingSettings";
import { orderPanelStatusSelectLabel } from "../../utils/orderPanelStatusUi";
import { WmsSettingsLayout } from "./WmsSettingsLayout";
import { WMS_SETTINGS_SECTION_ANCHOR_CLASS } from "./wmsSettingsSectionConstants";
import { useWmsSettingsSectionAnchor } from "./WmsSettingsSectionRegistryContext";
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
  const anchorRef = useWmsSettingsSectionAnchor(id);
  return (
    <section ref={anchorRef} id={id} data-wms-section="" className={WMS_SETTINGS_SECTION_ANCHOR_CLASS}>
      <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {summary ? <p className="mt-0.5 text-xs text-slate-500">{summary}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

function Help({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs leading-relaxed text-slate-500">{children}</p>;
}

type Props = {
  warehouseId: number | null;
  sectionNavObserve?: boolean;
};

export function WmsSmartMatchingSettingsPanel({ warehouseId, sectionNavObserve = true }: Props) {
  const [dashboard, setDashboard] = useState<PackagingIntelligenceDashboardApi | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [statusOptions, setStatusOptions] = useState<OrderStatusOption[]>([]);
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
      setStatusOptions([]);
      setStatusLoadErr(null);
      return;
    }
    let cancel = false;
    setStatusLoadErr(null);
    void (async () => {
      try {
        const items = await listOrderStatuses(DAMAGE_TENANT_ID, warehouseId);
        if (!cancel) setStatusOptions(Array.isArray(items) ? items : []);
      } catch {
        if (!cancel) {
          setStatusOptions([]);
          setStatusLoadErr("Nie udało się wczytać statusów panelu.");
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [warehouseId]);

  const sortedStatuses = useMemo(() => {
    return [...statusOptions].sort((a, b) =>
      orderPanelStatusSelectLabel(a).localeCompare(orderPanelStatusSelectLabel(b), "pl", { sensitivity: "base" }),
    );
  }, [statusOptions]);

  const configRevision = useMemo(() => JSON.stringify(config), [config]);

  if (warehouseId == null) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Wybierz magazyn w górnym pasku, aby konfigurować Smart Matching.
      </p>
    );
  }

  return (
    <WmsSettingsLayout
      sections={WMS_SMART_MATCHING_NAV_SECTIONS}
      asideLabel="Sekcje Smart Matching"
      observeSections={sectionNavObserve}
      observeRevision={dashLoading ? "loading" : `${dashboard?.suggestions_total ?? 0}-${configRevision}`}
      mainClassName="space-y-5"
    >
      <header className="border-b border-slate-200 pb-3">
        <h2 className="text-base font-semibold text-slate-900">Smart Matching</h2>
        <p className="mt-1 text-xs text-slate-500">
          Uczenie wynika z <span className="font-medium text-slate-700">powtarzalnych decyzji pakowania</span> dla{" "}
          <span className="font-medium text-slate-700">identycznego składu zamówienia</span> (te same produkty i ilości) — nie z list
          statusów jako danych treningowych. Statusy służą jako <span className="font-medium text-slate-700">triggery workflow</span>{" "}
          (w tym wiele statusów inicjujących propozycję). Silnik 3D pozostaje osobnym modułem geometrycznym, ale współdzieli te same
          przełączniki przepływu.
        </p>
      </header>

      {statusLoadErr ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">{statusLoadErr}</p>
      ) : null}

      <SectionCard
        id="wms-smart-dashboard"
        title="1. Dashboard"
        summary="Operacyjne metryki — uzupełniane z audytu propozycji po stronie backendu."
      >
        <PackagingIntelligenceKpiCompact dashboard={dashLoading ? null : dashboard} />
        <Help>Skuteczność Smart Matching ocenia się po historii dopasowań i nadpisaniach operatorów — nie po statusach zamówienia.</Help>
      </SectionCard>

      <SectionCard
        id="wms-smart-config"
        title="2. Konfiguracja Smart Matching"
        summary="Próg uczenia (Smart), wspólne statusy inicjujące propozycję oraz auto-etykiety po dopasowaniu."
      >
        <WmsPackagingProposalEngineConfigForm
          showSmartLearningThreshold
          config={config}
          patchConfig={patchConfig}
          sortedStatuses={sortedStatuses}
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

      <SectionCard id="wms-smart-history" title="3. Historia dopasowań" summary="Audyt propozycji i decyzji operatorów.">
        <PackagingIntelligenceAuditPlaceholderTable moduleLabel="Smart Matching" colSource="Silnik / zestawienie" />
      </SectionCard>

      <SectionCard id="wms-smart-analytics" title="4. Analityka" summary="Pełny zestaw metryk i ranking kartonów.">
        <PackagingIntelligenceKpiFull dashboard={dashLoading ? null : dashboard} />
      </SectionCard>
    </WmsSettingsLayout>
  );
}

export default WmsSmartMatchingSettingsPanel;
