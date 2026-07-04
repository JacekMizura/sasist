import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";

import {
  getWmsProductValidationSettings,
  saveWmsProductValidationSettings,
  type WmsProductValidationSettings,
} from "../../api/wmsProductValidationApi";
import { ProductReceivingRequirementsSection } from "../../components/wms/receiving/ProductReceivingRequirementsSection";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WmsSettingsLayout } from "./WmsSettingsLayout";
import { WMS_SETTINGS_SECTION_ANCHOR_CLASS } from "./wmsSettingsSectionConstants";
import { useWmsSettingsSectionAnchor } from "./WmsSettingsSectionRegistryContext";

const SECTION_ID = "wms-receiving-product-validation";

type Props = {
  warehouseId: number | null;
};

function SectionCard({ sectionId, children }: { sectionId: string; children: ReactNode }) {
  const anchorRef = useWmsSettingsSectionAnchor(sectionId);
  return (
    <section ref={anchorRef} id={sectionId} data-wms-section="" className={WMS_SETTINGS_SECTION_ANCHOR_CLASS}>
      <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">{children}</div>
    </section>
  );
}

function toDraft(s: WmsProductValidationSettings) {
  return {
    requireDimensions: s.require_dimensions,
    requireWeight: s.require_weight,
    requireBatch: s.require_batch,
    requireExpiry: s.require_expiry,
    requireSerial: s.require_serial,
    requireMasterCarton: s.require_master_carton,
    requireMasterCartonEan: s.require_master_carton_ean,
    requireMasterCartonQty: s.require_master_carton_qty,
    requireMasterCartonDims: s.require_master_carton_dims,
    requireMasterCartonWeight: s.require_master_carton_weight,
  };
}

export default function WmsProductValidationSettingsPanel({ warehouseId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<ReturnType<typeof toDraft> | null>(null);
  const [draft, setDraft] = useState<ReturnType<typeof toDraft> | null>(null);
  const [resolvedWh, setResolvedWh] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWmsProductValidationSettings({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId: warehouseId != null && warehouseId > 0 ? warehouseId : undefined,
      });
      const d = toDraft(data);
      setSaved(d);
      setDraft(d);
      setResolvedWh(data.warehouse_id);
    } catch {
      toast.error("Nie udało się wczytać ustawień walidacji produktów.");
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);

  const applyPatch = (patch: Partial<Record<string, boolean>>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const save = async () => {
    if (!draft || !dirty) return;
    setSaving(true);
    try {
      await saveWmsProductValidationSettings({
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId ?? resolvedWh ?? undefined,
        require_dimensions: draft.requireDimensions,
        require_weight: draft.requireWeight,
        require_batch: draft.requireBatch,
        require_expiry: draft.requireExpiry,
        require_serial: draft.requireSerial,
        require_master_carton: draft.requireMasterCarton,
        require_master_carton_ean: draft.requireMasterCartonEan,
        require_master_carton_qty: draft.requireMasterCartonQty,
        require_master_carton_dims: draft.requireMasterCartonDims,
        require_master_carton_weight: draft.requireMasterCartonWeight,
      });
      setSaved({ ...draft });
      toast.success("Zapisano walidację produktów.");
    } catch {
      toast.error("Nie udało się zapisać ustawień.");
    } finally {
      setSaving(false);
    }
  };

  const sections = [{ id: SECTION_ID, label: "Walidacja produktów" }];

  if (loading || !draft) {
    return <p className="text-sm text-slate-500">Wczytywanie ustawień walidacji produktów…</p>;
  }

  return (
    <WmsSettingsLayout sections={sections} asideLabel="Przyjęcia — nawigacja">
      <SectionCard sectionId={SECTION_ID}>
        <h2 className="text-base font-bold text-slate-900">Walidacja produktów</h2>
        <p className="mt-1 text-sm text-slate-600">
          Globalne wymagania master-data i traceability przy przyjęciu WMS. Na karcie produktu można jedynie{" "}
          <strong>wyłączyć</strong> wybrane reguły dla konkretnego SKU (
          <Link to="/products" className="text-indigo-800 underline hover:text-indigo-950">
            Produkty
          </Link>
          → Ustawienia → Walidacja).
        </p>

        <div className="mt-5">
          <ProductReceivingRequirementsSection
            requireDimensions={draft.requireDimensions}
            requireWeight={draft.requireWeight}
            requireBatch={draft.requireBatch}
            requireExpiry={draft.requireExpiry}
            requireSerial={draft.requireSerial}
            requireMasterCarton={draft.requireMasterCarton}
            requireMasterCartonEan={draft.requireMasterCartonEan}
            requireMasterCartonQty={draft.requireMasterCartonQty}
            requireMasterCartonDims={draft.requireMasterCartonDims}
            requireMasterCartonWeight={draft.requireMasterCartonWeight}
            disabled={saving}
            onChange={applyPatch}
          />
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => setDraft(saved ? { ...saved } : draft)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cofnij
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void save()}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
          >
            {saving ? "Zapisywanie…" : "Zapisz"}
          </button>
        </div>
      </SectionCard>
    </WmsSettingsLayout>
  );
}
