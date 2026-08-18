/**
 * Live shortage + pre-assignment validation settings (API SSOT).
 * Dead auto_enqueue / priority / auto_reopen are echoed on save, never shown.
 */
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getWmsPackingSettings } from "../../../api/wmsPackingSettingsApi";
import {
  getWmsPickingShortageSettings,
  saveWmsPickingShortageSettings,
  type WmsShortageResolvePriorityApi,
} from "../../../api/wmsPickingShortageSettingsApi";
import { OrderUiStatusField } from "../../../components/orders/OrderUiStatusField";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import { SettingsSubsection } from "../../../pages/Settings/SettingsSubsection";
import {
  WmsBoolSettingRow,
  WmsControlSettingRow,
  wmsSettingsRowsStackClass,
} from "../../../pages/Settings/wmsSettingsUi";

function statusIdFromSettingValue(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fingerprint(params: {
  reportedStatus: string;
  recoveryStatus: string;
  validationFailedStatus: string;
  allowContinue: boolean;
  disableAutoDetach: boolean;
}): string {
  return JSON.stringify(params);
}

type ShortageSettingsCtx = {
  loading: boolean;
  saving: boolean;
  fatalLoadErr: string | null;
  saveErr: string | null;
  saveOk: string | null;
  orderUiErr: string | null;
  orderUiLoading: boolean;
  orderUiSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
  reportedStatus: string;
  setReportedStatus: (v: string) => void;
  recoveryStatus: string;
  setRecoveryStatus: (v: string) => void;
  validationFailedStatus: string;
  setValidationFailedStatus: (v: string) => void;
  allowContinue: boolean;
  setAllowContinue: (v: boolean) => void;
  disableAutoDetach: boolean;
  setDisableAutoDetach: (v: boolean) => void;
};

const ShortageSettingsContext = createContext<ShortageSettingsCtx | null>(null);

function useShortageSettingsCtx(): ShortageSettingsCtx {
  const ctx = useContext(ShortageSettingsContext);
  if (!ctx) {
    throw new Error("Picking shortage settings must be used inside PickingShortageSettingsProvider");
  }
  return ctx;
}

export type PickingShortageSettingsHandle = {
  save: () => Promise<boolean>;
  discard: () => Promise<void>;
};

export const PickingShortageSettingsProvider = forwardRef<
  PickingShortageSettingsHandle,
  {
    tenantId: number;
    warehouseId: number | null;
    statusOptionsFlat: Array<{ id: number; name: string }>;
    orderUiSummary: OrderUiStatusPanelSummary | null;
    panelSubgroups: OrderUiPanelSubgroupRead[];
    orderUiLoading: boolean;
    orderUiErr: string | null;
    onDirtyChange?: (dirty: boolean) => void;
    children: ReactNode;
  }
>(function PickingShortageSettingsProvider(
  {
    tenantId,
    warehouseId,
    statusOptionsFlat,
    orderUiSummary,
    panelSubgroups,
    orderUiLoading,
    orderUiErr,
    onDirtyChange,
    children,
  },
  ref,
) {
  const settingsLoadedOkRef = useRef(false);
  const legacyAutoEnqueueRef = useRef(true);
  const legacyPriorityRef = useRef<WmsShortageResolvePriorityApi>("high");
  const legacyAutoReopenRef = useRef(true);

  const [fatalLoadErr, setFatalLoadErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [reportedStatus, setReportedStatus] = useState<string>("");
  const [recoveryStatus, setRecoveryStatus] = useState<string>("");
  const [validationFailedStatus, setValidationFailedStatus] = useState<string>("");
  const [allowContinue, setAllowContinue] = useState(true);
  const [disableAutoDetach, setDisableAutoDetach] = useState(false);
  const [baselineFp, setBaselineFp] = useState<string | null>(null);

  useEffect(() => {
    settingsLoadedOkRef.current = false;
  }, [warehouseId]);

  useEffect(() => {
    if (warehouseId == null) setBaselineFp(null);
  }, [warehouseId]);

  const load = useCallback(async () => {
    if (warehouseId == null) {
      return;
    }
    setLoading(true);
    setFatalLoadErr(null);
    try {
      const rPromise = getWmsPickingShortageSettings(tenantId, warehouseId);
      const packingPromise = getWmsPackingSettings(tenantId, warehouseId).catch(() => null);
      const r = await rPromise;
      const packing = await packingPromise;
      const packingStartId =
        packing?.start_status_id != null && Number.isFinite(packing.start_status_id) && packing.start_status_id > 0
          ? packing.start_status_id
          : null;
      const statusIdSelectable = (id: number) => statusOptionsFlat.some((s) => s.id === id);

      settingsLoadedOkRef.current = true;
      const reported =
        r.shortage_reported_order_ui_status_id != null ? String(r.shortage_reported_order_ui_status_id) : "";
      let recoveryResolved = "";
      if (r.recovery_completed_order_ui_status_id != null) {
        recoveryResolved = String(r.recovery_completed_order_ui_status_id);
      } else if (packingStartId != null && statusIdSelectable(packingStartId)) {
        recoveryResolved = String(packingStartId);
      } else {
        recoveryResolved = "";
      }
      setReportedStatus(reported);
      setRecoveryStatus(recoveryResolved);
      const validationFailed =
        r.wms_validation_failed_order_ui_status_id != null
          ? String(r.wms_validation_failed_order_ui_status_id)
          : "";
      setValidationFailedStatus(validationFailed);
      setAllowContinue(r.allow_continue_other_lines_after_shortage);
      setDisableAutoDetach(Boolean(r.disable_auto_detach_missing_orders_from_carts));
      legacyAutoEnqueueRef.current = Boolean(r.auto_enqueue_braki);
      legacyPriorityRef.current = r.priority_after_shortage_resolved ?? "high";
      legacyAutoReopenRef.current = Boolean(r.auto_reopen_picking_after_shortage_resolved);
      setBaselineFp(
        fingerprint({
          reportedStatus: reported,
          recoveryStatus: recoveryResolved,
          validationFailedStatus: validationFailed,
          allowContinue: r.allow_continue_other_lines_after_shortage,
          disableAutoDetach: Boolean(r.disable_auto_detach_missing_orders_from_carts),
        }),
      );
    } catch {
      if (!settingsLoadedOkRef.current) {
        setFatalLoadErr("Nie udało się wczytać ustawień obsługi braków.");
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId, statusOptionsFlat]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = useCallback(async (): Promise<boolean> => {
    if (warehouseId == null) return false;
    setSaving(true);
    setSaveErr(null);
    setSaveOk(null);
    try {
      const rs = reportedStatus.trim() === "" ? null : Number(reportedStatus);
      const rc = recoveryStatus.trim() === "" ? null : Number(recoveryStatus);
      const vf = validationFailedStatus.trim() === "" ? null : Number(validationFailedStatus);
      await saveWmsPickingShortageSettings({
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        shortage_reported_order_ui_status_id: rs != null && Number.isFinite(rs) && rs > 0 ? rs : null,
        allow_continue_other_lines_after_shortage: allowContinue,
        recovery_completed_order_ui_status_id: rc != null && Number.isFinite(rc) && rc > 0 ? rc : null,
        wms_validation_failed_order_ui_status_id: vf != null && Number.isFinite(vf) && vf > 0 ? vf : null,
        disable_auto_detach_missing_orders_from_carts: disableAutoDetach,
        auto_enqueue_braki: legacyAutoEnqueueRef.current,
        priority_after_shortage_resolved: legacyPriorityRef.current,
        auto_reopen_picking_after_shortage_resolved: legacyAutoReopenRef.current,
      });
      setBaselineFp(
        fingerprint({
          reportedStatus,
          recoveryStatus,
          validationFailedStatus,
          allowContinue,
          disableAutoDetach,
        }),
      );
      setSaveOk("Zapisano.");
      window.setTimeout(() => setSaveOk(null), 3500);
      return true;
    } catch {
      setSaveErr("Zapis nie powiódł się.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    warehouseId,
    tenantId,
    reportedStatus,
    recoveryStatus,
    validationFailedStatus,
    allowContinue,
    disableAutoDetach,
  ]);

  const currentFp = useMemo(
    () =>
      fingerprint({
        reportedStatus,
        recoveryStatus,
        validationFailedStatus,
        allowContinue,
        disableAutoDetach,
      }),
    [reportedStatus, recoveryStatus, validationFailedStatus, allowContinue, disableAutoDetach],
  );

  const dirty = baselineFp != null && !fatalLoadErr && currentFp !== baselineFp;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useImperativeHandle(
    ref,
    () => ({
      save: () => onSave(),
      discard: async () => {
        await load();
      },
    }),
    [onSave, load],
  );

  const ctx = useMemo<ShortageSettingsCtx>(
    () => ({
      loading,
      saving,
      fatalLoadErr,
      saveErr,
      saveOk,
      orderUiErr,
      orderUiLoading,
      orderUiSummary,
      panelSubgroups,
      reportedStatus,
      setReportedStatus,
      recoveryStatus,
      setRecoveryStatus,
      validationFailedStatus,
      setValidationFailedStatus,
      allowContinue,
      setAllowContinue,
      disableAutoDetach,
      setDisableAutoDetach,
    }),
    [
      loading,
      saving,
      fatalLoadErr,
      saveErr,
      saveOk,
      orderUiErr,
      orderUiLoading,
      orderUiSummary,
      panelSubgroups,
      reportedStatus,
      recoveryStatus,
      validationFailedStatus,
      allowContinue,
      disableAutoDetach,
    ],
  );

  return <ShortageSettingsContext.Provider value={ctx}>{children}</ShortageSettingsContext.Provider>;
});

function ShortageStatusMessages() {
  const { orderUiErr, fatalLoadErr, saveErr, saveOk } = useShortageSettingsCtx();
  return (
    <>
      {orderUiErr ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{orderUiErr}</p>
      ) : null}
      {fatalLoadErr ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
          {fatalLoadErr}
        </p>
      ) : null}
      {saveErr ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">{saveErr}</p>
      ) : null}
      {saveOk ? (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900"
          role="status"
        >
          {saveOk}
        </p>
      ) : null}
    </>
  );
}

export function PickingShortageSettingsFields() {
  const ctx = useShortageSettingsCtx();
  if (ctx.loading || ctx.orderUiLoading) {
    return <p className="text-sm font-medium text-slate-500">Wczytywanie…</p>;
  }
  return (
    <div className="space-y-6">
      <ShortageStatusMessages />
      <SettingsSubsection title="Obsługa braku">
        <div className={wmsSettingsRowsStackClass}>
          <WmsControlSettingRow
            settingId="picking.shortage_reported_status"
            label="Status po zakończeniu zbierania z brakiem"
            hint="Status zostanie nadany po zakończeniu zbioru, jeżeli w zamówieniu pozostały zgłoszone braki."
          >
            <OrderUiStatusField
              panelSummary={ctx.orderUiSummary}
              panelSubgroups={ctx.panelSubgroups}
              selectedStatusId={statusIdFromSettingValue(ctx.reportedStatus)}
              onPick={(id) => ctx.setReportedStatus(id != null ? String(id) : "")}
              allowClear
              clearLabel="— Bez zmiany statusu"
              disabled={ctx.saving}
            />
          </WmsControlSettingRow>
          <WmsBoolSettingRow
            label="Pozwól magazynierowi zbierać pozostałe produkty po zgłoszeniu braku"
            hint="Po zgłoszeniu braku operator może kontynuować zbieranie pozostałych produktów z bieżącego zbioru."
            checked={ctx.allowContinue}
            onChange={ctx.setAllowContinue}
            disabled={ctx.saving}
          />
          <WmsBoolSettingRow
            label="Zostaw zamówienia z brakami na wózku"
            hint="Po zakończeniu zbioru zamówienie z brakiem pozostanie na wózku. Odznaczenie zwolni przypisanie tego zamówienia."
            checked={ctx.disableAutoDetach}
            onChange={ctx.setDisableAutoDetach}
            disabled={ctx.saving}
          />
        </div>
      </SettingsSubsection>
      <SettingsSubsection title="Po rozwiązaniu braków">
        <div className={wmsSettingsRowsStackClass}>
          <WmsControlSettingRow
            settingId="picking.recovery_completed_status"
            label="Status po rozwiązaniu wszystkich braków"
            hint="Status zostanie nadany po domknięciu całego workflow braków, gdy zamówienie będzie ponownie gotowe do dalszej realizacji."
          >
            <OrderUiStatusField
              panelSummary={ctx.orderUiSummary}
              panelSubgroups={ctx.panelSubgroups}
              selectedStatusId={statusIdFromSettingValue(ctx.recoveryStatus)}
              onPick={(id) => ctx.setRecoveryStatus(id != null ? String(id) : "")}
              allowClear
              clearLabel="— Jak w ustawieniach Pakowanie (status startu)"
              disabled={ctx.saving}
            />
          </WmsControlSettingRow>
        </div>
      </SettingsSubsection>
      <p className="border-t border-slate-200/50 pt-2 text-xs text-slate-500">
        Zapis zmian — przycisk „Zapisz” na dole strony.
      </p>
    </div>
  );
}

export function PickingPreAssignValidationFields() {
  const ctx = useShortageSettingsCtx();
  if (ctx.loading || ctx.orderUiLoading) {
    return <p className="text-sm font-medium text-slate-500">Wczytywanie…</p>;
  }
  return (
    <SettingsSubsection
      title="Walidacja zamówienia przed przydziałem"
      description="Przed przydzieleniem zamówienia do zbioru WMS sprawdza możliwość jego skompletowania. Zamówienie niespełniające warunków nie zajmuje pojemności zbioru."
    >
      <div className={wmsSettingsRowsStackClass}>
        <WmsControlSettingRow
          settingId="picking.pre_assign_validation_status"
          label="Status po błędzie walidacji"
          hint="Opcjonalny status panelu nadawany zamówieniu, które nie przejdzie walidacji WMS. Bez wybranego statusu zamówienie zostanie pominięte przy tworzeniu zbioru, ale jego status nie zostanie zmieniony."
        >
          <OrderUiStatusField
            panelSummary={ctx.orderUiSummary}
            panelSubgroups={ctx.panelSubgroups}
            selectedStatusId={statusIdFromSettingValue(ctx.validationFailedStatus)}
            onPick={(id) => ctx.setValidationFailedStatus(id != null ? String(id) : "")}
            allowClear
            clearLabel="— Bez zmiany statusu"
            disabled={ctx.saving}
          />
        </WmsControlSettingRow>
        <p className="text-xs leading-relaxed text-slate-500">
          Przykłady: brak lokalizacji pickingowej, niewystarczający stan, zablokowana lokalizacja, produkt niedostępny
          do zbierania.
        </p>
      </div>
    </SettingsSubsection>
  );
}
