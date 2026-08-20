import { useCallback, useEffect, useState, type ReactNode } from "react";
import toast from "react-hot-toast";

import api from "../../api/axios";
import { getWmsReturnsModeSettings, setWmsReturnsModeSettings } from "../../api/wmsReturnsApi";
import { getWarehouseLocations, type WarehouseLocationItem } from "../../api/warehouseGraphApi";
import type {
  ManufacturedComponentRecoveryMode,
  ManufacturedRecoveryReceiptMode,
  RefundProcessing,
} from "../../types/wmsReturn";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WmsSettingsTabFrame } from "./WmsSettingsTabFrame";
import { WmsSettingsSection } from "./WmsSettingsSection";
import {
  SettingInfoButton,
  WmsBoolSettingRow,
  WmsControlSettingRow,
  wmsSettingControlSelectClass,
  wmsSettingsRowsStackClass,
} from "./wmsSettingsUi";
import {
  WMS_RETURNS_MFG_SECTION_ID,
  WMS_RETURNS_MODE_SECTION_ID,
  WMS_RETURNS_SETTINGS_NAV_SECTIONS,
  WMS_RETURNS_ZPZ_SECTION_ID,
} from "./wmsReturnsSettingsNavSections";

const MODE_SECTION_ID = WMS_RETURNS_MODE_SECTION_ID;
const ZPZ_LABEL_SECTION_ID = WMS_RETURNS_ZPZ_SECTION_ID;
const MFG_SECTION_ID = WMS_RETURNS_MFG_SECTION_ID;
const RETURNS_NAV = WMS_RETURNS_SETTINGS_NAV_SECTIONS;
type LabelTemplateOption = {
  id: number;
  name: string;
  template_type?: string | null;
};

const REFUND_PROCESSING_OPTIONS: Array<{ value: RefundProcessing; label: string; hint: string }> = [
  {
    value: "disabled",
    label: "Wyłączone",
    hint: "Brak rozliczenia finansowego w RMZ — magazyn kończy przyjęcie bez zwrotu środków.",
  },
  {
    value: "warehouse",
    label: "W magazynie",
    hint: "Operator magazynu może rozliczyć zwrot przy zatwierdzeniu przyjęcia.",
  },
  {
    value: "office",
    label: "W biurze",
    hint: "Magazyn kończy przyjęcie towaru; rozliczenie wykonuje biuro (kolejka „Do decyzji”).",
  },
];

const RECOVERY_MODE_OPTIONS: Array<{
  value: ManufacturedComponentRecoveryMode;
  label: string;
  hint: string;
}> = [
  {
    value: "OFF",
    label: "Wyłączone",
    hint: "Obecny flow zwrotu bez zmian — produkt gotowy trafia na Z-PZ jak dotychczas.",
  },
  {
    value: "OPTIONAL",
    label: "Opcjonalne",
    hint: "Dla produktu z aktywną recepturą produkcyjną operator wybiera: przyjąć FG albo rozmontować na komponenty.",
  },
  {
    value: "REQUIRED",
    label: "Wymagane",
    hint: "Produkt z aktywną recepturą musi być rozliczony przez rozmontowanie (FG = 0).",
  },
];

const RECEIPT_MODE_OPTIONS: Array<{
  value: ManufacturedRecoveryReceiptMode;
  label: string;
  hint: string;
}> = [
  {
    value: "STANDARD_PUTAWAY",
    label: "Standardowe rozlokowanie",
    hint: "Odzyskane komponenty trafiają do kolejki Rozlokowania Z-PZ.",
  },
  {
    value: "DEFAULT_LOCATION",
    label: "Domyślna lokalizacja odzysków",
    hint: "Komponenty są przyjmowane od razu na wybraną lokalizację (bez ręcznego putaway).",
  },
];

const radioOuter =
  "flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-slate-300 hover:bg-slate-50/80 has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50/40";
const radioInput = "mt-1 h-4 w-4 shrink-0 border-slate-300 text-blue-600 focus:ring-blue-500";

