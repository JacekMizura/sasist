import { ShieldCheck } from "lucide-react";
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
import { WmsSettingsTabFrame } from "./WmsSettingsTabFrame";
import { WmsSettingsSection } from "./WmsSettingsSection";
import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";

const SECTION_ID = "wms-receiving-product-validation";

const RECEIVING_NAV: WmsSettingsSectionConfig[] = [
  {
    id: SECTION_ID,
    label: "Ogólne",
    icon: ShieldCheck,
    iconClassName: "bg-emerald-50 text-emerald-600",
    searchText: "walidacja master-data karton",
  },
];

type Props = {
  warehouseId: number | null;
};

function SectionCard({ sectionId, children }: { sectionId: string; children: ReactNode }) {
  const meta = RECEIVING_NAV.find((s) => s.id === sectionId);
  return (
    <WmsSettingsSection
      id={sectionId}
      title="Ogólne"
      summary="Globalne wymagania master-data i traceability przy przyjęciu WMS."
      icon={meta?.icon}
      iconClassName={meta?.iconClassName}
      searchText={meta?.searchText}
    >
      {children}
    </WmsSettingsSection>
  );
}

function toDraft(s: WmsProductValidationSettings) {
  return {
    requireDimensions: s.require_dimensions,
    requireWeight: s.require_weight,
    requireBatch: s.require_batch,
    requireExpiry: s.require_expiry,
    requireSerial: s.require_serial,
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
        require_master_carton: false,
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

  const sections = RECEIVING_NAV;

  if (loading || !draft) {
    return <p className="text-sm text-slate-500">Wczytywanie ustawień walidacji produktów…</p>;
  }

  return (
    <WmsSettingsTabFrame
      title="Przyjęcia"
      description="Walidacja produktów i wymagania przy przyjęciu dostawy."
      sections={sections}
      asideLabel="Przyjęcia — nawigacja"
      dirty={dirty}
      saving={saving}
      onSave={() => void save()}
      onRestoreDefaults={() => setDraft(saved ? { ...saved } : draft)}
      restoreDisabled={!dirty}
    >
      <SectionCard sectionId={SECTION_ID}>
        <p className="text-sm text-slate-600">
          Na karcie produktu można <strong>wyłączyć</strong> wybrane wymagania dla konkretnego SKU (
          <Link to="/products" className="text-indigo-800 underline hover:text-indigo-950">
            Produkty
          </Link>
          → Ustawienia → Walidacja). Wyjątek produktu jest globalny dla SKU, nie dla pojedynczego magazynu.
        </p>

        <div className="mt-2">
          <ProductReceivingRequirementsSection
            requireDimensions={draft.requireDimensions}
            requireWeight={draft.requireWeight}
            requireBatch={draft.requireBatch}
            requireExpiry={draft.requireExpiry}
            requireSerial={draft.requireSerial}
            requireMasterCartonEan={draft.requireMasterCartonEan}
            requireMasterCartonQty={draft.requireMasterCartonQty}
            requireMasterCartonDims={draft.requireMasterCartonDims}
            requireMasterCartonWeight={draft.requireMasterCartonWeight}
            disabled={saving}
            onChange={applyPatch}
          />
        </div>
        {resolvedWh != null ? (
          <p className="mt-3 text-xs text-slate-400">Magazyn konfiguracji: #{resolvedWh}</p>
        ) : null}
      </SectionCard>
    </WmsSettingsTabFrame>
  );
}
