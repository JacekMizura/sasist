import { useCallback, useEffect, useState, type ReactNode } from "react";
import toast from "react-hot-toast";

import {
  getInventoryManagementSettings,
  saveInventoryManagementSettings,
  type InventoryManagementModeUi,
} from "../../api/inventoryManagementPolicyApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WmsSettingsLayout } from "./WmsSettingsLayout";
import { WMS_SETTINGS_SECTION_ANCHOR_CLASS } from "./wmsSettingsSectionConstants";
import { useWmsSettingsSectionAnchor } from "./WmsSettingsSectionRegistryContext";

const SECTION_ID = "wms-common-inventory-management-policy";

const MODE_OPTIONS: Array<{
  value: InventoryManagementModeUi;
  label: string;
  description: string;
}> = [
  {
    value: "DOCUMENTS_ONLY",
    label: "Tylko dokumenty",
    description: "Stany magazynowe są aktualizowane wyłącznie przez dokumenty magazynowe.",
  },
  {
    value: "HYBRID",
    label: "Dokumenty + ręczne korekty",
    description:
      "Dokumenty aktualizują stany magazynowe. Dodatkowo operator może wykonywać ręczne korekty z pełnym audytem.",
  },
];

const radioOuter =
  "flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-slate-300 hover:bg-slate-50/80 has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50/40";
const radioInput = "mt-1 h-4 w-4 shrink-0 border-slate-300 text-blue-600 focus:ring-blue-500";
const fieldHint = "mt-0.5 text-xs text-slate-500";

function SettingsSectionCard({ sectionId, children }: { sectionId: string; children: ReactNode }) {
  const anchorRef = useWmsSettingsSectionAnchor(sectionId);
  return (
    <section ref={anchorRef} id={sectionId} data-wms-section="" className={WMS_SETTINGS_SECTION_ANCHOR_CLASS}>
      <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">{children}</div>
    </section>
  );
}

type Props = {
  warehouseId: number | null;
};

export default function WmsInventoryManagementSettingsPanel({ warehouseId }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMode, setSavedMode] = useState<InventoryManagementModeUi>("HYBRID");
  const [draftMode, setDraftMode] = useState<InventoryManagementModeUi>("HYBRID");
  const [resolvedWarehouseLabel, setResolvedWarehouseLabel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const s = await getInventoryManagementSettings({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId: warehouseId != null && warehouseId > 0 ? warehouseId : undefined,
      });
      const mode: InventoryManagementModeUi =
        s.inventory_management_mode === "DOCUMENTS_ONLY" ? "DOCUMENTS_ONLY" : "HYBRID";
      setSavedMode(mode);
      setDraftMode(mode);
      setResolvedWarehouseLabel(String(s.warehouse_id));
    } catch {
      setLoadError("Nie udało się wczytać polityki stanów magazynowych.");
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
      const saved = await saveInventoryManagementSettings({
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId != null && warehouseId > 0 ? warehouseId : undefined,
        inventory_management_mode: draftMode,
      });
      const mode: InventoryManagementModeUi =
        saved.inventory_management_mode === "DOCUMENTS_ONLY" ? "DOCUMENTS_ONLY" : "HYBRID";
      setSavedMode(mode);
      setDraftMode(mode);
      toast.success("Zapisano politykę aktualizacji stanów.");
    } catch {
      toast.error("Nie udało się zapisać ustawień.");
    } finally {
      setSaving(false);
    }
  };

  const navSections = [{ id: SECTION_ID, label: "Polityka stanów" }];

  return (
    <WmsSettingsLayout sections={navSections} asideLabel="Ustawienia wspólne" mainClassName="space-y-5">
      <header className="border-b border-slate-200 pb-3">
        <h2 className="text-base font-semibold text-slate-900">Ustawienia wspólne</h2>
        <p className="mt-1 text-xs text-slate-500">
          Magazyn {resolvedWarehouseLabel ?? "—"} — polityka aktualizacji stanów magazynowych.
        </p>
      </header>

      <SettingsSectionCard sectionId={SECTION_ID}>
        <h3 className="text-sm font-semibold text-slate-900">Polityka aktualizacji stanów</h3>
        {loading ? <p className="mt-3 text-sm text-slate-500">Wczytywanie…</p> : null}
        {loadError ? <p className="mt-3 text-sm text-red-600">{loadError}</p> : null}
        {!loading && !loadError ? (
          <div className="mt-4 space-y-3" role="radiogroup" aria-label="Polityka aktualizacji stanów">
            {MODE_OPTIONS.map((opt) => (
              <label key={opt.value} className={radioOuter}>
                <input
                  type="radio"
                  name="wms-inventory-management-mode"
                  className={radioInput}
                  checked={draftMode === opt.value}
                  onChange={() => setDraftMode(opt.value)}
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">{opt.label}</span>
                  <span className={fieldHint}>{opt.description}</span>
                </span>
              </label>
            ))}
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canSave}
            onClick={() => void save()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Zapisywanie…" : "Zapisz"}
          </button>
          {dirty ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => setDraftMode(savedMode)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cofnij zmiany
            </button>
          ) : null}
        </div>
      </SettingsSectionCard>
    </WmsSettingsLayout>
  );
}
