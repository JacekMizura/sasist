import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { getOfficeReturnModuleConfig, putOfficeReturnModuleConfig } from "../../api/returnModuleConfigApi";
import { getReturnUiStatusSummary } from "../../api/returnUiStatusApi";
import type { ReturnUiStatusPanelSummary } from "../../types/wmsReturn";
import type { ReturnModuleConfigDto } from "../../types/returnModuleConfig";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { ReturnDetailLayoutEditor } from "./ReturnDetailLayoutEditor";
import {
  CustomerReturnTypesEditor,
  DamageClassesEditor,
  DamageReasonsEditor,
  OpsSection,
  OrderSourcesEditor,
  ProductDecisionsEditor,
  ReturnsPanelStatusesOverview,
} from "./returnsSettingsOps";

export type ReturnsModuleSettingsTabId = "statusy" | "rodzaje" | "zrodla" | "konfigurator";

function countPanelStatuses(summary: ReturnUiStatusPanelSummary | null): number {
  if (!summary?.groups?.length) return 0;
  let n = 0;
  for (const g of summary.groups) n += g.sub_statuses?.length ?? 0;
  return n;
}

type Props = { warehouseId: number | null; activeTab: ReturnsModuleSettingsTabId };

export default function ReturnsModuleSettingsPanel({ warehouseId, activeTab }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReturnModuleConfigDto | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [panelSnap, setPanelSnap] = useState<ReturnUiStatusPanelSummary | null>(null);

  const whOpt =
    warehouseId != null && Number.isFinite(warehouseId) && warehouseId > 0 ? Math.floor(warehouseId) : undefined;

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const [cfg, panel] = await Promise.all([
        getOfficeReturnModuleConfig({ tenantId: DAMAGE_TENANT_ID, warehouseId: whOpt }),
        getReturnUiStatusSummary(DAMAGE_TENANT_ID, whOpt ?? undefined),
      ]);
      setDraft(cfg);
      setSavedFingerprint(JSON.stringify(cfg));
      setPanelSnap(panel);
    } catch {
      setDraft(null);
      setLoadErr("Nie udało się wczytać konfiguracji zwrotów.");
      setPanelSnap(null);
    } finally {
      setLoading(false);
    }
  }, [whOpt]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const dirty = useMemo(() => {
    if (!draft) return false;
    return JSON.stringify(draft) !== savedFingerprint;
  }, [draft, savedFingerprint]);

  const saveCfg = async () => {
    if (!draft || !dirty || saving) return;
    setSaving(true);
    try {
      const saved = await putOfficeReturnModuleConfig(draft, { tenantId: DAMAGE_TENANT_ID, warehouseId: whOpt });
      setDraft(saved);
      setSavedFingerprint(JSON.stringify(saved));
      toast.success("Zapisano konfigurację modułu zwrotów.");
    } catch {
      toast.error("Nie udało się zapisać konfiguracji.");
    } finally {
      setSaving(false);
    }
  };

  const saveStrip = (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2.5">
      <p className="text-sm text-slate-600">
        {dirty ? "Masz niezapisane zmiany." : "Zsynchronizowano z serwerem."}
      </p>
      <button
        type="button"
        disabled={!dirty || saving || loading || draft == null}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
        onClick={() => void saveCfg()}
      >
        {saving ? "Zapisywanie…" : "Zapisz konfigurację zwrotów"}
      </button>
    </div>
  );

  const cfg = draft;

  return (
    <div className="space-y-4">
      {cfg == null && loading ? (
        <p className="py-10 text-center text-sm text-slate-600">Wczytywanie konfiguracji…</p>
      ) : null}
      {cfg == null && !loading && loadErr ? (
        <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <p>{loadErr}</p>
          <button
            type="button"
            className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-semibold hover:bg-rose-100"
            onClick={() => void loadAll()}
          >
            Spróbuj ponownie
          </button>
        </div>
      ) : null}

      {activeTab === "statusy" && cfg ? (
        <div className="space-y-4">
          <ReturnsPanelStatusesOverview panelSnap={panelSnap} count={countPanelStatuses(panelSnap)} />
          <ProductDecisionsEditor cfg={cfg} setDraft={setDraft} />
          <DamageClassesEditor cfg={cfg} setDraft={setDraft} />
          <DamageReasonsEditor cfg={cfg} setDraft={setDraft} />
        </div>
      ) : null}

      {activeTab === "rodzaje" && cfg ? <CustomerReturnTypesEditor cfg={cfg} setDraft={setDraft} /> : null}

      {activeTab === "zrodla" && cfg ? <OrderSourcesEditor cfg={cfg} setDraft={setDraft} /> : null}

      {activeTab === "konfigurator" && cfg ? (
        <OpsSection
          title="Układ strony szczegółów zwrotu"
          description="Ułóż bloki dokładnie tak, jak operator ma je zobaczyć po wejściu w zwrot — przeciąganie od razu na podglądzie dwóch kolumn."
        >
          <ReturnDetailLayoutEditor
            layout={cfg.detail_layout}
            onChange={(next) => setDraft({ ...cfg, detail_layout: next })}
          />
        </OpsSection>
      ) : null}

      {saveStrip}
    </div>
  );
}
