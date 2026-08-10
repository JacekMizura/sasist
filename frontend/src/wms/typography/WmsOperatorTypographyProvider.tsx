/**
 * Loads warehouse general typography and exposes it to the operator shell.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getWmsGeneralSettings } from "../../api/wmsGeneralSettingsApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../../pages/damage/damageShared";
import {
  DEFAULT_WMS_OPERATOR_TYPOGRAPHY,
  typographyFromApi,
  WMS_GENERAL_SETTINGS_CHANGED_EVENT,
  type WmsOperatorTypography,
} from "./wmsOperatorTypography";

type Ctx = {
  typography: WmsOperatorTypography;
  reload: () => Promise<void>;
};

const WmsOperatorTypographyContext = createContext<Ctx | null>(null);

export function WmsOperatorTypographyProvider({ children }: { children: ReactNode }) {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const [typography, setTypography] = useState<WmsOperatorTypography>(DEFAULT_WMS_OPERATOR_TYPOGRAPHY);

  const reload = useCallback(async () => {
    if (warehouseId == null) {
      setTypography(DEFAULT_WMS_OPERATOR_TYPOGRAPHY);
      return;
    }
    try {
      const row = await getWmsGeneralSettings(DAMAGE_TENANT_ID, warehouseId);
      setTypography(typographyFromApi(row));
    } catch {
      setTypography(DEFAULT_WMS_OPERATOR_TYPOGRAPHY);
    }
  }, [warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onChanged = () => {
      void reload();
    };
    window.addEventListener(WMS_GENERAL_SETTINGS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(WMS_GENERAL_SETTINGS_CHANGED_EVENT, onChanged);
  }, [reload]);

  const value = useMemo(() => ({ typography, reload }), [typography, reload]);

  return (
    <WmsOperatorTypographyContext.Provider value={value}>{children}</WmsOperatorTypographyContext.Provider>
  );
}

export function useWmsOperatorTypography(): Ctx {
  const ctx = useContext(WmsOperatorTypographyContext);
  if (!ctx) {
    return {
      typography: DEFAULT_WMS_OPERATOR_TYPOGRAPHY,
      reload: async () => undefined,
    };
  }
  return ctx;
}
