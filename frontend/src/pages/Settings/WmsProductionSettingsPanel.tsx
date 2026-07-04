import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";

import {
  getWmsProductionSettings,
  saveWmsProductionSettings,
  type ProductionTerminalDisplaySettings,
  type ProductionTerminalRequiredSettings,
  type WmsProductionSettings,
} from "../../api/wmsProductionSettingsApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WmsSettingsLayout } from "./WmsSettingsLayout";
import { WMS_SETTINGS_SECTION_ANCHOR_CLASS } from "./wmsSettingsSectionConstants";
import { useWmsSettingsSectionAnchor } from "./WmsSettingsSectionRegistryContext";

const SECTION_DISPLAY = "wms-production-terminal-display";
const SECTION_REQUIRED = "wms-production-terminal-required";

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

function BoolRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer py-1.5">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-slate-300"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm font-medium text-slate-900">{label}</span>
    </label>
  );
}

const DISPLAY_FIELDS: { key: keyof ProductionTerminalDisplaySettings; label: string }[] = [
  { key: "show_product_image", label: "Zdjęcie produktu" },
  { key: "show_name", label: "Nazwa" },
  { key: "show_sku", label: "SKU" },
  { key: "show_ean", label: "EAN" },
  { key: "show_catalog_number", label: "Numer katalogowy" },
  { key: "show_source_location", label: "Lokalizacja źródłowa" },
  { key: "show_target_location", label: "Lokalizacja docelowa" },
  { key: "show_stock_level", label: "Stan magazynowy" },
  { key: "show_unit", label: "Jednostka" },
  { key: "show_barcode", label: "Kod kreskowy" },
];

const REQUIRED_FIELDS: { key: keyof ProductionTerminalRequiredSettings; label: string }[] = [
  { key: "require_batch_number", label: "Numer partii" },
  { key: "require_serial", label: "Numer seryjny" },
  { key: "require_lot", label: "LOT" },
  { key: "require_production_date", label: "Data produkcji" },
  { key: "require_expiry_date", label: "Data ważności" },
  { key: "require_operator", label: "Operator" },
  { key: "require_quality_control", label: "Kontrola jakości" },
];

export default function WmsProductionSettingsPanel({ warehouseId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<WmsProductionSettings | null>(null);
  const [draftDisplay, setDraftDisplay] = useState<ProductionTerminalDisplaySettings | null>(null);
  const [draftRequired, setDraftRequired] = useState<ProductionTerminalRequiredSettings | null>(null);
  const [resolvedWh, setResolvedWh] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWmsProductionSettings({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId: warehouseId != null && warehouseId > 0 ? warehouseId : undefined,
      });
      setSaved(data);
      setDraftDisplay(data.terminal_display);
      setDraftRequired(data.terminal_required);
      setResolvedWh(data.warehouse_id);
    } catch {
      toast.error("Nie udało się wczytać ustawień produkcji WMS.");
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!saved || !draftDisplay || !draftRequired) return false;
    return (
      JSON.stringify(saved.terminal_display) !== JSON.stringify(draftDisplay) ||
      JSON.stringify(saved.terminal_required) !== JSON.stringify(draftRequired)
    );
  }, [saved, draftDisplay, draftRequired]);

  const save = async () => {
    if (!draftDisplay || !draftRequired || !dirty) return;
    setSaving(true);
    try {
      const data = await saveWmsProductionSettings({
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId ?? resolvedWh ?? undefined,
        terminal_display: draftDisplay,
        terminal_required: draftRequired,
      });
      setSaved(data);
      setDraftDisplay(data.terminal_display);
      setDraftRequired(data.terminal_required);
      toast.success("Zapisano ustawienia produkcji.");
    } catch {
      toast.error("Zapis ustawień nie powiódł się.");
    } finally {
      setSaving(false);
    }
  };

  const sections = [
    { id: SECTION_DISPLAY, label: "Widok terminala" },
    { id: SECTION_REQUIRED, label: "Wymagane dane" },
  ];

  if (loading || !draftDisplay || !draftRequired) {
    return <p className="text-sm text-slate-500">Wczytywanie ustawień produkcji…</p>;
  }

  return (
    <WmsSettingsLayout sections={sections} asideLabel="Produkcja — nawigacja">
      <SectionCard sectionId={SECTION_DISPLAY}>
        <h2 className="text-base font-bold text-slate-900">Widok terminala</h2>
        <p className="mt-1 text-sm text-slate-600">Elementy widoczne operatorowi w terminalu zbierania i produkcji.</p>
        <div className="mt-4 grid gap-1 sm:grid-cols-2">
          {DISPLAY_FIELDS.map(({ key, label }) => (
            <BoolRow
              key={key}
              label={label}
              checked={draftDisplay[key]}
              onChange={(v) => setDraftDisplay((prev) => (prev ? { ...prev, [key]: v } : prev))}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard sectionId={SECTION_REQUIRED}>
        <h2 className="text-base font-bold text-slate-900">Wymagane dane</h2>
        <p className="mt-1 text-sm text-slate-600">
          Pola wymagane przy zakończeniu produkcji w terminalu WMS (rozszerzenie w kolejnych iteracjach formularza).
        </p>
        <div className="mt-4 grid gap-1 sm:grid-cols-2">
          {REQUIRED_FIELDS.map(({ key, label }) => (
            <BoolRow
              key={key}
              label={label}
              checked={draftRequired[key]}
              onChange={(v) => setDraftRequired((prev) => (prev ? { ...prev, [key]: v } : prev))}
            />
          ))}
        </div>
      </SectionCard>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => {
            if (saved) {
              setDraftDisplay(saved.terminal_display);
              setDraftRequired(saved.terminal_required);
            }
          }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
        >
          Anuluj
        </button>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void save()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {saving ? "Zapisywanie…" : "Zapisz"}
        </button>
      </div>
    </WmsSettingsLayout>
  );
}
