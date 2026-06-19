import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { getOfficeReturnModuleConfig, putOfficeReturnModuleConfig } from "../../api/returnModuleConfigApi";
import type { ReturnModuleConfigDto } from "../../types/returnModuleConfig";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { ReturnDetailLayoutEditor } from "./ReturnDetailLayoutEditor";
import { OpsSection } from "./returnsSettingsOps";
import { ReturnsDictionariesConfigurator } from "./returnsDictionariesConfigurator/ReturnsDictionariesConfigurator";
import { ReturnsStatusesConfigurator } from "./returnsStatusesConfigurator/ReturnsStatusesConfigurator";

export type ReturnsModuleSettingsTabId = "statusy" | "slowniki" | "konfigurator";

type Props = { warehouseId: number | null; activeTab: ReturnsModuleSettingsTabId };

export default function ReturnsModuleSettingsPanel({ warehouseId, activeTab }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReturnModuleConfigDto | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState("");

  const whOpt =
    warehouseId != null && Number.isFinite(warehouseId) && warehouseId > 0 ? Math.floor(warehouseId) : undefined;

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const cfg = await getOfficeReturnModuleConfig({ tenantId: DAMAGE_TENANT_ID, warehouseId: whOpt });
      setDraft(cfg);
      setSavedFingerprint(JSON.stringify(cfg));
    } catch {
      setDraft(null);
      setLoadErr("Nie udało się wczytać konfiguracji zwrotów.");
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

  const persistConfig = useCallback(
    async (next: ReturnModuleConfigDto): Promise<boolean> => {
      setSaving(true);
      try {
        const saved = await putOfficeReturnModuleConfig(next, { tenantId: DAMAGE_TENANT_ID, warehouseId: whOpt });
        setDraft(saved);
        setSavedFingerprint(JSON.stringify(saved));
        return true;
      } catch {
        toast.error("Nie udało się zapisać konfiguracji.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [whOpt],
  );

  const saveCfg = async () => {
    if (!draft || !dirty || saving) return;
    const ok = await persistConfig(draft);
    if (ok) toast.success("Zapisano konfigurację modułu zwrotów.");
  };

  const saveStrip =
    activeTab === "slowniki" ? (
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2.5">
        <p className="text-sm text-slate-600">
          {saving ? "Zapisywanie…" : "Zmiany w słownikach zapisują się automatycznie."}
        </p>
      </div>
    ) : (
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
        <ReturnsStatusesConfigurator warehouseId={warehouseId} cfg={cfg} setDraft={setDraft} />
      ) : null}

      {activeTab === "slowniki" && cfg ? (
        <ReturnsDictionariesConfigurator cfg={cfg} saving={saving} onPersist={persistConfig} />
      ) : null}

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
