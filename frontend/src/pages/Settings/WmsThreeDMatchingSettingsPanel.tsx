import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { getOrderPanelSubgroups, getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import {
  getWmsSmartMatchingSettings,
  putWmsSmartMatchingSettings,
} from "../../api/wmsSmartMatchingApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import { WmsSettingsTabFrame } from "./WmsSettingsTabFrame";
import { WmsSettingsSection } from "./WmsSettingsSection";
import { WMS_THREE_D_MATCHING_NAV_SECTIONS } from "./wmsThreeDMatchingSettingsNavSections";
import {
  DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG,
  configFromApi,
  configToApiBody,
  type WmsPackagingProposalLocalConfigV1,
} from "./wmsPackagingProposalLocalConfig";
import {
  WmsBoolSettingRow,
  WmsControlSettingRow,
  wmsSettingControlInputClass,
  wmsSettingsRowsStackClass,
} from "./wmsSettingsUi";
import { ThreeDMatchingHistoryTable } from "./ThreeDMatchingHistoryTable";

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
  const [config, setConfig] = useState<WmsPackagingProposalLocalConfigV1>(
    DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG,
  );
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [panelStatusErr, setPanelStatusErr] = useState<string | null>(null);

  const persistConfig = useCallback(
    async (next: WmsPackagingProposalLocalConfigV1) => {
      if (warehouseId == null) return;
      setSaveBusy(true);
      setSaveMsg(null);
      try {
        const saved = await putWmsSmartMatchingSettings(
          configToApiBody(next, DAMAGE_TENANT_ID, warehouseId),
        );
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
      setPanelStatusErr(null);
      return;
    }
    let cancel = false;
    setDataLoading(true);
    setSaveMsg(null);
    void (async () => {
      try {
        const sm = await getWmsSmartMatchingSettings(DAMAGE_TENANT_ID, warehouseId);
        if (!cancel) {
          setConfig(configFromApi(sm));
          setPanelStatusErr(null);
        }
      } catch {
        if (!cancel) setPanelStatusErr("Nie udało się wczytać ustawień 3D Matching.");
      } finally {
        if (!cancel) setDataLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [warehouseId]);

  // Prefetch panel statuses only to keep warehouse context warm (workflow lives in Smart).
  useEffect(() => {
    if (warehouseId == null) return;
    void Promise.all([
      getOrderUiStatusSummary(DAMAGE_TENANT_ID, warehouseId, { includeInactive: true }),
      getOrderPanelSubgroups(DAMAGE_TENANT_ID, warehouseId),
    ]).catch(() => undefined);
  }, [warehouseId]);

  const revision = useMemo(() => JSON.stringify(config), [config]);

  if (warehouseId == null) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Wybierz magazyn w górnym pasku, aby konfigurować 3D Matching.
      </p>
    );
  }

  return (
    <WmsSettingsTabFrame
      title="3D Matching"
      description="Automatyczny dobór opakowań na podstawie wymiarów i wagi produktów."
      sections={WMS_THREE_D_MATCHING_NAV_SECTIONS}
      asideLabel="Sekcje 3D Matching"
      observeSections={sectionNavObserve}
      observeRevision={dataLoading ? "loading" : revision}
    >
      {panelStatusErr ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
          {panelStatusErr}
        </p>
      ) : null}
      {saveMsg ? <p className="text-xs text-slate-500">{saveBusy ? "Zapisywanie…" : saveMsg}</p> : null}

      <SectionCard
        id="wms-3d-settings"
        title="Ustawienia"
        summary="Włączenie silnika 3D oraz rezerwa przestrzeni na wypełnienie. Strategia i statusy workflow są wspólne z Smart Matching."
      >
        <div className={wmsSettingsRowsStackClass}>
          <WmsBoolSettingRow
            settingId="three_d.enabled"
            label="Włącz 3D Matching"
            hint="Automatycznie dobieraj opakowanie na podstawie wymiarów i wagi produktów. Wyłączenie nie wyłącza Smart Matching."
            checked={config.threeDEnabled}
            onChange={(threeDEnabled) => patchConfig({ threeDEnabled })}
          />

          <WmsControlSettingRow
            settingId="three_d.filler_percent"
            label="Wypełnienie opakowania"
            hint="Część przestrzeni opakowania zarezerwowana na materiały wypełniające."
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={99}
                step={1}
                className={`${wmsSettingControlInputClass} w-24`}
                value={config.threeDFillerPercent}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  const clamped = Number.isFinite(n) ? Math.min(99, Math.max(0, Math.round(n))) : 0;
                  patchConfig({ threeDFillerPercent: clamped });
                }}
              />
              <span className="text-sm font-medium text-slate-600">%</span>
            </div>
          </WmsControlSettingRow>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Strategię doboru, status inicjujący oraz automatyczne etykiety skonfigurujesz w{" "}
          <span className="font-semibold text-slate-700">Smart Matching → Ogólne → Automatyczny dobór opakowania</span>
          .
        </p>
      </SectionCard>

      <SectionCard
        id="wms-3d-history"
        title="Historia doboru"
        summary="Audyt każdej realnej próby silnika 3D Matching (nie uczenie)."
      >
        <ThreeDMatchingHistoryTable tenantId={DAMAGE_TENANT_ID} warehouseId={warehouseId} />
      </SectionCard>
    </WmsSettingsTabFrame>
  );
}

export default WmsThreeDMatchingSettingsPanel;
