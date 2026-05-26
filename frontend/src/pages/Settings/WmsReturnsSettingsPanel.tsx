import { useCallback, useEffect, useState, type ReactNode } from "react";
import toast from "react-hot-toast";

import { getWmsReturnsModeSettings, setWmsReturnsModeSettings } from "../../api/wmsReturnsApi";
import type { ReturnsMode } from "../../types/wmsReturn";
import { WmsSettingsLayout } from "./WmsSettingsLayout";
import { WMS_SETTINGS_SECTION_ANCHOR_CLASS } from "./wmsSettingsSectionConstants";
import { useWmsSettingsSectionAnchor } from "./WmsSettingsSectionRegistryContext";

const SECTION_ID = "wms-returns-workflow-mode";

const RETURNS_MODE_OPTIONS: Array<{ value: ReturnsMode; label: string }> = [
  { value: "simple", label: "Prosty — decyzja tylko na poziomie RMZ" },
  { value: "two_step", label: "Dwuetapowy — magazyn decyduje, biuro wykonuje zwrot" },
  { value: "advanced", label: "Zaawansowany — decyzje, uszkodzenia, dowody i refundacje" },
];

const radioOuter =
  "flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-slate-300 hover:bg-slate-50/80 has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50/40";
const radioInput = "mt-1 h-4 w-4 shrink-0 border-slate-300 text-blue-600 focus:ring-blue-500";

function ReturnsModeSectionCard({ children }: { children: ReactNode }) {
  const anchorRef = useWmsSettingsSectionAnchor(SECTION_ID);
  return (
    <section ref={anchorRef} id={SECTION_ID} data-wms-section="" className={WMS_SETTINGS_SECTION_ANCHOR_CLASS}>
      <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">{children}</div>
    </section>
  );
}

type Props = {
  /** Z nagłówka aplikacji — jeśli brak, backend dobiera magazyn domyślny. */
  warehouseId: number | null;
};

export default function WmsReturnsSettingsPanel({ warehouseId }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMode, setSavedMode] = useState<ReturnsMode>("simple");
  const [draftMode, setDraftMode] = useState<ReturnsMode>("simple");
  const [resolvedTenantLabel, setResolvedTenantLabel] = useState<string | null>(null);
  const [resolvedWarehouseLabel, setResolvedWarehouseLabel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const s = await getWmsReturnsModeSettings({
        warehouseId: warehouseId != null && warehouseId > 0 ? warehouseId : undefined,
      });
      const m = s.returns_mode;
      const mode: ReturnsMode = m === "two_step" || m === "advanced" ? m : "simple";
      setSavedMode(mode);
      setDraftMode(mode);
      setResolvedTenantLabel(String(s.tenant_id));
      setResolvedWarehouseLabel(String(s.warehouse_id));
    } catch {
      setLoadError("Nie udało się wczytać ustawień zwrotów. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = draftMode !== savedMode;
  const canSave = dirty && !loading && !saving && loadError == null;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload: Parameters<typeof setWmsReturnsModeSettings>[0] = {
        returns_mode: draftMode,
      };
      if (warehouseId != null && warehouseId > 0) {
        payload.warehouse_id = warehouseId;
      }
      const s = await setWmsReturnsModeSettings(payload);
      const m = s.returns_mode;
      const mode: ReturnsMode = m === "two_step" || m === "advanced" ? m : "simple";
      setSavedMode(mode);
      setDraftMode(mode);
      setResolvedTenantLabel(String(s.tenant_id));
      setResolvedWarehouseLabel(String(s.warehouse_id));
      toast.success("Zapisano tryb obsługi zwrotów.");
    } catch {
      toast.error("Nie udało się zapisać — spróbuj ponownie.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <WmsSettingsLayout
      sections={[{ id: SECTION_ID, label: "Tryb zwrotów" }]}
      asideLabel="Sekcje: Zwroty"
      mainClassName="space-y-5"
    >
      <header className="border-b border-slate-200 pb-3">
        <h2 className="text-base font-semibold text-slate-900">Zwroty</h2>
        <p className="mt-1 text-xs text-slate-500">
          Konfiguracja modułu zwrotów WMS — tryb przepływu RMZ i uprawnienia magazynu.
        </p>
      </header>

      <ReturnsModeSectionCard>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-slate-900">Tryb obsługi zwrotów</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            Konfiguracja sposobu obsługi RMZ i decyzji magazynowych.
          </p>
          {resolvedTenantLabel != null && resolvedWarehouseLabel != null ? (
            <p className="mt-2 text-[11px] text-slate-400">
              Aktywna konfiguracja: tenant <span className="tabular-nums font-medium">{resolvedTenantLabel}</span>, magazyn{" "}
              <span className="tabular-nums font-medium">{resolvedWarehouseLabel}</span>
              {warehouseId == null ? " (magazyn domyślny)" : ""}.
            </p>
          ) : null}
        </div>

        {loadError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <p>{loadError}</p>
            <button
              type="button"
              className="mt-3 rounded-lg bg-rose-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
              onClick={() => void load()}
            >
              Spróbuj ponownie
            </button>
          </div>
        ) : loading ? (
          <p className="py-8 text-center text-sm font-medium text-slate-500">Wczytywanie…</p>
        ) : (
          <>
            <div className="space-y-2" role="radiogroup" aria-label="Tryb obsługi zwrotów">
              {RETURNS_MODE_OPTIONS.map((o) => (
                <label key={o.value} className={radioOuter}>
                  <input
                    type="radio"
                    className={radioInput}
                    name="wms-returns-mode"
                    value={o.value}
                    checked={draftMode === o.value}
                    onChange={() => setDraftMode(o.value)}
                  />
                  <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-slate-800">{o.label}</span>
                </label>
              ))}
            </div>

            {dirty ? (
              <p className="mt-4 text-xs font-medium text-amber-800">Masz niezapisane zmiany.</p>
            ) : (
              <p className="mt-4 text-xs text-slate-400">Brak niezapisanych zmian.</p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
              <button
                type="button"
                disabled={!canSave}
                className="min-h-[44px] rounded-lg bg-[#41546a] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#364556] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void save()}
              >
                {saving ? "Zapisywanie…" : "Zapisz ustawienia"}
              </button>
            </div>
          </>
        )}
      </ReturnsModeSectionCard>
    </WmsSettingsLayout>
  );
}
