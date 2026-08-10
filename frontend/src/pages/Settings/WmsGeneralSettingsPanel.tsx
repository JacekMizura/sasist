/**
 * WMS settings — „Ogólne”: shared typography for new mode views.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  getWmsGeneralSettings,
  saveWmsGeneralSettings,
  type WmsFontSizePx,
} from "../../api/wmsGeneralSettingsApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WmsSettingsSection } from "./WmsSettingsSection";
import { WmsSettingsTabFrame } from "./WmsSettingsTabFrame";
import {
  WmsControlSettingRow,
  wmsSettingControlSelectClass,
  wmsSettingsRowsStackClass,
} from "./wmsSettingsUi";
import {
  DEFAULT_WMS_OPERATOR_TYPOGRAPHY,
  normalizeWmsFontSizePx,
  WMS_FONT_SIZE_OPTIONS,
  WMS_GENERAL_SETTING_HINTS,
  WMS_GENERAL_SETTINGS_CHANGED_EVENT,
  typographyFromApi,
  type WmsOperatorTypography,
} from "../../wms/typography/wmsOperatorTypography";

export type WmsGeneralSettingsPanelHandle = {
  saveAll: () => Promise<void>;
  discardUnsaved: () => Promise<void>;
};

const NAV = [{ id: "wms-general-typography", label: "Wielkość czcionki" }] as const;

function fingerprint(t: WmsOperatorTypography): string {
  return `${t.fontSizeBasePx}|${t.fontSizeLocationPx}|${t.fontSizeQuantityPx}`;
}

export const WmsGeneralSettingsPanel = forwardRef<
  WmsGeneralSettingsPanelHandle,
  {
    onDirtyChange?: (dirty: boolean) => void;
    sectionNavObserve?: boolean;
  }
>(function WmsGeneralSettingsPanel({ onDirtyChange, sectionNavObserve = true }, ref) {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;

  const [draft, setDraft] = useState<WmsOperatorTypography>(DEFAULT_WMS_OPERATOR_TYPOGRAPHY);
  const [baseline, setBaseline] = useState(fingerprint(DEFAULT_WMS_OPERATOR_TYPOGRAPHY));
  const [loading, setLoading] = useState(false);

  const dirty = fingerprint(draft) !== baseline;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const load = useCallback(async () => {
    if (warehouseId == null) {
      setDraft(DEFAULT_WMS_OPERATOR_TYPOGRAPHY);
      setBaseline(fingerprint(DEFAULT_WMS_OPERATOR_TYPOGRAPHY));
      return;
    }
    setLoading(true);
    try {
      const row = await getWmsGeneralSettings(DAMAGE_TENANT_ID, warehouseId);
      const t = typographyFromApi(row);
      setDraft(t);
      setBaseline(fingerprint(t));
    } catch {
      toast.error("Nie udało się wczytać ustawień ogólnych WMS.");
      setDraft(DEFAULT_WMS_OPERATOR_TYPOGRAPHY);
      setBaseline(fingerprint(DEFAULT_WMS_OPERATOR_TYPOGRAPHY));
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(async () => {
    if (warehouseId == null) throw new Error("Brak magazynu");
    const saved = await saveWmsGeneralSettings({
      tenant_id: DAMAGE_TENANT_ID,
      warehouse_id: warehouseId,
      font_size_base_px: draft.fontSizeBasePx,
      font_size_location_px: draft.fontSizeLocationPx,
      font_size_quantity_px: draft.fontSizeQuantityPx,
    });
    const t = typographyFromApi(saved);
    setDraft(t);
    setBaseline(fingerprint(t));
    window.dispatchEvent(new Event(WMS_GENERAL_SETTINGS_CHANGED_EVENT));
  }, [warehouseId, draft]);

  useImperativeHandle(
    ref,
    () => ({
      saveAll: async () => {
        await persist();
      },
      discardUnsaved: async () => {
        await load();
      },
    }),
    [persist, load],
  );

  const patch = useCallback(<K extends keyof WmsOperatorTypography>(key: K, value: WmsOperatorTypography[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const restoreDefaults = useCallback(() => {
    setDraft({ ...DEFAULT_WMS_OPERATOR_TYPOGRAPHY });
  }, []);

  const selectOpts = useMemo(
    () =>
      WMS_FONT_SIZE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      )),
    [],
  );

  return (
    <WmsSettingsTabFrame
      sections={[...NAV]}
      observeActiveSection={sectionNavObserve}
      ariaLabel="Ustawienia ogólne WMS"
    >
      <WmsSettingsSection
        id="wms-general-typography"
        title="Wielkość czcionki"
        summary="Typografia wspólna dla nowych widoków trybów WMS (zbieranie, pakowanie, kolektor). Wartości obowiązują także na urządzeniach mobilnych."
      >
        {warehouseId == null ? (
          <p className="text-sm text-amber-800">Wybierz magazyn, aby edytować ustawienia ogólne.</p>
        ) : null}
        {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}

        <div className={wmsSettingsRowsStackClass}>
          <WmsControlSettingRow
            settingId="general.font_size_base"
            label="Wielkość czcionki w nowych widokach trybów (ustawienie ogólne)"
            hint={WMS_GENERAL_SETTING_HINTS.fontSizeBase}
          >
            <select
              className={wmsSettingControlSelectClass}
              disabled={warehouseId == null || loading}
              value={draft.fontSizeBasePx}
              onChange={(e) => patch("fontSizeBasePx", normalizeWmsFontSizePx(e.target.value) as WmsFontSizePx)}
              aria-label="Wielkość czcionki w nowych widokach trybów (ustawienie ogólne)"
            >
              {selectOpts}
            </select>
          </WmsControlSettingRow>

          <WmsControlSettingRow
            settingId="general.font_size_location"
            label="Wielkość czcionki dla elementu wskazującego lokalizację w nowych widokach trybów"
            hint={WMS_GENERAL_SETTING_HINTS.fontSizeLocation}
          >
            <select
              className={wmsSettingControlSelectClass}
              disabled={warehouseId == null || loading}
              value={draft.fontSizeLocationPx}
              onChange={(e) =>
                patch("fontSizeLocationPx", normalizeWmsFontSizePx(e.target.value) as WmsFontSizePx)
              }
              aria-label="Wielkość czcionki dla elementu wskazującego lokalizację"
            >
              {selectOpts}
            </select>
          </WmsControlSettingRow>

          <WmsControlSettingRow
            settingId="general.font_size_quantity"
            label="Wielkość czcionki dla elementu wskazującego ilości w nowych widokach trybów"
            hint={WMS_GENERAL_SETTING_HINTS.fontSizeQuantity}
          >
            <select
              className={wmsSettingControlSelectClass}
              disabled={warehouseId == null || loading}
              value={draft.fontSizeQuantityPx}
              onChange={(e) =>
                patch("fontSizeQuantityPx", normalizeWmsFontSizePx(e.target.value) as WmsFontSizePx)
              }
              aria-label="Wielkość czcionki dla elementu wskazującego ilości"
            >
              {selectOpts}
            </select>
          </WmsControlSettingRow>
        </div>

        <div className="mt-4">
          <button
            type="button"
            className="text-sm font-semibold text-[#e85d04] hover:underline disabled:opacity-40"
            disabled={warehouseId == null || loading}
            onClick={restoreDefaults}
          >
            Przywróć domyślne (16 px)
          </button>
          <p className="mt-1 text-xs text-slate-500">
            Ustawia wszystkie trzy wielkości na 16 px. Zapisz zmiany, aby utrwalić.
          </p>
        </div>
      </WmsSettingsSection>
    </WmsSettingsTabFrame>
  );
});