function SettingsSectionCard({
  sectionId,
  title,
  summary,
  children,
}: {
  sectionId: string;
  title: string;
  summary?: string;
  children: ReactNode;
}) {
  const meta = RETURNS_NAV.find((s) => s.id === sectionId);
  return (
    <WmsSettingsSection
      id={sectionId}
      title={title}
      summary={summary}
      icon={meta?.icon}
      iconClassName={meta?.iconClassName}
      searchText={meta?.searchText}
    >
      {children}
    </WmsSettingsSection>
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
  const [savedRequireCondition, setSavedRequireCondition] = useState(false);
  const [draftRequireCondition, setDraftRequireCondition] = useState(false);
  const [savedRequirePhotos, setSavedRequirePhotos] = useState(false);
  const [draftRequirePhotos, setDraftRequirePhotos] = useState(false);
  const [savedRefundProcessing, setSavedRefundProcessing] = useState<RefundProcessing>("disabled");
  const [draftRefundProcessing, setDraftRefundProcessing] = useState<RefundProcessing>("disabled");
  const [savedPrintLabel, setSavedPrintLabel] = useState(false);
  const [draftPrintLabel, setDraftPrintLabel] = useState(false);
  const [savedTemplateId, setSavedTemplateId] = useState<number | null>(null);
  const [draftTemplateId, setDraftTemplateId] = useState<number | null>(null);
  const [savedRecoveryMode, setSavedRecoveryMode] = useState<ManufacturedComponentRecoveryMode>("OFF");
  const [draftRecoveryMode, setDraftRecoveryMode] = useState<ManufacturedComponentRecoveryMode>("OFF");
  const [savedReceiptMode, setSavedReceiptMode] =
    useState<ManufacturedRecoveryReceiptMode>("STANDARD_PUTAWAY");
  const [draftReceiptMode, setDraftReceiptMode] =
    useState<ManufacturedRecoveryReceiptMode>("STANDARD_PUTAWAY");
  const [savedRecoveryLocId, setSavedRecoveryLocId] = useState<number | null>(null);
  const [draftRecoveryLocId, setDraftRecoveryLocId] = useState<number | null>(null);
  const [locations, setLocations] = useState<WarehouseLocationItem[]>([]);
  const [labelTemplates, setLabelTemplates] = useState<LabelTemplateOption[]>([]);
  const [resolvedTenantLabel, setResolvedTenantLabel] = useState<string | null>(null);
  const [resolvedWarehouseLabel, setResolvedWarehouseLabel] = useState<string | null>(null);
  const [resolvedWarehouseId, setResolvedWarehouseId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [s, tplRes] = await Promise.all([
        getWmsReturnsModeSettings({
          warehouseId: warehouseId != null && warehouseId > 0 ? warehouseId : undefined,
        }),
        api.get<LabelTemplateOption[]>("/label-templates/", { params: { tenant_id: DAMAGE_TENANT_ID } }),
      ]);
      const rpRaw = String(s.refund_processing || "disabled").toLowerCase();
      const rp: RefundProcessing =
        rpRaw === "warehouse" || rpRaw === "office" ? rpRaw : "disabled";
      setSavedRequireCondition(Boolean(s.require_condition));
      setDraftRequireCondition(Boolean(s.require_condition));
      setSavedRequirePhotos(Boolean(s.require_photos));
      setDraftRequirePhotos(Boolean(s.require_photos));
      setSavedRefundProcessing(rp);
      setDraftRefundProcessing(rp);
      setSavedPrintLabel(Boolean(s.z_pz_print_label_on_close));
      setDraftPrintLabel(Boolean(s.z_pz_print_label_on_close));
      const tplId = s.z_pz_label_template_id ?? null;
      setSavedTemplateId(tplId);
      setDraftTemplateId(tplId);
      const rmRaw = String(s.manufactured_component_recovery_mode || "OFF").toUpperCase();
      const rm: ManufacturedComponentRecoveryMode =
        rmRaw === "OPTIONAL" || rmRaw === "REQUIRED" ? rmRaw : "OFF";
      setSavedRecoveryMode(rm);
      setDraftRecoveryMode(rm);
      const recRaw = String(s.manufactured_recovery_receipt_mode || "STANDARD_PUTAWAY").toUpperCase();
      const rec: ManufacturedRecoveryReceiptMode =
        recRaw === "DEFAULT_LOCATION" ? "DEFAULT_LOCATION" : "STANDARD_PUTAWAY";
      setSavedReceiptMode(rec);
      setDraftReceiptMode(rec);
      const locId =
        s.manufactured_recovery_location_id != null && Number(s.manufactured_recovery_location_id) > 0
          ? Number(s.manufactured_recovery_location_id)
          : null;
      setSavedRecoveryLocId(locId);
      setDraftRecoveryLocId(locId);
      setLabelTemplates(Array.isArray(tplRes.data) ? tplRes.data : []);
      setResolvedTenantLabel(String(s.tenant_id));
      setResolvedWarehouseLabel(String(s.warehouse_id));
      setResolvedWarehouseId(Number(s.warehouse_id) > 0 ? Number(s.warehouse_id) : null);
    } catch {
      setLoadError("Nie udało się wczytać ustawień zwrotów. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const wh =
      warehouseId != null && warehouseId > 0
        ? warehouseId
        : resolvedWarehouseId != null && resolvedWarehouseId > 0
          ? resolvedWarehouseId
          : null;
    if (wh == null || draftReceiptMode !== "DEFAULT_LOCATION") {
      setLocations([]);
      return;
    }
    let cancelled = false;
    void getWarehouseLocations(wh)
      .then((rows) => {
        if (!cancelled) setLocations(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [warehouseId, resolvedWarehouseId, draftReceiptMode]);

  const dirty =
    draftRequireCondition !== savedRequireCondition ||
    draftRequirePhotos !== savedRequirePhotos ||
    draftRefundProcessing !== savedRefundProcessing ||
    draftPrintLabel !== savedPrintLabel ||
    draftTemplateId !== savedTemplateId ||
    draftRecoveryMode !== savedRecoveryMode ||
    draftReceiptMode !== savedReceiptMode ||
    draftRecoveryLocId !== savedRecoveryLocId;
  const canSave = dirty && !loading && !saving && loadError == null;
  const printRequiresTemplate = draftPrintLabel && (draftTemplateId == null || draftTemplateId <= 0);
  const recoveryLocRequired =
    draftReceiptMode === "DEFAULT_LOCATION" && (draftRecoveryLocId == null || draftRecoveryLocId <= 0);

  const save = async () => {
    if (!canSave) return;
    if (printRequiresTemplate) {
      toast.error("Wybierz szablon etykiety Z-PZ.");
      return;
    }
    if (recoveryLocRequired) {
      toast.error("Wybierz lokalizację odzysków.");
      return;
    }
    setSaving(true);
    try {
      const payload: Parameters<typeof setWmsReturnsModeSettings>[0] = {
        require_condition: draftRequireCondition,
        require_photos: draftRequirePhotos,
        refund_processing: draftRefundProcessing,
        z_pz_print_label_on_close: draftPrintLabel,
        z_pz_label_template_id: draftPrintLabel ? draftTemplateId : null,
        manufactured_component_recovery_mode: draftRecoveryMode,
        manufactured_recovery_receipt_mode: draftReceiptMode,
        manufactured_recovery_location_id:
          draftReceiptMode === "DEFAULT_LOCATION" ? draftRecoveryLocId : null,
      };
      if (warehouseId != null && warehouseId > 0) {
        payload.warehouse_id = warehouseId;
      }
      const s = await setWmsReturnsModeSettings(payload);
      const rpRaw = String(s.refund_processing || "disabled").toLowerCase();
      const rp: RefundProcessing =
        rpRaw === "warehouse" || rpRaw === "office" ? rpRaw : "disabled";
      setSavedRequireCondition(Boolean(s.require_condition));
      setDraftRequireCondition(Boolean(s.require_condition));
      setSavedRequirePhotos(Boolean(s.require_photos));
      setDraftRequirePhotos(Boolean(s.require_photos));
      setSavedRefundProcessing(rp);
      setDraftRefundProcessing(rp);
      setSavedPrintLabel(Boolean(s.z_pz_print_label_on_close));
      setDraftPrintLabel(Boolean(s.z_pz_print_label_on_close));
      const tplId = s.z_pz_label_template_id ?? null;
      setSavedTemplateId(tplId);
      setDraftTemplateId(tplId);
      const rmRaw = String(s.manufactured_component_recovery_mode || "OFF").toUpperCase();
      const rm: ManufacturedComponentRecoveryMode =
        rmRaw === "OPTIONAL" || rmRaw === "REQUIRED" ? rmRaw : "OFF";
      setSavedRecoveryMode(rm);
      setDraftRecoveryMode(rm);
      const recRaw = String(s.manufactured_recovery_receipt_mode || "STANDARD_PUTAWAY").toUpperCase();
      const rec: ManufacturedRecoveryReceiptMode =
        recRaw === "DEFAULT_LOCATION" ? "DEFAULT_LOCATION" : "STANDARD_PUTAWAY";
      setSavedReceiptMode(rec);
      setDraftReceiptMode(rec);
      const locId =
        s.manufactured_recovery_location_id != null && Number(s.manufactured_recovery_location_id) > 0
          ? Number(s.manufactured_recovery_location_id)
          : null;
      setSavedRecoveryLocId(locId);
      setDraftRecoveryLocId(locId);
      setResolvedTenantLabel(String(s.tenant_id));
      setResolvedWarehouseLabel(String(s.warehouse_id));
      toast.success("Zapisano ustawienia zwrotów.");
    } catch {
      toast.error("Nie udało się zapisać — spróbuj ponownie.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <WmsSettingsTabFrame
      title="Zwroty"
      description="Konfiguracja przyjęcia zwrotów, kontroli jakości i dokumentów Z-PZ."
      sections={RETURNS_NAV}
      asideLabel="Sekcje: Zwroty"
      dirty={dirty}
      saving={saving}
      onSave={() => void save()}
      onRestoreDefaults={() => {
        setDraftRequireCondition(savedRequireCondition);
        setDraftRequirePhotos(savedRequirePhotos);
        setDraftRefundProcessing(savedRefundProcessing);
        setDraftPrintLabel(savedPrintLabel);
        setDraftTemplateId(savedTemplateId);
        setDraftRecoveryMode(savedRecoveryMode);
        setDraftReceiptMode(savedReceiptMode);
        setDraftRecoveryLocId(savedRecoveryLocId);
      }}
      restoreDisabled={!dirty}
    >
      <SettingsSectionCard
        sectionId={MODE_SECTION_ID}
        title="Ogólne"
        summary="Kontrola jakości i rozliczenie zwrotu w RMZ."
      >
          {resolvedTenantLabel != null && resolvedWarehouseLabel != null ? (
            <p className="text-[11px] text-slate-400">
              Aktywna konfiguracja: tenant <span className="tabular-nums font-medium">{resolvedTenantLabel}</span>, magazyn{" "}
              <span className="tabular-nums font-medium">{resolvedWarehouseLabel}</span>
              {warehouseId == null ? " (magazyn domyślny)" : ""}.
            </p>
          ) : null}

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
          <div className={wmsSettingsRowsStackClass}>
            <WmsBoolSettingRow
              label="Wymagaj klasyfikacji stanu uszkodzonych produktów"
              hint="Operator musi wybrać klasę B/C dla każdej uszkodzonej sztuki."
              checked={draftRequireCondition}
              onChange={setDraftRequireCondition}
            />
            <WmsBoolSettingRow
              label="Wymagaj zdjęć uszkodzonych produktów"
              hint="Przy uszkodzeniu wymagane jest co najmniej jedno zdjęcie."
              checked={draftRequirePhotos}
              onChange={setDraftRequirePhotos}
            />
            <WmsControlSettingRow
              label="Rozliczenie zwrotu"
              hint="Określa, kto wykonuje zwrot środków w ramach procesu RMZ."
            >
              <div className="space-y-2">
                {REFUND_PROCESSING_OPTIONS.map((o) => (
                  <label key={o.value} className={radioOuter}>
                    <input
                      type="radio"
                      className={radioInput}
                      name="wms-refund-processing"
                      value={o.value}
                      checked={draftRefundProcessing === o.value}
                      onChange={() => setDraftRefundProcessing(o.value)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800">{o.label}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </WmsControlSettingRow>
          </div>
        )}
      </SettingsSectionCard>

      <SettingsSectionCard
        sectionId={ZPZ_LABEL_SECTION_ID}
        title="Przyjęcie"
        summary="Automatyczny wydruk etykiety po zamknięciu zbiorczego dokumentu zwrotów."
      >
        {loading || loadError ? null : (
          <div className={wmsSettingsRowsStackClass}>
            <WmsBoolSettingRow
              label="Drukuj etykietę po zamknięciu Z-PZ"
              hint="Po zamknięciu nośnika zwrotów etykieta trafi na drukarkę WMS (QZ) lub do podglądu PDF."
              checked={draftPrintLabel}
              onChange={setDraftPrintLabel}
            />
            <WmsControlSettingRow
              label="Szablon etykiety Z-PZ"
              hint="Szablon z modułu etykiet — pola: numer dokumentu, kod kreskowy, pozycje, sztuki."
              footer={
                printRequiresTemplate ? (
                  <span className="mt-1 block text-xs font-medium text-amber-800">
                    Wybierz szablon, aby włączyć automatyczny druk.
                  </span>
                ) : null
              }
            >
              <select
                id="wms-z-pz-label-template"
                className={wmsSettingControlSelectClass}
                value={draftTemplateId ?? ""}
                disabled={!draftPrintLabel}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraftTemplateId(v === "" ? null : Number(v));
                }}
              >
                <option value="">— wybierz szablon —</option>
                {labelTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.template_type ? ` (${t.template_type})` : ""}
                  </option>
                ))}
              </select>
            </WmsControlSettingRow>
          </div>
        )}
      </SettingsSectionCard>

      <SettingsSectionCard
        sectionId={MFG_SECTION_ID}
        title="Produkty produkowane"
        summary="Odzysk komponentów z zwracanych wyrobów gotowych (BOM)."
      >
        {loading || loadError ? null : (
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-800">Odzysk komponentów</p>
                <SettingInfoButton
                  title="Odzysk komponentów"
                  description="Steruje, czy przy zwrocie produktu z aktywną recepturą produkcyjną operator może (lub musi) rozmontować wyrób na komponenty zamiast przyjmować FG."
                />
              </div>
              <div className="space-y-2" role="radiogroup" aria-label="Odzysk komponentów">
                {RECOVERY_MODE_OPTIONS.map((o) => (
                  <label key={o.value} className={radioOuter}>
                    <input
                      type="radio"
                      className={radioInput}
                      name="wms-mfg-recovery-mode"
                      value={o.value}
                      checked={draftRecoveryMode === o.value}
                      onChange={() => setDraftRecoveryMode(o.value)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-snug text-slate-800">{o.label}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-800">Sposób przyjęcia</p>
                <SettingInfoButton
                  title="Sposób przyjęcia odzyskanych komponentów"
                  description="Standardowe rozlokowanie — kolejka putaway Z-PZ. Domyślna lokalizacja — bezpośrednie przyjęcie stocku na wskazane miejsce."
                />
              </div>
              <div className="space-y-2" role="radiogroup" aria-label="Sposób przyjęcia komponentów">
                {RECEIPT_MODE_OPTIONS.map((o) => (
                  <label key={o.value} className={radioOuter}>
                    <input
                      type="radio"
                      className={radioInput}
                      name="wms-mfg-receipt-mode"
                      value={o.value}
                      checked={draftReceiptMode === o.value}
                      onChange={() => setDraftReceiptMode(o.value)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-snug text-slate-800">{o.label}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {draftReceiptMode === "DEFAULT_LOCATION" ? (
                <div className="mt-3">
                  <WmsControlSettingRow
                    label="Lokalizacja odzysków"
                    hint="Lokalizacja z aktualnego magazynu — stock komponentów trafia tu bezpośrednio."
                    footer={
                      recoveryLocRequired ? (
                        <span className="mt-1 block text-xs font-medium text-amber-800">
                          Wybierz lokalizację dla trybu domyślnej lokalizacji.
                        </span>
                      ) : null
                    }
                  >
                    <select
                      id="wms-mfg-recovery-location"
                      className={wmsSettingControlSelectClass}
                      value={draftRecoveryLocId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraftRecoveryLocId(v === "" ? null : Number(v));
                      }}
                    >
                      <option value="">— wybierz lokalizację —</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.code || loc.name || `Lokalizacja #${loc.id}`}
                        </option>
                      ))}
                    </select>
                  </WmsControlSettingRow>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </SettingsSectionCard>
    </WmsSettingsTabFrame>
  );
}
