/**
 * WMS picking settings panel — presentation + persistence orchestration.
 * Business fields / APIs unchanged; UX layout is modular.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { getOrderPanelSubgroups, getOrderUiStatusSummary } from "../../../api/orderUiStatusApi";
import {
  listPickingConfigs,
  replacePickingConfigsForWarehouse,
  type PickingConfigModeDb,
  type PickingConfigOrderSortDb,
  type WmsPickingConfigReadApi,
  type WmsPickingConfigReplaceItem,
} from "../../../api/wmsPickingConfigApi";
import { getWarehouseLocations, type WarehouseLocationItem } from "../../../api/warehouseGraphApi";
import { useWarehouse } from "../../../context/WarehouseContext";
import type {
  OrderUiMainGroup,
  OrderUiPanelSubgroupRead,
  OrderUiStatusPanelSummary,
} from "../../../types/orderUiStatus";
import { DAMAGE_TENANT_ID } from "../../../pages/damage/damageShared";
import toast from "react-hot-toast";
import {
  getWmsPickingShortageSettings,
  saveWmsPickingShortageSettings,
  type WmsShortageResolvePriorityApi,
} from "../../../api/wmsPickingShortageSettingsApi";
import {
  getWmsPickingTerminalSettings,
  saveWmsPickingTerminalSettings,
} from "../../../api/wmsPickingTerminalSettingsApi";
import { getWmsPackingSettings } from "../../../api/wmsPackingSettingsApi";
import type { WmsPickingExtendedUiSettings } from "../../../types/wmsPickingExtendedUi";
import {
  DEFAULT_WMS_PICKING_EXTENDED_UI,
  loadWmsPickingExtendedUi,
  saveWmsPickingExtendedUi,
} from "../../../types/wmsPickingExtendedUi";
import { loadCachedPickingConfigRows, saveCachedPickingConfigRows } from "../../../types/wmsPickingConfigLocalCache";
import { WmsSettingsSection } from "../../../pages/Settings/WmsSettingsSection";
import { SettingsSubsection } from "../../../pages/Settings/SettingsSubsection";
import { WmsSettingsTabFrame } from "../../../pages/Settings/WmsSettingsTabFrame";
import { SettingInfoButton } from "../../../pages/Settings/SettingInfoButton";
import {
  WmsBoolSettingRow,
  WmsControlSettingRow,
  wmsSettingControlInputClass,
  wmsSettingControlSelectClass,
  wmsSettingsRowsStackClass,
} from "../../../pages/Settings/wmsSettingsUi";
import { OrderUiStatusField } from "../../../components/orders/OrderUiStatusField";
import { buildOrderUiStatusNameById } from "../../../components/orders/automation/buildOrderUiStatusNameById";
import { Boxes, Clock3, FileText, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { OrderUiStatusConfigRowPresent } from "../../../components/orders/orderList/OrderUiStatusConfigRowPresent";
import { IconButton } from "../../../design-system";
import { brandPrimaryButtonClass } from "../../../design-system/brandUi";
import type { PanelConfigurableUiStatusBrief } from "../../../utils/panelListStatusBriefMappers";
import { PickingSettingsModal } from "./PickingSettingsModal";
import { WMS_PICKING_SETTINGS_NAV_SECTIONS } from "./pickingSettingsNavSections";
import {
  allowedPickingSourceStatusIds,
  allowedPickingTargetStatusIds,
  filterPanelSummaryByStatusIds,
  isStatusAllowedForPickingConfig,
  packingStartStatusIdsFromSettings,
} from "./pickingConfigStatusEligibility";
import { PICKING_TERMINAL_SETTING_HINTS } from "./pickingTerminalScanPolicy";
import {
  BY_PRODUCTS_ALL_CONTAINER_OPTIONS,
  BY_PRODUCTS_MULTI_CONTAINER_OPTIONS,
  BY_PRODUCTS_SINGLE_CONTAINER_OPTIONS,
  PICKING_COLLECTION_MODE_OPTIONS,
  ORDER_SORT_DATE_COURIER,
  ORDER_SORT_LOCATION_DATE_COURIER,
  LOCATION_ORDER_SORT_DISABLED_REASON,
  coerceConsolidationOrderSort,
  containerLabel,
  containerListLabel,
  ensureContainerInOptions,
  isLocationOrderSortDisabledForMultiContainer,
  orderSortListLabel,
  showsByOrdersOrderSort,
  showsByProductsOrderSort,
  singleItemOrderSortOptions,
  type PickingRadioOption,
} from "./pickingConfiguratorOptions";

const PANEL_STATUS_GROUP_ORDER: OrderUiMainGroup[] = ["NEW", "IN_PROGRESS", "DONE"];

/** Flat status list for name lookups / selectable-id checks — NEW → IN_PROGRESS → DONE, then sort_order. */
function flattenOrderUiStatusOptions(
  summary: OrderUiStatusPanelSummary | null,
): Array<{ id: number; name: string }> {
  if (!summary) return [];
  const byMain = new Map(summary.groups.map((g) => [g.main_group, g]));
  const out: Array<{ id: number; name: string }> = [];
  for (const mg of PANEL_STATUS_GROUP_ORDER) {
    const block = byMain.get(mg);
    if (!block) continue;
    const subs = [...block.sub_statuses].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    for (const s of subs) {
      out.push({ id: s.id, name: s.name });
    }
  }
  return out;
}

function statusIdFromSettingValue(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const BULK_ORDER_LIMIT_MAX = 100;
const BULK_ORDER_LIMIT_DEFAULT_SINGLE = "20";
const BULK_ORDER_LIMIT_DEFAULT_MULTI = "10";
const BULK_ORDER_LIMIT_DEFAULT_ALL = "30";

function parseBulkOrderLimitInput(
  raw: string,
  max: number,
): { ok: true; value: number } | { ok: false; message: string } {
  const s = raw.trim();
  if (s === "") return { ok: false, message: "Wymagana wartość." };
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, message: "Podaj liczbę całkowitą." };
  if (n <= 0) return { ok: false, message: "Wartość musi być większa od 0." };
  if (n > max) return { ok: false, message: `Maksimum ${max}.` };
  return { ok: true, value: n };
}

const selectClass = wmsSettingControlSelectClass;
const radioLabelClass =
  "flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 hover:bg-slate-50 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500/30";
const radioInputClass = "h-4 w-4 shrink-0 border-slate-300 text-blue-600 focus:ring-blue-500 bg-white cursor-pointer";

const textInputClassPicking = wmsSettingControlSelectClass;
const numberInputClass = wmsSettingControlInputClass;
const fieldHintClass = "mt-1.5 text-xs leading-relaxed text-slate-500";
const configBlockTitleClass = "text-sm font-semibold text-slate-900";

function stableStringifyPicking(v: unknown): string {
  if (v === null || v === undefined) return JSON.stringify(v);
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => stableStringifyPicking(x)).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringifyPicking(o[k])}`)
    .join(",")}}`;
}

function SectionCardPicking({
  id,
  title,
  summary,
  children,
}: {
  id: string;
  /** Gdy brak — nagłówek sekcji renderuje zawartość (np. lista konfiguratora). */
  title?: string;
  summary?: string;
  children: ReactNode;
}) {
  const meta = WMS_PICKING_SETTINGS_NAV_SECTIONS.find((s) => s.id === id);
  const heading = (title ?? "").trim();
  return (
    <WmsSettingsSection
      id={id}
      title={heading || undefined}
      summary={summary}
      icon={heading ? meta?.icon : undefined}
      iconClassName={meta?.iconClassName}
      searchText={meta?.searchText ?? meta?.label}
    >
      {children}
    </WmsSettingsSection>
  );
}

function SubsectionPicking({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <SettingsSubsection title={title} description={description}>
      {children}
    </SettingsSubsection>
  );
}

function FieldGridPicking({ children }: { children: ReactNode }) {
  return <div className={wmsSettingsRowsStackClass}>{children}</div>;
}

function BoolRowPicking({
  label,
  checked,
  onChange,
  help,
  title,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  help?: string;
  title?: string;
}) {
  return (
    <div title={title}>
      <WmsBoolSettingRow label={label} checked={checked} onChange={onChange} hint={help} />
    </div>
  );
}

function CustomCheckbox({
  checked,
  onChange,
  label,
  hint,
  disabled,
  settingId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  settingId?: string;
}) {
  return (
    <WmsBoolSettingRow
      label={label}
      hint={hint}
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      settingId={settingId}
    />
  );
}

const PRIORITY_OPTIONS: Array<{ value: WmsShortageResolvePriorityApi; label: string }> = [
  { value: "normal", label: "Normalna" },
  { value: "high", label: "Wysoka" },
  { value: "immediate_picking", label: "Natychmiast wróć do zbierania" },
];

function shortageUiFingerprint(params: {
  reportedStatus: string;
  recoveryStatus: string;
  validationFailedStatus: string;
  autoBraki: boolean;
  allowContinue: boolean;
  priority: WmsShortageResolvePriorityApi;
  autoReopen: boolean;
  disableAutoDetach: boolean;
}): string {
  return stableStringifyPicking(params);
}

export type PickingShortageSettingsHandle = {
  save: () => Promise<boolean>;
  discard: () => Promise<void>;
};

const PickingShortageSettingsPanel = forwardRef<
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
  }
>(function PickingShortageSettingsPanel(
  {
    tenantId,
    warehouseId,
    statusOptionsFlat,
    orderUiSummary,
    panelSubgroups,
    orderUiLoading,
    orderUiErr,
    onDirtyChange,
  },
  ref,
) {
  const settingsLoadedOkRef = useRef(false);
  const [fatalLoadErr, setFatalLoadErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [reportedStatus, setReportedStatus] = useState<string>("");
  const [recoveryStatus, setRecoveryStatus] = useState<string>("");
  const [validationFailedStatus, setValidationFailedStatus] = useState<string>("");
  const [autoBraki, setAutoBraki] = useState(true);
  const [allowContinue, setAllowContinue] = useState(true);
  const [priority, setPriority] = useState<WmsShortageResolvePriorityApi>("high");
  const [autoReopen, setAutoReopen] = useState(true);
  const [disableAutoDetach, setDisableAutoDetach] = useState(false);
  const [baselineShortageFp, setBaselineShortageFp] = useState<string | null>(null);

  useEffect(() => {
    settingsLoadedOkRef.current = false;
  }, [warehouseId]);

  useEffect(() => {
    if (warehouseId == null) setBaselineShortageFp(null);
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
      setAutoBraki(r.auto_enqueue_braki);
      setAllowContinue(r.allow_continue_other_lines_after_shortage);
      setPriority(r.priority_after_shortage_resolved ?? "high");
      setAutoReopen(r.auto_reopen_picking_after_shortage_resolved);
      setDisableAutoDetach(Boolean(r.disable_auto_detach_missing_orders_from_carts));
      setBaselineShortageFp(
        shortageUiFingerprint({
          reportedStatus: reported,
          recoveryStatus: recoveryResolved,
          validationFailedStatus: validationFailed,
          autoBraki: r.auto_enqueue_braki,
          allowContinue: r.allow_continue_other_lines_after_shortage,
          priority: r.priority_after_shortage_resolved ?? "high",
          autoReopen: r.auto_reopen_picking_after_shortage_resolved,
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
        auto_enqueue_braki: autoBraki,
        allow_continue_other_lines_after_shortage: allowContinue,
        priority_after_shortage_resolved: priority,
        auto_reopen_picking_after_shortage_resolved: autoReopen,
        recovery_completed_order_ui_status_id: rc != null && Number.isFinite(rc) && rc > 0 ? rc : null,
        wms_validation_failed_order_ui_status_id: vf != null && Number.isFinite(vf) && vf > 0 ? vf : null,
        disable_auto_detach_missing_orders_from_carts: disableAutoDetach,
      });
      setBaselineShortageFp(
        shortageUiFingerprint({
          reportedStatus,
          recoveryStatus,
          validationFailedStatus,
          autoBraki,
          allowContinue,
          priority,
          autoReopen,
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
    autoBraki,
    allowContinue,
    priority,
    autoReopen,
    disableAutoDetach,
  ]);

  const shortageCurrentFp = useMemo(
    () =>
      shortageUiFingerprint({
        reportedStatus,
        recoveryStatus,
        validationFailedStatus,
        autoBraki,
        allowContinue,
        priority,
        autoReopen,
        disableAutoDetach,
      }),
    [
      reportedStatus,
      recoveryStatus,
      validationFailedStatus,
      autoBraki,
      allowContinue,
      priority,
      autoReopen,
      disableAutoDetach,
    ],
  );

  const shortageDirty =
    baselineShortageFp != null && !fatalLoadErr && shortageCurrentFp !== baselineShortageFp;

  useEffect(() => {
    onDirtyChange?.(shortageDirty);
  }, [shortageDirty, onDirtyChange]);

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

  if (warehouseId == null) {
    return <p className="mt-4 text-sm text-slate-500">Wybierz magazyn w pasku u góry.</p>;
  }

  return (
    <div className="space-y-6">
      {orderUiErr ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{orderUiErr}</p>
      ) : null}
      {fatalLoadErr ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">{fatalLoadErr}</p>
      ) : null}
      {saveErr ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">{saveErr}</p>
      ) : null}
      {saveOk ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900" role="status">
          {saveOk}
        </p>
      ) : null}

      {loading || orderUiLoading ? (
        <p className="text-sm font-medium text-slate-500">Wczytywanie…</p>
      ) : (
        <div className={wmsSettingsRowsStackClass}>
          <WmsControlSettingRow label="Status zamówienia z brakującymi produktami">
            <OrderUiStatusField
              panelSummary={orderUiSummary}
              panelSubgroups={panelSubgroups}
              selectedStatusId={statusIdFromSettingValue(reportedStatus)}
              onPick={(id) => setReportedStatus(id != null ? String(id) : "")}
              allowClear
              clearLabel="— Bez zmiany statusu"
              disabled={saving}
            />
          </WmsControlSettingRow>

          <CustomCheckbox
            label="Pokaż zamówienie w zakładce Braki po zgłoszeniu braku"
            hint="Zamówienie trafi na listę do decyzji / uzupełnienia braków."
            checked={autoBraki}
            onChange={setAutoBraki}
            disabled={saving}
          />

          <CustomCheckbox
            label="Pozwól magazynierowi zbierać pozostałe produkty po zgłoszeniu braku"
            hint="Po zgłoszeniu braku można dalej zbierać inne pozycje z tego zamówienia."
            checked={allowContinue}
            onChange={setAllowContinue}
            disabled={saving}
          />

          <CustomCheckbox
            label="Wyłącz auto-odpinanie zamówień z brakami z wózków"
            hint="Odznaczone = po zakończeniu zbierania zamówienia z brakami są odpinane z wózka. Zaznaczone = zostają na wózku."
            checked={disableAutoDetach}
            onChange={setDisableAutoDetach}
            disabled={saving}
          />

          <WmsControlSettingRow
            label="Priorytet po rozwiązaniu problemu"
            hint="Określa jak szybko zamówienie wróci do realizacji."
          >
            <div className="space-y-1">
              {PRIORITY_OPTIONS.map((o) => (
                <label key={o.value} className={radioLabelClass}>
                  <input
                    type="radio"
                    className={radioInputClass}
                    name="shortage-priority"
                    value={o.value}
                    checked={priority === o.value}
                    onChange={() => setPriority(o.value)}
                    disabled={saving}
                  />
                  <span className="text-sm text-slate-800">{o.label}</span>
                </label>
              ))}
            </div>
          </WmsControlSettingRow>

          <CustomCheckbox
            label="Po rozwiązaniu problemu pokaż zamówienie ponownie w Zbieraniu"
            hint="Po podmianie produktu lub cofnięciu braku zamówienie wróci na listę zbierania."
            checked={autoReopen}
            onChange={setAutoReopen}
            disabled={saving}
          />

          <WmsControlSettingRow
            label="Status po zebraniu brakujących produktów"
            hint="Status ustawiany po zebraniu brakujących pozycji."
          >
            <OrderUiStatusField
              panelSummary={orderUiSummary}
              panelSubgroups={panelSubgroups}
              selectedStatusId={statusIdFromSettingValue(recoveryStatus)}
              onPick={(id) => setRecoveryStatus(id != null ? String(id) : "")}
              allowClear
              clearLabel="— Jak w ustawieniach Pakowanie (status startu)"
              disabled={saving}
            />
          </WmsControlSettingRow>

          <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 space-y-2">
            <h4 className="text-sm font-black uppercase tracking-widest text-amber-950">Walidacja WMS</h4>
            <p className={fieldHintClass}>
              Zamówienie, którego nie da się skompletować (brak lokalizacji / stock / blokada), nie wejdzie do Capacity.
              Bez wybranego statusu — gate działa, ale status panelu nie jest zmieniany.
            </p>
            <WmsControlSettingRow label="Status po błędzie walidacji">
              <OrderUiStatusField
                panelSummary={orderUiSummary}
                panelSubgroups={panelSubgroups}
                selectedStatusId={statusIdFromSettingValue(validationFailedStatus)}
                onPick={(id) => setValidationFailedStatus(id != null ? String(id) : "")}
                allowClear
                clearLabel="— Bez zmiany statusu (tylko gate)"
                disabled={saving}
              />
            </WmsControlSettingRow>
          </div>

          <p className="text-xs text-slate-500 pt-2 border-t border-slate-200/50">Zapis zmian — przycisk „Zapisz” na dole strony.</p>
        </div>
      )}
    </div>
  );
});

type PickingCollectionMethod = "orders" | "products";
type PickingBatchType = "single" | "multi";
type PickingContainers = "cart_no_scan" | "cart_scan" | "baskets" | "mobile_cart" | "consolidation_rack";
type PickingOrderStrategy = "locations" | "oldest_date";

type PickingMode = "by_orders" | "by_products";
type PickingOrderSort = PickingConfigOrderSortDb;
type PickingOrderTypeKey = "single_item" | "multi_item" | "all_item";

const PICKING_MODE_OPTIONS = PICKING_COLLECTION_MODE_OPTIONS;

type PickingBlockState = {
  collectionMethod: PickingCollectionMethod;
  batchType: PickingBatchType;
  batchOrderCount: string;
  containers: PickingContainers;
  orderStrategy: PickingOrderStrategy;
};

function createInitialPickingBlock(): PickingBlockState {
  return {
    collectionMethod: "orders",
    batchType: "single",
    batchOrderCount: "5",
    containers: "cart_no_scan",
    orderStrategy: "oldest_date",
  };
}

function createInitialPickingBlocks(): Record<PickingOrderTypeKey, PickingBlockState> {
  return {
    single_item: createInitialPickingBlock(),
    multi_item: createInitialPickingBlock(),
    all_item: { ...createInitialPickingBlock(), containers: "cart_scan" },
  };
}

type SavedPickingConfiguration = {
  id: string;
  statusToPickId: number;
  statusToPickName: string;
  statusAfterPickId: number;
  statusAfterPickName: string;
  statusOnShortageId: number | null;
  statusOnShortageName: string | null;
  pickingMode: PickingMode;
  orderSort: PickingOrderSort;
  /** Osobna kolejność doboru dla „Wszystkie zamówienia”. */
  allOrderSort: PickingOrderSort;
  blocks: Record<PickingOrderTypeKey, PickingBlockState>;
  isProductionMode: boolean;
  statusOnComponentShortageId: number | null;
  statusOnComponentShortageName: string | null;
  finishedGoodsBufferLocationId: number | null;
  finishedGoodsBufferLocationName: string | null;
  productionExecutionMethod: "WMS" | "PRINT";
  afterProductionAction: "STATUS_ONLY" | "OPEN_PACKING";
};

function fingerprintPickingConfigsWarehouseState(
  configs: SavedPickingConfiguration[],
  globalBulkSingle: string,
  globalBulkMulti: string,
  globalBulkAll: string,
): string {
  const sorted = [...configs].sort(
    (a, b) => a.statusToPickId - b.statusToPickId || String(a.id).localeCompare(String(b.id)),
  );
  return stableStringifyPicking({ cfgs: sorted, globalBulkSingle, globalBulkMulti, globalBulkAll });
}

type PickingConfigDraft = {
  id: string;
  statusToPick: string;
  statusAfterPick: string;
  statusToPickBlurred: boolean;
  statusAfterPickBlurred: boolean;
  pickingMode: PickingMode;
  orderSort: PickingOrderSort;
  allOrderSort: PickingOrderSort;
  blocks: Record<PickingOrderTypeKey, PickingBlockState>;
  isProductionMode: boolean;
  statusOnComponentShortage: string;
  finishedGoodsBufferLocationId: string;
  productionExecutionMethod: "WMS" | "PRINT";
  afterProductionAction: "STATUS_ONLY" | "OPEN_PACKING";
};

function fingerprintDraftForm(d: PickingConfigDraft): string {
  return stableStringifyPicking({
    statusToPick: d.statusToPick.trim(),
    statusAfterPick: d.statusAfterPick.trim(),
    pickingMode: d.pickingMode,
    orderSort: d.orderSort,
    allOrderSort: d.allOrderSort,
    blocks: d.blocks,
    isProductionMode: d.isProductionMode,
    statusOnComponentShortage: d.statusOnComponentShortage.trim(),
    finishedGoodsBufferLocationId: d.finishedGoodsBufferLocationId.trim(),
    productionExecutionMethod: d.productionExecutionMethod,
    afterProductionAction: d.afterProductionAction,
  });
}

function createEmptyDraft(): PickingConfigDraft {
  const pickingModeDefault: PickingMode = "by_orders";
  return {
    id: `draft-${crypto.randomUUID()}`,
    statusToPick: "",
    statusAfterPick: "",
    statusToPickBlurred: false,
    statusAfterPickBlurred: false,
    pickingMode: pickingModeDefault,
    orderSort: "date",
    allOrderSort: "date",
    blocks: normalizeBlocksForPickingMode(createInitialPickingBlocks(), pickingModeDefault),
    isProductionMode: false,
    statusOnComponentShortage: "",
    finishedGoodsBufferLocationId: "",
    productionExecutionMethod: "WMS",
    afterProductionAction: "STATUS_ONLY",
  };
}

function blocksShapeForMode(mode: PickingMode): {
  collectionMethod: PickingCollectionMethod;
  orderStrategy: PickingOrderStrategy;
} {
  return mode === "by_orders"
    ? { collectionMethod: "orders", orderStrategy: "oldest_date" }
    : { collectionMethod: "products", orderStrategy: "locations" };
}

function normalizeBlocksForPickingMode(
  blocks: Record<PickingOrderTypeKey, PickingBlockState>,
  mode: PickingMode,
): Record<PickingOrderTypeKey, PickingBlockState> {
  const shape = blocksShapeForMode(mode);
  let single: PickingBlockState = { ...blocks.single_item, ...shape };
  let multi: PickingBlockState = { ...blocks.multi_item, ...shape };
  let allBlock: PickingBlockState = {
    ...(blocks.all_item ?? createInitialPickingBlock()),
    ...shape,
  };
  if (mode === "by_products") {
    single = {
      ...single,
      containers: ensureContainerInOptions(
        single.containers,
        BY_PRODUCTS_SINGLE_CONTAINER_OPTIONS,
        "cart_scan",
      ),
    };
    multi = {
      ...multi,
      containers: ensureContainerInOptions(
        multi.containers,
        BY_PRODUCTS_MULTI_CONTAINER_OPTIONS,
        "baskets",
      ),
    };
    allBlock = {
      ...allBlock,
      containers: ensureContainerInOptions(
        allBlock.containers,
        BY_PRODUCTS_ALL_CONTAINER_OPTIONS,
        "cart_scan",
      ),
    };
  }
  if (single.containers === "consolidation_rack") {
    single = { ...single, containers: "cart_scan" };
  }
  if (
    allBlock.containers === "consolidation_rack" ||
    allBlock.containers === "mobile_cart"
  ) {
    allBlock = { ...allBlock, containers: "cart_scan" };
  }
  return { single_item: single, multi_item: multi, all_item: allBlock };
}

function pickingModeLabel(mode: PickingMode): string {
  return PICKING_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? mode;
}

function pickingOrderSortLabel(sort: PickingOrderSort): string {
  return ORDER_SORT_LOCATION_DATE_COURIER.find((o) => o.value === sort)?.label ?? sort;
}

function dbModeToContainers(m: PickingConfigModeDb): PickingContainers {
  if (m === "bulk") return "cart_no_scan";
  if (m === "scanned") return "cart_scan";
  if (m === "baskets") return "baskets";
  if (m === "consolidation_rack") return "consolidation_rack";
  return "mobile_cart";
}

function mapApiPickingRowToSaved(row: WmsPickingConfigReadApi): SavedPickingConfiguration {
  const pickingMode: PickingMode = row.pick_unit === "products" ? "by_products" : "by_orders";
  const strategyShape = blocksShapeForMode(pickingMode);
  const mk = (mode: PickingConfigModeDb): PickingBlockState => ({
    collectionMethod: strategyShape.collectionMethod,
    batchType: "single",
    batchOrderCount: "5",
    containers: dbModeToContainers(mode),
    orderStrategy: strategyShape.orderStrategy,
  });
  const rawAllMode = row.all_mode;
  const allModeDb: PickingConfigModeDb =
    rawAllMode === "bulk" || rawAllMode === "scanned" || rawAllMode === "baskets"
      ? rawAllMode
      : "bulk";
  const blocks = normalizeBlocksForPickingMode(
    {
      single_item: mk(row.single_mode),
      multi_item: mk(row.multi_mode),
      all_item: mk(allModeDb),
    },
    pickingMode,
  );
  const rawSort = row.order_sort;
  const orderSort: PickingOrderSort =
    rawSort === "location" || rawSort === "courier" || rawSort === "date" ? rawSort : "date";
  const rawAllSort = row.all_order_sort;
  const allOrderSort: PickingOrderSort =
    rawAllSort === "location" || rawAllSort === "courier" || rawAllSort === "date"
      ? rawAllSort
      : orderSort;
  return {
    id: String(row.id),
    statusToPickId: row.source_status_id,
    statusToPickName: row.source_status_name?.trim() || `Status #${row.source_status_id}`,
    statusAfterPickId: row.is_production_mode
      ? Number(row.status_after_production_id ?? row.target_status_id)
      : row.target_status_id,
    statusAfterPickName: row.is_production_mode
      ? row.status_after_production_name?.trim() ||
        row.target_status_name?.trim() ||
        `Status #${row.status_after_production_id ?? row.target_status_id}`
      : row.target_status_name?.trim() || `Status #${row.target_status_id}`,
    statusOnShortageId: null,
    statusOnShortageName: null,
    pickingMode,
    orderSort,
    allOrderSort,
    blocks,
    isProductionMode: Boolean(row.is_production_mode),
    statusOnComponentShortageId: row.status_on_component_shortage_id ?? null,
    statusOnComponentShortageName: row.status_on_component_shortage_name?.trim() || null,
    finishedGoodsBufferLocationId: row.finished_goods_buffer_location_id ?? null,
    finishedGoodsBufferLocationName: row.finished_goods_buffer_location_name?.trim() || null,
    productionExecutionMethod: row.production_execution_method === "PRINT" ? "PRINT" : "WMS",
    afterProductionAction: row.after_production_action === "OPEN_PACKING" ? "OPEN_PACKING" : "STATUS_ONLY",
  };
}

function uiContainersToDbMode(c: PickingContainers): PickingConfigModeDb {
  if (c === "cart_no_scan") return "bulk";
  if (c === "cart_scan") return "scanned";
  if (c === "baskets") return "baskets";
  if (c === "consolidation_rack") return "consolidation_rack";
  return "mobile";
}

function validateSavedConfigForServer(
  cfg: SavedPickingConfiguration,
  eligibility: {
    summary: OrderUiStatusPanelSummary | null;
    packingStartStatusIds: number[];
    otherSourceIds: number[];
  },
  allConfigs: SavedPickingConfiguration[],
): string | null {
  if (cfg.statusToPickId === cfg.statusAfterPickId) {
    return cfg.isProductionMode
      ? `Reguła „${cfg.statusToPickName}”: status wejściowy produkcji i status po wyprodukowaniu muszą się różnić.`
      : `Reguła „${cfg.statusToPickName}”: status do zbierania i po zebraniu muszą się różnić.`;
  }
  if (!eligibility.summary) {
    return "Statusy panelu zamówień nie są jeszcze wczytane — odśwież stronę i spróbuj ponownie.";
  }

  if (cfg.isProductionMode) {
    if (cfg.statusOnComponentShortageId == null) {
      return `Reguła „${cfg.statusToPickName}”: wybierz status przy braku komponentów.`;
    }
    if (cfg.statusOnComponentShortageId === cfg.statusToPickId) {
      return `Reguła „${cfg.statusToPickName}”: status przy braku komponentów musi być inny niż status wejściowy.`;
    }
    if (cfg.finishedGoodsBufferLocationId == null) {
      return `Reguła „${cfg.statusToPickName}”: wybierz lokalizację buforową produktu gotowego.`;
    }
    const prodDup = allConfigs.filter(
      (c) => c.isProductionMode && c.statusToPickId === cfg.statusToPickId && c.id !== cfg.id,
    );
    if (prodDup.length > 0) {
      return `Status wejściowy produkcji „${cfg.statusToPickName}” może wystąpić tylko w jednej konfiguracji produkcyjnej.`;
    }
    const asStandard = allConfigs.some(
      (c) => !c.isProductionMode && c.statusToPickId === cfg.statusToPickId && c.id !== cfg.id,
    );
    if (asStandard) {
      return `Status produkcyjny „${cfg.statusToPickName}” nie może jednocześnie być statusem standardowego zbierania.`;
    }
    const afterAsStandardSource = allConfigs.some(
      (c) => !c.isProductionMode && c.statusToPickId === cfg.statusAfterPickId,
    );
    if (afterAsStandardSource) {
      return `Status po wyprodukowaniu nie może być statusem wejściowym standardowego zbierania.`;
    }
    const afterAsProdSource = allConfigs.some(
      (c) => c.isProductionMode && c.statusToPickId === cfg.statusAfterPickId,
    );
    if (afterAsProdSource) {
      return `Status po wyprodukowaniu nie może być statusem wejściowym innego trybu produkcji.`;
    }
    const afterDup = allConfigs.filter(
      (c) =>
        c.isProductionMode &&
        c.statusAfterPickId === cfg.statusAfterPickId &&
        c.id !== cfg.id,
    );
    if (afterDup.length > 0) {
      return `Status po wyprodukowaniu może być przypisany tylko do jednej konfiguracji produkcyjnej.`;
    }
    return null;
  }

  const sourceAllowed = allowedPickingSourceStatusIds({
    summary: eligibility.summary,
    excludeSourceIds: eligibility.otherSourceIds,
  });
  const targetAllowed = allowedPickingTargetStatusIds({
    summary: eligibility.summary,
    packingStartStatusIds: eligibility.packingStartStatusIds,
  });
  if (!isStatusAllowedForPickingConfig(cfg.statusToPickId, sourceAllowed)) {
    return `Reguła „${cfg.statusToPickName}”: status do zbierania nie jest dostępny dla procesu zbierania. Wybierz inny status.`;
  }
  if (!isStatusAllowedForPickingConfig(cfg.statusAfterPickId, targetAllowed)) {
    return `Reguła „${cfg.statusToPickName}”: status po zbieraniu nie jest dostępny dla procesu zbierania. Wybierz inny status.`;
  }
  const asProduction = allConfigs.some(
    (c) => c.isProductionMode && c.statusToPickId === cfg.statusToPickId && c.id !== cfg.id,
  );
  if (asProduction) {
    return `Status „${cfg.statusToPickName}” jest już używany jako wejście produkcji — nie może być standardowym zbieraniem.`;
  }
  const afterFromProduction = allConfigs.some(
    (c) => c.isProductionMode && c.statusAfterPickId === cfg.statusToPickId,
  );
  if (afterFromProduction) {
    return `Status „${cfg.statusToPickName}” jest statusem po wyprodukowaniu — nie może być wejściem standardowego zbierania.`;
  }
  if (cfg.blocks.single_item.containers === "consolidation_rack") {
    return `Reguła „${cfg.statusToPickName}”: regał kompletacyjny jest dostępny tylko dla zamówień wieloelementowych.`;
  }
  const allContainers = cfg.blocks.all_item?.containers;
  if (allContainers === "mobile_cart" || allContainers === "consolidation_rack") {
    return `Reguła „${cfg.statusToPickName}”: „Wszystkie zamówienia” nie obsługuje wybranej metody zbierania.`;
  }
  if (cfg.pickingMode === "by_products" && !allContainers) {
    return `Reguła „${cfg.statusToPickName}”: uzupełnij konfigurację „Wszystkie zamówienia”.`;
  }
  if (
    cfg.pickingMode === "by_products" &&
    isLocationOrderSortDisabledForMultiContainer(cfg.blocks.multi_item.containers) &&
    cfg.orderSort === "location"
  ) {
    return `Reguła „${cfg.statusToPickName}”: ${LOCATION_ORDER_SORT_DISABLED_REASON} Wybierz dobór po dacie lub grupach kurierskich.`;
  }
  if (
    cfg.pickingMode === "by_products" &&
    (cfg.allOrderSort !== "date" &&
      cfg.allOrderSort !== "location" &&
      cfg.allOrderSort !== "courier")
  ) {
    return `Reguła „${cfg.statusToPickName}”: wybierz sposób doboru dla „Wszystkie zamówienia”.`;
  }
  return null;
}

function validateGlobalBulkLimitsForWarehouse(
  configs: SavedPickingConfiguration[],
  globalBulkSingle: string,
  globalBulkMulti: string,
  globalBulkAll: string,
): string | null {
  const needsSingle = configs.some((c) => c.blocks.single_item.containers === "cart_no_scan");
  const needsMulti = configs.some((c) => c.blocks.multi_item.containers === "cart_no_scan");
  const needsAll = configs.some((c) => c.blocks.all_item?.containers === "cart_no_scan");
  if (needsSingle) {
    const p = parseBulkOrderLimitInput(globalBulkSingle, BULK_ORDER_LIMIT_MAX);
    if (!p.ok) return `Limity zbioru (magazyn) — jednoelementowe: ${p.message}`;
  }
  if (needsMulti) {
    const p = parseBulkOrderLimitInput(globalBulkMulti, BULK_ORDER_LIMIT_MAX);
    if (!p.ok) return `Limity zbioru (magazyn) — wieloelementowe: ${p.message}`;
  }
  if (needsAll) {
    const p = parseBulkOrderLimitInput(globalBulkAll, BULK_ORDER_LIMIT_MAX);
    if (!p.ok) return `Limity zbioru (magazyn) — wszystkie zamówienia: ${p.message}`;
  }
  return null;
}

function savedConfigToReplaceItem(
  cfg: SavedPickingConfiguration,
  globalBulk: { single: string; multi: string; all: string },
): WmsPickingConfigReplaceItem {
  const singleMode = uiContainersToDbMode(cfg.blocks.single_item.containers);
  const multiMode = uiContainersToDbMode(cfg.blocks.multi_item.containers);
  const allMode = uiContainersToDbMode(
    ensureContainerInOptions(
      cfg.blocks.all_item?.containers ?? "cart_scan",
      BY_PRODUCTS_ALL_CONTAINER_OPTIONS,
      "cart_scan",
    ),
  );
  const pick_unit = cfg.pickingMode === "by_products" ? "products" : "orders";
  let order_sort: PickingConfigOrderSortDb = cfg.orderSort;
  if (
    cfg.pickingMode === "by_products" &&
    cfg.blocks.multi_item.containers === "consolidation_rack"
  ) {
    order_sort = coerceConsolidationOrderSort(cfg.orderSort);
  }
  const all_order_sort: PickingConfigOrderSortDb =
    cfg.allOrderSort === "location" || cfg.allOrderSort === "courier" || cfg.allOrderSort === "date"
      ? cfg.allOrderSort
      : order_sort;
  let max_single_orders: number | null;
  if (singleMode === "bulk") {
    const p = parseBulkOrderLimitInput(globalBulk.single, BULK_ORDER_LIMIT_MAX);
    if (!p.ok) throw new Error(p.message);
    max_single_orders = p.value;
  } else {
    max_single_orders = null;
  }
  let max_multi_orders: number | null;
  if (multiMode === "bulk") {
    const p = parseBulkOrderLimitInput(globalBulk.multi, BULK_ORDER_LIMIT_MAX);
    if (!p.ok) throw new Error(p.message);
    max_multi_orders = p.value;
  } else {
    max_multi_orders = null;
  }
  let max_all_orders: number | null;
  if (allMode === "bulk") {
    const p = parseBulkOrderLimitInput(globalBulk.all, BULK_ORDER_LIMIT_MAX);
    if (!p.ok) throw new Error(p.message);
    max_all_orders = p.value;
  } else {
    max_all_orders = null;
  }
  return {
    source_status_id: cfg.statusToPickId,
    target_status_id: cfg.statusAfterPickId,
    status_on_shortage_id: null,
    single_mode: singleMode,
    multi_mode: multiMode,
    all_mode: allMode,
    pick_unit,
    order_sort,
    all_order_sort,
    max_single_orders,
    max_multi_orders,
    max_all_orders,
    is_production_mode: cfg.isProductionMode,
    status_after_production_id: cfg.isProductionMode ? cfg.statusAfterPickId : null,
    status_on_component_shortage_id: cfg.isProductionMode ? cfg.statusOnComponentShortageId : null,
    finished_goods_buffer_location_id: cfg.isProductionMode
      ? cfg.finishedGoodsBufferLocationId
      : null,
    production_order_trigger_scope: cfg.isProductionMode ? "SINGLE_ELEMENT" : null,
    production_execution_method: cfg.isProductionMode ? cfg.productionExecutionMethod : null,
    after_production_action: cfg.isProductionMode ? cfg.afterProductionAction : null,
  };
}

function savedConfigurationToDraft(cfg: SavedPickingConfiguration): PickingConfigDraft {
  return {
    id: `draft-${crypto.randomUUID()}`,
    statusToPick: String(cfg.statusToPickId),
    statusAfterPick: String(cfg.statusAfterPickId),
    statusToPickBlurred: false,
    statusAfterPickBlurred: false,
    pickingMode: cfg.pickingMode,
    orderSort: cfg.orderSort,
    allOrderSort: cfg.allOrderSort,
    blocks: normalizeBlocksForPickingMode(
      {
        single_item: { ...cfg.blocks.single_item },
        multi_item: { ...cfg.blocks.multi_item },
        all_item: { ...(cfg.blocks.all_item ?? createInitialPickingBlock()) },
      },
      cfg.pickingMode,
    ),
    isProductionMode: cfg.isProductionMode,
    statusOnComponentShortage:
      cfg.statusOnComponentShortageId != null ? String(cfg.statusOnComponentShortageId) : "",
    finishedGoodsBufferLocationId:
      cfg.finishedGoodsBufferLocationId != null ? String(cfg.finishedGoodsBufferLocationId) : "",
    productionExecutionMethod: cfg.productionExecutionMethod === "PRINT" ? "PRINT" : "WMS",
    afterProductionAction: cfg.afterProductionAction === "OPEN_PACKING" ? "OPEN_PACKING" : "STATUS_ONLY",
  };
}

function pickingWhereLabel(mode: PickingContainers, orderType: PickingOrderTypeKey = "multi_item"): string {
  if (orderType === "single_item") {
    return containerLabel(mode, BY_PRODUCTS_SINGLE_CONTAINER_OPTIONS);
  }
  return containerLabel(mode, BY_PRODUCTS_MULTI_CONTAINER_OPTIONS);
}

function PickingRadioGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: Array<PickingRadioOption<T>>;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-900">{legend}</p>
      <div className="mt-2 flex flex-col gap-1.5" role="radiogroup" aria-label={legend}>
        {options.map((opt) => {
          const selected = value === opt.value;
          const disabled = Boolean(opt.disabled);
          return (
            <label
              key={opt.value}
              className={[
                "flex items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors",
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                selected
                  ? "border-blue-500 bg-blue-50/40 ring-1 ring-blue-500/15"
                  : "border-slate-200 bg-white hover:border-slate-300",
                disabled && !selected ? "hover:border-slate-200" : "",
              ].join(" ")}
            >
              <input
                type="radio"
                name={name}
                className={`${radioInputClass} mt-0.5`}
                checked={selected}
                disabled={disabled}
                onChange={() => {
                  if (!disabled) onChange(opt.value);
                }}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-snug text-slate-900">{opt.label}</span>
                {disabled && opt.disabledReason ? (
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">{opt.disabledReason}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function PickingNestedOrderSort({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: PickingOrderSort;
  options: Array<PickingRadioOption<PickingOrderSort>>;
  onChange: (v: PickingOrderSort) => void;
}) {
  // Nie podstawiaj pierwszej opcji, gdy wartość jest poza listą / wyłączona —
  // użytkownik ma widzieć stan zapisany i wybrać dozwoloną opcję.
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
      <PickingRadioGroup
        legend={legend}
        name={name}
        value={value}
        options={options}
        onChange={onChange}
      />
    </div>
  );
}

function WmsPickingLogisticsBulkLimitsSection({
  visible,
  showSingleField,
  showMultiField,
  showAllField,
  maxSingleItemOrders,
  maxMultiItemOrders,
  maxAllOrders,
  onChangeMaxSingle,
  onChangeMaxMulti,
  onChangeMaxAll,
  onBlurMaxSingle,
  onBlurMaxMulti,
  onBlurMaxAll,
  errorSingle,
  errorMulti,
  errorAll,
}: {
  visible: boolean;
  showSingleField: boolean;
  showMultiField: boolean;
  showAllField: boolean;
  maxSingleItemOrders: string;
  maxMultiItemOrders: string;
  maxAllOrders: string;
  onChangeMaxSingle: (v: string) => void;
  onChangeMaxMulti: (v: string) => void;
  onChangeMaxAll: (v: string) => void;
  onBlurMaxSingle: () => void;
  onBlurMaxMulti: () => void;
  onBlurMaxAll: () => void;
  errorSingle: string | null;
  errorMulti: string | null;
  errorAll: string | null;
}) {
  if (!visible) return null;

  const inputErr = " border-red-400 focus-visible:ring-red-500/35";

  return (
    <div className="mt-5 space-y-4">
      <div>
        <h3 className={configBlockTitleClass}>Limity zbioru (bez wymuszenia skanowania)</h3>
        <p className={fieldHintClass}>
          Jedna para wartości na cały magazyn. Stosowane tylko tam, gdzie w konfiguratorze wybrano „Wózek (bez
          skanowania)” — przy skanie lub koszykach limity wynikają z ustawień wózka.
        </p>
      </div>
      <div className={wmsSettingsRowsStackClass}>
        {showSingleField ? (
          <WmsControlSettingRow
            asLabel
            label="Maksymalna liczba zamówień (jednoelementowe)"
            footer={
              errorSingle ? (
                <p className="mt-1 text-xs font-medium text-red-700" role="alert">
                  {errorSingle}
                </p>
              ) : null
            }
          >
            <input
              type="number"
              min={1}
              max={BULK_ORDER_LIMIT_MAX}
              step={1}
              className={[numberInputClass, errorSingle ? inputErr : ""].join(" ")}
              value={maxSingleItemOrders}
              onChange={(e) => onChangeMaxSingle(e.target.value)}
              onBlur={onBlurMaxSingle}
              aria-invalid={Boolean(errorSingle)}
            />
          </WmsControlSettingRow>
        ) : null}
        {showMultiField ? (
          <WmsControlSettingRow
            asLabel
            label="Maksymalna liczba zamówień (wieloelementowe)"
            footer={
              errorMulti ? (
                <p className="mt-1 text-xs font-medium text-red-700" role="alert">
                  {errorMulti}
                </p>
              ) : null
            }
          >
            <input
              type="number"
              min={1}
              max={BULK_ORDER_LIMIT_MAX}
              step={1}
              className={[numberInputClass, errorMulti ? inputErr : ""].join(" ")}
              value={maxMultiItemOrders}
              onChange={(e) => onChangeMaxMulti(e.target.value)}
              onBlur={onBlurMaxMulti}
              aria-invalid={Boolean(errorMulti)}
            />
          </WmsControlSettingRow>
        ) : null}
        {showAllField ? (
          <WmsControlSettingRow
            asLabel
            label="Maksymalna liczba zamówień (wszystkie)"
            footer={
              errorAll ? (
                <p className="mt-1 text-xs font-medium text-red-700" role="alert">
                  {errorAll}
                </p>
              ) : null
            }
          >
            <input
              type="number"
              min={1}
              max={BULK_ORDER_LIMIT_MAX}
              step={1}
              className={[numberInputClass, errorAll ? inputErr : ""].join(" ")}
              value={maxAllOrders}
              onChange={(e) => onChangeMaxAll(e.target.value)}
              onBlur={onBlurMaxAll}
              aria-invalid={Boolean(errorAll)}
            />
          </WmsControlSettingRow>
        ) : null}
      </div>
    </div>
  );
}

function PickingConfiguratorEditor({
  fieldIdPrefix,
  warehouseId,
  orderUiSummary,
  panelSubgroups,
  orderUiLoading,
  orderUiErr,
  excludeSourceStatusIds,
  packingStartStatusIds,
  statusToPick,
  statusAfterPick,
  onStatusToPickChange,
  onStatusAfterPickChange,
  onStatusToPickBlur,
  onStatusAfterPickBlur,
  statusToPickShowError,
  statusAfterPickShowError,
  statusPairConflict,
  pickingMode,
  onPickingModeChange,
  orderSort,
  onOrderSortChange,
  allOrderSort,
  onAllOrderSortChange,
  blocks,
  patchBlock,
  isProductionMode,
  onIsProductionModeChange,
  statusOnComponentShortage,
  onStatusOnComponentShortageChange,
  finishedGoodsBufferLocationId,
  onFinishedGoodsBufferLocationIdChange,
  productionExecutionMethod,
  onProductionExecutionMethodChange,
  afterProductionAction,
  onAfterProductionActionChange,
  bufferLocations,
}: {
  fieldIdPrefix: string;
  warehouseId: number | null;
  orderUiSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
  orderUiLoading: boolean;
  orderUiErr: string | null;
  excludeSourceStatusIds: number[];
  packingStartStatusIds: number[];
  statusToPick: string;
  statusAfterPick: string;
  onStatusToPickChange: (v: string) => void;
  onStatusAfterPickChange: (v: string) => void;
  onStatusToPickBlur: () => void;
  onStatusAfterPickBlur: () => void;
  statusToPickShowError: boolean;
  statusAfterPickShowError: boolean;
  statusPairConflict: boolean;
  pickingMode: PickingMode;
  onPickingModeChange: (mode: PickingMode) => void;
  orderSort: PickingOrderSort;
  onOrderSortChange: (sort: PickingOrderSort) => void;
  allOrderSort: PickingOrderSort;
  onAllOrderSortChange: (sort: PickingOrderSort) => void;
  blocks: Record<PickingOrderTypeKey, PickingBlockState>;
  patchBlock: (key: PickingOrderTypeKey, patch: Partial<PickingBlockState>) => void;
  isProductionMode: boolean;
  onIsProductionModeChange: (v: boolean) => void;
  statusOnComponentShortage: string;
  onStatusOnComponentShortageChange: (v: string) => void;
  finishedGoodsBufferLocationId: string;
  onFinishedGoodsBufferLocationIdChange: (v: string) => void;
  productionExecutionMethod: "WMS" | "PRINT";
  onProductionExecutionMethodChange: (v: "WMS" | "PRINT") => void;
  afterProductionAction: "STATUS_ONLY" | "OPEN_PACKING";
  onAfterProductionActionChange: (v: "STATUS_ONLY" | "OPEN_PACKING") => void;
  bufferLocations: WarehouseLocationItem[];
}) {
  const statusNameById = useMemo(() => buildOrderUiStatusNameById(orderUiSummary), [orderUiSummary]);

  const sourceAllowedIds = useMemo(
    () =>
      allowedPickingSourceStatusIds({
        summary: orderUiSummary,
        excludeSourceIds: excludeSourceStatusIds,
      }),
    [orderUiSummary, excludeSourceStatusIds],
  );
  const targetAllowedIds = useMemo(
    () =>
      allowedPickingTargetStatusIds({
        summary: orderUiSummary,
        packingStartStatusIds,
      }),
    [orderUiSummary, packingStartStatusIds],
  );

  const selectedSourceId = statusIdFromSettingValue(statusToPick);
  const selectedTargetId = statusIdFromSettingValue(statusAfterPick);
  const selectedShortageId = statusIdFromSettingValue(statusOnComponentShortage);

  const sourcePanelSummary = useMemo(
    () =>
      isProductionMode
        ? orderUiSummary
        : filterPanelSummaryByStatusIds(orderUiSummary, sourceAllowedIds),
    [orderUiSummary, sourceAllowedIds, isProductionMode],
  );
  const targetPanelSummary = useMemo(
    () =>
      isProductionMode
        ? orderUiSummary
        : filterPanelSummaryByStatusIds(orderUiSummary, targetAllowedIds),
    [orderUiSummary, targetAllowedIds, isProductionMode],
  );

  const selectDisabled =
    warehouseId == null ||
    orderUiLoading ||
    orderUiErr != null ||
    (!isProductionMode && sourceAllowedIds.size === 0 && targetAllowedIds.size === 0);

  const canPickStatus = !selectDisabled;
  const statusToPickRequired = canPickStatus && statusToPickShowError && statusToPick === "";
  const statusAfterPickRequired = canPickStatus && statusAfterPickShowError && statusAfterPick === "";
  const statusToPickUnavailable =
    !isProductionMode &&
    canPickStatus &&
    selectedSourceId != null &&
    !isStatusAllowedForPickingConfig(selectedSourceId, sourceAllowedIds);
  const statusAfterPickUnavailable =
    !isProductionMode &&
    canPickStatus &&
    selectedTargetId != null &&
    !isStatusAllowedForPickingConfig(selectedTargetId, targetAllowedIds);

  const multiContainers = blocks.multi_item.containers;
  const singleContainers = blocks.single_item.containers;
  const allContainers = blocks.all_item.containers;
  const showByOrdersSort = showsByOrdersOrderSort(pickingMode);
  const showByProductsOrderSort = showsByProductsOrderSort(pickingMode);
  const byProducts = pickingMode === "by_products";
  const singleOrderSortOptions = singleItemOrderSortOptions(multiContainers);

  return (
    <div className="space-y-4" aria-label="Konfigurator trybu zbierania">
      {warehouseId == null ? (
        <p className="text-sm text-amber-800">Wybierz magazyn, aby wczytać statusy panelu zamówień.</p>
      ) : null}
      {orderUiErr ? <p className="text-sm text-red-700">{orderUiErr}</p> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-3.5">
        <CustomCheckbox
          label="Tryb produkcji"
          hint="Nie jest zwykłym pickingiem — konfiguracja statusów i bufora dla produkcji z zamówień (tylko zamówienia jednoelementowe)."
          checked={isProductionMode}
          onChange={onIsProductionModeChange}
        />
      </div>

      {!orderUiLoading &&
      warehouseId != null &&
      orderUiErr == null &&
      !isProductionMode &&
      sourceAllowedIds.size === 0 ? (
        <p className="text-sm text-slate-600">
          Brak statusów, z których można rozpocząć zbieranie. Dodaj aktywne statusy w grupie NOWE / W TOKU
          w ustawieniach zamówień (statusy panelu).
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 min-[720px]:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="text-sm font-semibold text-slate-900">
              {isProductionMode ? "Status do rozpoczęcia produkcji" : "Status do zbierania"}
              <span className="ml-1 text-red-600" aria-hidden>
                *
              </span>
            </p>
            <SettingInfoButton
              title={isProductionMode ? "Status do rozpoczęcia produkcji" : "Status do zbierania"}
              description={
                isProductionMode
                  ? "Status zamówienia, z którego startuje produkcja z zamówień."
                  : "Wybierz status zamówienia, z którego startuje zbieranie. Każdy status może mieć jedną konfigurację."
              }
            />
          </div>
          <div className="mt-3">
            <OrderUiStatusField
              panelSummary={sourcePanelSummary}
              panelSubgroups={panelSubgroups}
              statusNameById={statusNameById}
              selectedStatusId={selectedSourceId}
              onPick={(id) => {
                onStatusToPickChange(id != null ? String(id) : "");
                onStatusToPickBlur();
              }}
              allowClear
              clearLabel="— wybierz —"
              placeholder="Wybierz status zamówienia…"
              disabled={selectDisabled || (!isProductionMode && sourceAllowedIds.size === 0)}
              floatingZIndexClass="z-[5100]"
            />
            {statusToPickRequired ? (
              <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
                To pole jest wymagane.
              </p>
            ) : null}
            {statusToPickUnavailable ? (
              <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
                Wybrany status do zbierania nie jest już dostępny dla tej konfiguracji. Wybierz inny status.
              </p>
            ) : null}
            {statusPairConflict ? (
              <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
                {isProductionMode
                  ? "Status wejściowy produkcji nie może być taki sam jak status po wyprodukowaniu."
                  : "Status do zbierania nie może być taki sam jak status do pakowania."}
              </p>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="text-sm font-semibold text-slate-900">
              {isProductionMode ? "Status po wyprodukowaniu" : "Status do pakowania"}
              <span className="ml-1 text-red-600" aria-hidden>
                *
              </span>
            </p>
            <SettingInfoButton
              title={isProductionMode ? "Status po wyprodukowaniu" : "Status do pakowania"}
              description={
                isProductionMode
                  ? "Status, na który zamówienie trafi po wykonaniu przypisanej ilości produkcji."
                  : "Status, na który zamówienie przechodzi po zakończeniu zbierania."
              }
            />
          </div>
          <div className="mt-3">
            <OrderUiStatusField
              panelSummary={targetPanelSummary}
              panelSubgroups={panelSubgroups}
              statusNameById={statusNameById}
              selectedStatusId={selectedTargetId}
              onPick={(id) => {
                onStatusAfterPickChange(id != null ? String(id) : "");
                onStatusAfterPickBlur();
              }}
              allowClear
              clearLabel="— wybierz —"
              placeholder="Wybierz status…"
              disabled={selectDisabled || (!isProductionMode && targetAllowedIds.size === 0)}
              floatingZIndexClass="z-[5100]"
            />
            {statusAfterPickRequired ? (
              <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
                To pole jest wymagane.
              </p>
            ) : null}
            {statusAfterPickUnavailable ? (
              <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
                Wybrany status po zbieraniu nie jest już dostępny dla tej konfiguracji. Wybierz inny status.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {isProductionMode ? (
        <div className="grid grid-cols-1 gap-5 min-[720px]:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
            <p className="text-sm font-semibold text-slate-900">
              Status przy braku komponentów
              <span className="ml-1 text-red-600" aria-hidden>
                *
              </span>
            </p>
            <div className="mt-3">
              <OrderUiStatusField
                panelSummary={orderUiSummary}
                panelSubgroups={panelSubgroups}
                statusNameById={statusNameById}
                selectedStatusId={selectedShortageId}
                onPick={(id) => onStatusOnComponentShortageChange(id != null ? String(id) : "")}
                allowClear
                clearLabel="— wybierz —"
                placeholder="Wybierz status…"
                disabled={selectDisabled}
                floatingZIndexClass="z-[5100]"
              />
            </div>
          </div>
          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
            <p className="text-sm font-semibold text-slate-900">
              Lokalizacja buforowa produktu gotowego
              <span className="ml-1 text-red-600" aria-hidden>
                *
              </span>
            </p>
            <div className="mt-3">
              <select
                className={numberInputClass}
                value={finishedGoodsBufferLocationId}
                onChange={(e) => onFinishedGoodsBufferLocationIdChange(e.target.value)}
                disabled={warehouseId == null}
                aria-label="Lokalizacja buforowa produktu gotowego"
              >
                <option value="">— wybierz lokalizację —</option>
                {bufferLocations.map((loc) => (
                  <option key={loc.id} value={String(loc.id)}>
                    {loc.name}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-500">
                Trigger produkcji z zamówień obsługuje obecnie tylko zamówienia jednoelementowe.
              </p>
            </div>
          </div>
          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 min-[720px]:col-span-2">
            <PickingRadioGroup
              legend="Sposób realizacji produkcji"
              name={`${fieldIdPrefix}-production-execution-method`}
              value={productionExecutionMethod}
              options={[
                { value: "WMS", label: "Terminal WMS" },
                { value: "PRINT", label: "Wydruk zlecenia" },
              ]}
              onChange={onProductionExecutionMethodChange}
            />
          </div>
          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 min-[720px]:col-span-2">
            <PickingRadioGroup
              legend="Po wyprodukowaniu"
              name={`${fieldIdPrefix}-after-production-action`}
              value={afterProductionAction}
              options={[
                { value: "STATUS_ONLY", label: "Tylko zmień status" },
                { value: "OPEN_PACKING", label: "Otwórz pakowanie" },
              ]}
              onChange={onAfterProductionActionChange}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              „Otwórz pakowanie” dotyczy tylko operatora raportującego produkcję w tej sesji — nie jest
              globalnym przekierowaniem.
            </p>
          </div>
        </div>
      ) : (
        <>
      <div className="rounded-xl border border-slate-200 bg-white p-3.5">
        <PickingRadioGroup
          legend="W jaki sposób chcesz zbierać zamówienia?"
          name={`${fieldIdPrefix}-picking-mode`}
          value={pickingMode}
          options={PICKING_MODE_OPTIONS}
          onChange={onPickingModeChange}
        />
      </div>

      {showByOrdersSort ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <PickingRadioGroup
            legend="Wybierz sposób doboru zamówień:"
            name={`${fieldIdPrefix}-order-sort`}
            value={orderSort}
            options={ORDER_SORT_LOCATION_DATE_COURIER}
            onChange={onOrderSortChange}
          />
        </div>
      ) : null}

      {byProducts ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 min-[720px]:grid-cols-2">
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
              <p className="text-sm font-semibold text-slate-900">Zamówienia jednoelementowe</p>
              <div className="mt-3">
                <PickingRadioGroup
                  legend="Jak chcesz zbierać zamówienia jednoelementowe?"
                  name={`${fieldIdPrefix}-single-where`}
                  value={singleContainers}
                  options={BY_PRODUCTS_SINGLE_CONTAINER_OPTIONS}
                  onChange={(v) => patchBlock("single_item", { containers: v })}
                />
                {showByProductsOrderSort ? (
                  <PickingNestedOrderSort
                    legend="Wybierz sposób doboru zamówień jednoelementowych:"
                    name={`${fieldIdPrefix}-single-order-sort`}
                    value={orderSort}
                    options={singleOrderSortOptions}
                    onChange={onOrderSortChange}
                  />
                ) : null}
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
              <p className="text-sm font-semibold text-slate-900">Zamówienia wieloelementowe</p>
              <div className="mt-3">
                <PickingRadioGroup
                  legend="Jak chcesz zbierać zamówienia wieloelementowe?"
                  name={`${fieldIdPrefix}-multi-where`}
                  value={multiContainers}
                  options={BY_PRODUCTS_MULTI_CONTAINER_OPTIONS}
                  onChange={(v) => patchBlock("multi_item", { containers: v })}
                />
                {showByProductsOrderSort ? (
                  <PickingNestedOrderSort
                    legend="Wybierz sposób doboru zamówień wieloelementowych:"
                    name={`${fieldIdPrefix}-multi-order-sort`}
                    value={orderSort}
                    options={ORDER_SORT_DATE_COURIER}
                    onChange={onOrderSortChange}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
            <p className="text-sm font-semibold text-slate-900">Wszystkie zamówienia</p>
            <div className="mt-3">
              <PickingRadioGroup
                legend="Jak chcesz zbierać wszystkie zamówienia?"
                name={`${fieldIdPrefix}-all-where`}
                value={allContainers}
                options={BY_PRODUCTS_ALL_CONTAINER_OPTIONS}
                onChange={(v) => patchBlock("all_item", { containers: v })}
              />
              {showByProductsOrderSort ? (
                <PickingNestedOrderSort
                  legend="Wybierz sposób doboru wszystkich zamówień:"
                  name={`${fieldIdPrefix}-all-order-sort`}
                  value={allOrderSort}
                  options={ORDER_SORT_LOCATION_DATE_COURIER}
                  onChange={onAllOrderSortChange}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
        </>
      )}
    </div>
  );
}

function resolvePanelStatusBrief(
  summary: OrderUiStatusPanelSummary | null,
  statusId: number,
  fallbackName: string,
): PanelConfigurableUiStatusBrief {
  for (const block of summary?.groups ?? []) {
    const hit = block.sub_statuses.find((s) => s.id === statusId);
    if (hit) {
      return {
        name: hit.name,
        color: hit.color,
        main_group: hit.main_group,
        badge_color: hit.badge_color ?? null,
        background_color: hit.background_color ?? null,
        text_color: hit.text_color ?? null,
        image_url: hit.image_url ?? null,
        is_active: hit.is_active,
      };
    }
  }
  return {
    name: fallbackName.trim() || `Status #${statusId}`,
    color: "#94a3b8",
    main_group: "IN_PROGRESS",
  };
}

/** Pełna szerokość: status | tryb | 1-el | multi | wszystkie | po zbieraniu | akcje */
const PICKING_CONFIG_LIST_GRID =
  "sm:grid-cols-[minmax(9rem,1fr)_minmax(5.5rem,0.7fr)_minmax(0,1.15fr)_minmax(0,1.15fr)_minmax(0,1.15fr)_minmax(9rem,1fr)_auto]";

const pickingConfigListHeaderClass =
  "text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400";

/** Kompaktowy badge statusu WMS (~36px) — kolor i lewy pasek bez zmian. */
function PickingConfigStatusBadge({ status }: { status: PanelConfigurableUiStatusBrief }) {
  return (
    <OrderUiStatusConfigRowPresent
      status={status}
      variant="compact"
      className="!inline-flex h-9 w-fit max-w-full shrink-0 items-center !px-4 !py-0 shadow-none hover:translate-y-0 hover:shadow-none"
    />
  );
}

function collectUniqueStatusesByRole(
  configs: SavedPickingConfiguration[],
  orderUiSummary: OrderUiStatusPanelSummary | null,
  role: "source" | "target",
): Array<{ id: number; brief: PanelConfigurableUiStatusBrief }> {
  const seen = new Set<number>();
  const out: Array<{ id: number; brief: PanelConfigurableUiStatusBrief }> = [];
  const push = (id: number, fallbackName: string) => {
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) return;
    seen.add(id);
    out.push({ id, brief: resolvePanelStatusBrief(orderUiSummary, id, fallbackName) });
  };
  for (const cfg of configs) {
    if (role === "source") {
      push(cfg.statusToPickId, cfg.statusToPickName);
    } else {
      push(cfg.statusAfterPickId, cfg.statusAfterPickName);
    }
  }
  return out;
}

function PickingUsedStatusGroup({
  title,
  statuses,
}: {
  title: string;
  statuses: Array<{ id: number; brief: PanelConfigurableUiStatusBrief }>;
}) {
  if (statuses.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
        {statuses.map((st) => (
          <PickingConfigStatusBadge key={st.id} status={st.brief} />
        ))}
      </div>
    </div>
  );
}

function PickingUsedStatusesSummary({
  configs,
  orderUiSummary,
}: {
  configs: SavedPickingConfiguration[];
  orderUiSummary: OrderUiStatusPanelSummary | null;
}) {
  const sourceStatuses = useMemo(
    () => collectUniqueStatusesByRole(configs, orderUiSummary, "source"),
    [configs, orderUiSummary],
  );
  const targetStatuses = useMemo(
    () => collectUniqueStatusesByRole(configs, orderUiSummary, "target"),
    [configs, orderUiSummary],
  );
  if (sourceStatuses.length === 0 && targetStatuses.length === 0) return null;
  return (
    <div
      className="rounded-xl border border-slate-100 bg-white px-4 py-4"
      aria-label="Wykorzystane statusy"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Wykorzystane statusy
      </p>
      <div className="mt-3 space-y-4">
        <PickingUsedStatusGroup
          title="Statusy do rozpoczęcia zbierania"
          statuses={sourceStatuses}
        />
        <PickingUsedStatusGroup
          title="Statusy po zakończeniu zbierania"
          statuses={targetStatuses}
        />
      </div>
    </div>
  );
}

function PickingConfigOrderTypeColumn({
  orderType,
  config,
}: {
  orderType: PickingOrderTypeKey;
  config: SavedPickingConfiguration;
}) {
  const isSingle = orderType === "single_item";
  const isAll = orderType === "all_item";
  const Icon = isAll ? Layers : isSingle ? FileText : Boxes;
  const title = isAll
    ? "Wszystkie zamówienia"
    : isSingle
      ? "Zamówienia jednoelementowe"
      : "Zamówienia wieloelementowe";
  const containerLabelText = containerListLabel(config.blocks[orderType].containers, orderType);
  const sortForDisplay = isAll
    ? config.allOrderSort
    : !isSingle && config.blocks.multi_item.containers === "consolidation_rack"
      ? coerceConsolidationOrderSort(config.orderSort)
      : config.orderSort;
  const sortLabel = orderSortListLabel(sortForDisplay);

  return (
    <div className="flex min-w-0 flex-col gap-2.5 text-left">
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug text-slate-900">{title}</p>
          <p className="mt-0.5 text-xs leading-snug text-slate-500">{containerLabelText}</p>
        </div>
      </div>
      <div className="flex min-w-0 items-start gap-2.5">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug text-slate-900">Kolejność doboru</p>
          <p className="mt-0.5 text-xs leading-snug text-slate-500">{sortLabel}</p>
        </div>
      </div>
    </div>
  );
}

function SavedPickingConfigSummaryCard({
  config,
  orderUiSummary,
  onEdit,
  onDelete,
  actionsDisabled,
}: {
  config: SavedPickingConfiguration;
  orderUiSummary: OrderUiStatusPanelSummary | null;
  onEdit: (config: SavedPickingConfiguration) => void;
  onDelete: (id: string) => void;
  actionsDisabled?: boolean;
}) {
  const sourceBrief = resolvePanelStatusBrief(
    orderUiSummary,
    config.statusToPickId,
    config.statusToPickName,
  );
  const targetBrief = resolvePanelStatusBrief(
    orderUiSummary,
    config.statusAfterPickId,
    config.statusAfterPickName,
  );
  const modeLabel = pickingModeLabel(config.pickingMode);

  return (
    <div
      className={`grid grid-cols-1 items-center gap-4 border-b border-slate-100 px-3 py-4 last:border-b-0 sm:gap-4 sm:px-4 lg:gap-5 ${PICKING_CONFIG_LIST_GRID}`}
      aria-label={`Konfiguracja zbierania: ${config.statusToPickName}`}
    >
      <div className="flex min-w-0 justify-center sm:justify-start">
        <div className="space-y-1">
          <PickingConfigStatusBadge status={sourceBrief} />
          {config.isProductionMode ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
              Produkcja
              {config.productionExecutionMethod === "PRINT" ? " · Wydruk" : " · Terminal WMS"}
            </p>
          ) : null}
        </div>
      </div>
      <div className="min-w-0 text-left sm:text-center">
        <p className="text-sm font-semibold text-slate-900 sm:inline-block sm:text-left">{modeLabel}</p>
      </div>
      <div className="min-w-0">
        <PickingConfigOrderTypeColumn orderType="single_item" config={config} />
      </div>
      <div className="min-w-0">
        <PickingConfigOrderTypeColumn orderType="multi_item" config={config} />
      </div>
      <div className="min-w-0">
        <PickingConfigOrderTypeColumn orderType="all_item" config={config} />
      </div>
      <div className="flex min-w-0 justify-center sm:justify-start">
        <PickingConfigStatusBadge status={targetBrief} />
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1.5">
        <IconButton
          tone="neutral"
          title="Edytuj"
          aria-label="Edytuj"
          disabled={actionsDisabled}
          onClick={() => onEdit(config)}
        >
          <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
        </IconButton>
        <IconButton
          tone="danger"
          title="Usuń"
          aria-label="Usuń"
          disabled={actionsDisabled}
          onClick={() => onDelete(config.id)}
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
        </IconButton>
      </div>
    </div>
  );
}

function WmsPickingStatusConfig({
  savedConfigs,
  draft,
  pickingConfigsLoading,
  pickingPersisting,
  orderUiSummary,
  setSaveFormError,
  setPickingPersistOk,
  setEditBackup,
  setSavedConfigs,
  setDraft,
  handleDeleteSavedConfig,
}: {
  savedConfigs: SavedPickingConfiguration[];
  draft: PickingConfigDraft | null;
  pickingConfigsLoading: boolean;
  pickingPersisting: boolean;
  orderUiSummary: OrderUiStatusPanelSummary | null;
  setSaveFormError: Dispatch<SetStateAction<string | null>>;
  setPickingPersistOk: Dispatch<SetStateAction<string | null>>;
  setEditBackup: Dispatch<SetStateAction<SavedPickingConfiguration | null>>;
  setSavedConfigs: Dispatch<SetStateAction<SavedPickingConfiguration[]>>;
  setDraft: Dispatch<SetStateAction<PickingConfigDraft | null>>;
  handleDeleteSavedConfig: (id: string) => void;
}) {
  return (
    <div className="space-y-4" aria-label="Konfigurator zbierania">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Konfigurator zbierania</h2>
        <button
          type="button"
          className={brandPrimaryButtonClass}
          onClick={() => {
            setSaveFormError(null);
            setPickingPersistOk(null);
            setEditBackup(null);
            setDraft(createEmptyDraft());
          }}
          disabled={draft != null || pickingConfigsLoading || pickingPersisting}
        >
          <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Dodaj konfigurację zbierania
        </button>
      </div>

      {savedConfigs.length === 0 && !draft && !pickingConfigsLoading ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
          Brak konfiguracji zbierania — dodaj pierwszą powyżej.
        </p>
      ) : null}

      {savedConfigs.length > 0 ? (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
            <div
              className={`hidden gap-4 border-b border-slate-100 px-3 py-3 sm:grid sm:px-4 lg:gap-5 ${PICKING_CONFIG_LIST_GRID}`}
            >
              <p className={pickingConfigListHeaderClass}>Status do rozpoczęcia zbierania</p>
              <p className={pickingConfigListHeaderClass}>Tryb zbierania</p>
              <p className={pickingConfigListHeaderClass}>Jednoelementowe</p>
              <p className={pickingConfigListHeaderClass}>Wieloelementowe</p>
              <p className={pickingConfigListHeaderClass}>Wszystkie</p>
              <p className={pickingConfigListHeaderClass}>Po zbieraniu</p>
              <p className={`${pickingConfigListHeaderClass} text-right`}>Akcje</p>
            </div>
            <div>
              {savedConfigs.map((cfg) => (
                <SavedPickingConfigSummaryCard
                  key={cfg.id}
                  config={cfg}
                  orderUiSummary={orderUiSummary}
                  actionsDisabled={pickingPersisting || draft != null}
                  onEdit={(c) => {
                    setSaveFormError(null);
                    setPickingPersistOk(null);
                    setEditBackup(c);
                    setSavedConfigs((prev) => prev.filter((x) => x.id !== c.id));
                    setDraft(savedConfigurationToDraft(c));
                  }}
                  onDelete={(id) => {
                    void handleDeleteSavedConfig(id);
                  }}
                />
              ))}
            </div>
          </div>
          <PickingUsedStatusesSummary configs={savedConfigs} orderUiSummary={orderUiSummary} />
        </>
      ) : null}
    </div>
  );
}

export type WmsPickingSettingsActions = {
  saveAll: () => Promise<void>;
  discardUnsaved: () => Promise<void>;
};

export function WmsPickingSettingsSections({
  registerActions,
  onDirtyChange,
  sectionNavObserve = true,
}: {
  registerActions?: (api: WmsPickingSettingsActions | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
  sectionNavObserve?: boolean;
}) {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;

  const shortageRef = useRef<PickingShortageSettingsHandle>(null);

  const [savedConfigs, setSavedConfigs] = useState<SavedPickingConfiguration[]>([]);
  const [draft, setDraft] = useState<PickingConfigDraft | null>(null);
  const [saveFormError, setSaveFormError] = useState<string | null>(null);
  const [editBackup, setEditBackup] = useState<SavedPickingConfiguration | null>(null);
  const [shortagePanelDirty, setShortagePanelDirty] = useState(false);
  const [baselineConfigsFp, setBaselineConfigsFp] = useState<string | null>(null);
  const [bufferLocations, setBufferLocations] = useState<WarehouseLocationItem[]>([]);

  const [extended, setExtended] = useState<WmsPickingExtendedUiSettings>(() => ({ ...DEFAULT_WMS_PICKING_EXTENDED_UI }));
  const [baselineExtended, setBaselineExtended] = useState<string | null>(null);
  const [extendedOk, setExtendedOk] = useState<string | null>(null);

  const [orderUiSummary, setOrderUiSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [panelSubgroups, setPanelSubgroups] = useState<OrderUiPanelSubgroupRead[]>([]);
  const [orderUiLoading, setOrderUiLoading] = useState(false);
  const [orderUiErr, setOrderUiErr] = useState<string | null>(null);
  const [packingStartStatusIds, setPackingStartStatusIds] = useState<number[]>([]);

  const statusOptionsFlat = useMemo(() => flattenOrderUiStatusOptions(orderUiSummary), [orderUiSummary]);

  /** Źródła zajęte przez inne reguły (przy edycji bieżąca reguła jest już wyjęta z listy). */
  const excludeSourceStatusIds = useMemo(
    () => savedConfigs.map((c) => c.statusToPickId).filter((id) => Number.isFinite(id) && id > 0),
    [savedConfigs],
  );

  const sourceAllowedIds = useMemo(
    () =>
      allowedPickingSourceStatusIds({
        summary: orderUiSummary,
        excludeSourceIds: excludeSourceStatusIds,
      }),
    [orderUiSummary, excludeSourceStatusIds],
  );
  const targetAllowedIds = useMemo(
    () =>
      allowedPickingTargetStatusIds({
        summary: orderUiSummary,
        packingStartStatusIds,
      }),
    [orderUiSummary, packingStartStatusIds],
  );

  const draftDirty = useMemo(() => {
    if (!draft) return false;
    const fp = fingerprintDraftForm(draft);
    if (editBackup != null) {
      return fp !== fingerprintDraftForm(savedConfigurationToDraft(editBackup));
    }
    const pickId = Number(draft.statusToPick);
    if (!Number.isFinite(pickId) || pickId <= 0) return true;
    const serverRow = savedConfigs.find((c) => c.statusToPickId === pickId);
    if (!serverRow) {
      return fp !== fingerprintDraftForm(createEmptyDraft());
    }
    return fp !== fingerprintDraftForm(savedConfigurationToDraft(serverRow));
  }, [draft, savedConfigs, editBackup]);

  useEffect(() => {
    if (warehouseId == null) {
      setExtended({ ...DEFAULT_WMS_PICKING_EXTENDED_UI });
      setBaselineExtended(null);
      return;
    }
    let cancelled = false;
    const local = { ...loadWmsPickingExtendedUi(warehouseId) };
    setExtended(local);
    setBaselineExtended(stableStringifyPicking(local));
    void getWmsPickingTerminalSettings(DAMAGE_TENANT_ID, warehouseId)
      .then((t) => {
        if (cancelled) return;
        const ld = t.list_display;
        setExtended((prev) => {
          const next = {
            ...prev,
            requireProductScanAtLeastOnce: Boolean(t.require_product_scan_at_least_once),
            requireLocationScan: Boolean(t.require_location_scan),
            disableForceLocationScanWhenManyLocations: Boolean(
              t.disable_force_location_scan_when_many_locations,
            ),
            allowReserveLocationPicking: Boolean(t.allow_reserve_location_picking),
            allowProductsWithoutEan: Boolean(t.allow_products_without_ean),
            showProductImage: Boolean(ld.show_product_image),
            showEAN: Boolean(ld.show_ean),
            showSKU: Boolean(ld.show_sku),
            showCatalogNumber: Boolean(ld.show_catalog_number),
            showStock: Boolean(ld.show_stock),
            showLocation: Boolean(ld.show_location),
          };
          setBaselineExtended(stableStringifyPicking(next));
          return next;
        });
      })
      .catch(() => {
        /* keep local defaults when API unavailable */
      });
    return () => {
      cancelled = true;
    };
  }, [warehouseId]);

  function patchExtended<K extends keyof WmsPickingExtendedUiSettings>(key: K, value: WmsPickingExtendedUiSettings[K]) {
    setExtended((prev) => ({ ...prev, [key]: value }));
  }

  const extendedDirty = useMemo(() => {
    if (baselineExtended == null) return false;
    return stableStringifyPicking(extended) !== baselineExtended;
  }, [extended, baselineExtended]);

  const persistTerminalSettings = useCallback(async () => {
    if (warehouseId == null) return;
    await saveWmsPickingTerminalSettings({
      tenant_id: DAMAGE_TENANT_ID,
      warehouse_id: warehouseId,
      require_product_scan_at_least_once: Boolean(extended.requireProductScanAtLeastOnce),
      require_location_scan: Boolean(extended.requireLocationScan),
      disable_force_location_scan_when_many_locations: Boolean(
        extended.disableForceLocationScanWhenManyLocations,
      ),
      allow_reserve_location_picking: Boolean(extended.allowReserveLocationPicking),
      allow_products_without_ean: Boolean(extended.allowProductsWithoutEan),
      list_display: {
        show_product_image: Boolean(extended.showProductImage),
        show_ean: Boolean(extended.showEAN),
        show_sku: Boolean(extended.showSKU),
        show_catalog_number: Boolean(extended.showCatalogNumber),
        show_stock: Boolean(extended.showStock),
        show_location: Boolean(extended.showLocation),
      },
    });
  }, [warehouseId, extended]);

  const saveExtendedOnly = useCallback(async () => {
    if (warehouseId == null) return;
    saveWmsPickingExtendedUi(warehouseId, extended);
    try {
      await persistTerminalSettings();
    } catch {
      toast.error("Nie udało się zapisać ustawień terminala zbierania.");
      throw new Error("terminal_settings_save_failed");
    }
    setBaselineExtended(stableStringifyPicking(extended));
    setExtendedOk("Zapisano preferencje widoku zbierania.");
    window.setTimeout(() => setExtendedOk(null), 4000);
  }, [warehouseId, extended, persistTerminalSettings]);

  const loadOrderUiStatuses = useCallback(async () => {
    if (warehouseId == null) {
      setOrderUiSummary(null);
      setPanelSubgroups([]);
      setPackingStartStatusIds([]);
      setOrderUiErr(null);
      return;
    }
    setOrderUiLoading(true);
    setOrderUiErr(null);
    try {
      const [data, subgroups, packing] = await Promise.all([
        getOrderUiStatusSummary(DAMAGE_TENANT_ID, warehouseId),
        getOrderPanelSubgroups(DAMAGE_TENANT_ID, warehouseId).catch(() => [] as OrderUiPanelSubgroupRead[]),
        getWmsPackingSettings(DAMAGE_TENANT_ID, warehouseId).catch(() => null),
      ]);
      setOrderUiSummary(data);
      setPanelSubgroups(subgroups);
      setPackingStartStatusIds(packingStartStatusIdsFromSettings(packing));
    } catch {
      setOrderUiErr("Nie udało się wczytać statusów panelu zamówień.");
      setOrderUiSummary(null);
      setPanelSubgroups([]);
      setPackingStartStatusIds([]);
    } finally {
      setOrderUiLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void loadOrderUiStatuses();
  }, [loadOrderUiStatuses]);

  const patchDraftBlock = useCallback((key: PickingOrderTypeKey, patch: Partial<PickingBlockState>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const shape = blocksShapeForMode(prev.pickingMode);
      const nextBlock: PickingBlockState = { ...prev.blocks[key], ...patch, ...shape };
      return { ...prev, blocks: { ...prev.blocks, [key]: nextBlock } };
    });
  }, []);

  const [pickingConfigsLoading, setPickingConfigsLoading] = useState(false);
  const [pickingConfigsLoadErr, setPickingConfigsLoadErr] = useState<string | null>(null);
  const [pickingPersisting, setPickingPersisting] = useState(false);
  const [pickingPersistOk, setPickingPersistOk] = useState<string | null>(null);

  const [globalBulkSingle, setGlobalBulkSingle] = useState(BULK_ORDER_LIMIT_DEFAULT_SINGLE);
  const [globalBulkMulti, setGlobalBulkMulti] = useState(BULK_ORDER_LIMIT_DEFAULT_MULTI);
  const [globalBulkAll, setGlobalBulkAll] = useState(BULK_ORDER_LIMIT_DEFAULT_ALL);
  const [globalBulkSingleBlurred, setGlobalBulkSingleBlurred] = useState(false);
  const [globalBulkMultiBlurred, setGlobalBulkMultiBlurred] = useState(false);
  const [globalBulkAllBlurred, setGlobalBulkAllBlurred] = useState(false);

  const configsBulkDirty =
    baselineConfigsFp != null &&
    fingerprintPickingConfigsWarehouseState(savedConfigs, globalBulkSingle, globalBulkMulti, globalBulkAll) !== baselineConfigsFp;

  const pickingDirty =
    warehouseId != null &&
    (extendedDirty || configsBulkDirty || shortagePanelDirty || draftDirty);

  useEffect(() => {
    onDirtyChange?.(pickingDirty);
  }, [pickingDirty, onDirtyChange]);

  const inferGlobalBulkLimitsFromRows = useCallback((rows: WmsPickingConfigReadApi[]) => {
    const s = rows.map((r) => r.max_single_orders).find((x) => x != null);
    const m = rows.map((r) => r.max_multi_orders).find((x) => x != null);
    const a = rows.map((r) => r.max_all_orders).find((x) => x != null);
    return {
      single: String(s ?? BULK_ORDER_LIMIT_DEFAULT_SINGLE),
      multi: String(m ?? BULK_ORDER_LIMIT_DEFAULT_MULTI),
      all: String(a ?? BULK_ORDER_LIMIT_DEFAULT_ALL),
    };
  }, []);

  const loadPickingConfigsFromServer = useCallback(async () => {
    if (warehouseId == null) {
      setSavedConfigs([]);
      setPickingConfigsLoadErr(null);
      setBaselineConfigsFp(null);
      return;
    }
    setPickingConfigsLoading(true);
    setPickingConfigsLoadErr(null);
    const cached = loadCachedPickingConfigRows(warehouseId);
    if (cached != null && cached.length > 0) {
      setSavedConfigs(cached.map(mapApiPickingRowToSaved));
      const g0 = inferGlobalBulkLimitsFromRows(cached);
      setGlobalBulkSingle(g0.single);
      setGlobalBulkMulti(g0.multi);
      setGlobalBulkAll(g0.all);
    }
    let settingsSource: "api" | "local" | "default" = "default";
    try {
      const rows = await listPickingConfigs(DAMAGE_TENANT_ID, warehouseId);
      saveCachedPickingConfigRows(warehouseId, rows);
      const savedRows = rows.map(mapApiPickingRowToSaved);
      setSavedConfigs(savedRows);
      const g = inferGlobalBulkLimitsFromRows(rows);
      setGlobalBulkSingle(g.single);
      setGlobalBulkMulti(g.multi);
      setGlobalBulkAll(g.all);
      setBaselineConfigsFp(fingerprintPickingConfigsWarehouseState(savedRows, g.single, g.multi, g.all));
      setGlobalBulkSingleBlurred(false);
      setGlobalBulkMultiBlurred(false);
      setGlobalBulkAllBlurred(false);
      settingsSource = "api";
      setPickingConfigsLoadErr(null);
    } catch (err) {
      console.warn("Picking settings API failed, using fallback", err);
      if (cached != null && cached.length > 0) {
        settingsSource = "local";
        const mapped = cached.map(mapApiPickingRowToSaved);
        setSavedConfigs(mapped);
        const g = inferGlobalBulkLimitsFromRows(cached);
        setGlobalBulkSingle(g.single);
        setGlobalBulkMulti(g.multi);
        setGlobalBulkAll(g.all);
        setBaselineConfigsFp(fingerprintPickingConfigsWarehouseState(mapped, g.single, g.multi, g.all));
      } else {
        setSavedConfigs([]);
        setBaselineConfigsFp(
          fingerprintPickingConfigsWarehouseState(
            [],
            BULK_ORDER_LIMIT_DEFAULT_SINGLE,
            BULK_ORDER_LIMIT_DEFAULT_MULTI,
            BULK_ORDER_LIMIT_DEFAULT_ALL,
          ),
        );
        settingsSource = "default";
      }
      setPickingConfigsLoadErr("Nie udało się wczytać konfiguracji zbierania z serwera.");
    } finally {
      setPickingConfigsLoading(false);
      console.log("Picking config list source:", settingsSource);
    }
  }, [warehouseId, inferGlobalBulkLimitsFromRows]);

  useEffect(() => {
    void loadPickingConfigsFromServer();
  }, [loadPickingConfigsFromServer]);

  useEffect(() => {
    if (warehouseId == null) {
      setBufferLocations([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await getWarehouseLocations(warehouseId);
        if (!cancelled) {
          setBufferLocations(rows.filter((r) => (r as { is_active?: boolean }).is_active !== false));
        }
      } catch {
        if (!cancelled) setBufferLocations([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [warehouseId]);

  const persistPickingConfigList = useCallback(
    async (
      configs: SavedPickingConfiguration[],
    ): Promise<{ ok: true; saved: SavedPickingConfiguration[] } | { ok: false; message: string }> => {
      if (warehouseId == null) {
        return { ok: false, message: "Wybierz magazyn w pasku u góry." };
      }
      if (configs.length === 0) {
        return { ok: false, message: "Musi pozostać co najmniej jedna reguła zbierania." };
      }
      for (const cfg of configs) {
        const v = validateSavedConfigForServer(
          cfg,
          {
            summary: orderUiSummary,
            packingStartStatusIds,
            otherSourceIds: configs.filter((c) => c.id !== cfg.id).map((c) => c.statusToPickId),
          },
          configs,
        );
        if (v) return { ok: false, message: v };
      }
      const gErr = validateGlobalBulkLimitsForWarehouse(configs, globalBulkSingle, globalBulkMulti, globalBulkAll);
      if (gErr) {
        setGlobalBulkSingleBlurred(true);
        setGlobalBulkMultiBlurred(true);
        setGlobalBulkAllBlurred(true);
        return { ok: false, message: gErr };
      }
      let items: WmsPickingConfigReplaceItem[];
      try {
        items = configs.map((c) => savedConfigToReplaceItem(c, { single: globalBulkSingle, multi: globalBulkMulti, all: globalBulkAll }));
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : "Nie udało się przygotować danych do zapisu.",
        };
      }
      try {
        const rows = await replacePickingConfigsForWarehouse(DAMAGE_TENANT_ID, warehouseId, items);
        saveCachedPickingConfigRows(warehouseId, rows);
        const saved = rows.map(mapApiPickingRowToSaved);
        setSavedConfigs(saved);
        const g = inferGlobalBulkLimitsFromRows(rows);
        setGlobalBulkSingle(g.single);
        setGlobalBulkMulti(g.multi);
      setGlobalBulkAll(g.all);
        setBaselineConfigsFp(fingerprintPickingConfigsWarehouseState(saved, g.single, g.multi, g.all));
        return { ok: true, saved };
      } catch {
        return { ok: false, message: "Zapis konfiguracji nie powiódł się. Spróbuj ponownie." };
      }
    },
    [
      warehouseId,
      globalBulkSingle,
      globalBulkMulti,
      globalBulkAll,
      inferGlobalBulkLimitsFromRows,
      orderUiSummary,
      packingStartStatusIds,
    ],
  );

  /**
   * Validate draft and build the next `savedConfigs` list (no React state writes).
   * Shared by modal Zapisz (local commit) and a safety path in global saveAll.
   */
  const buildCommittedConfigList = useCallback(():
    | { ok: true; nextList: SavedPickingConfiguration[] }
    | { ok: false } => {
    setPickingPersistOk(null);
    setSaveFormError(null);
    setPickingConfigsLoadErr(null);
    if (!draft) {
      return { ok: true, nextList: savedConfigs };
    }

    const d = draft;
    if (!d.statusToPick.trim()) {
      setSaveFormError("Wybierz status do zbierania.");
      setDraft({ ...d, statusToPickBlurred: true });
      return { ok: false };
    }
    if (!d.statusAfterPick.trim()) {
      setSaveFormError("Wybierz status po zebraniu.");
      setDraft({ ...d, statusAfterPickBlurred: true });
      return { ok: false };
    }
    const pickId = Number(d.statusToPick);
    const afterId = Number(d.statusAfterPick);
    if (!Number.isFinite(pickId) || pickId <= 0) {
      setSaveFormError("Nieprawidłowy status do zbierania.");
      setDraft({ ...d, statusToPickBlurred: true });
      return { ok: false };
    }
    if (!Number.isFinite(afterId) || afterId <= 0) {
      setSaveFormError("Nieprawidłowy status po zebraniu.");
      setDraft({ ...d, statusAfterPickBlurred: true });
      return { ok: false };
    }
    if (pickId === afterId) {
      setSaveFormError(
        d.isProductionMode
          ? "Status wejściowy produkcji i status po wyprodukowaniu muszą się różnić."
          : "Status do zbierania i po zebraniu muszą się różnić.",
      );
      setDraft({ ...d, statusToPickBlurred: true, statusAfterPickBlurred: true });
      return { ok: false };
    }

    if (!orderUiSummary) {
      setSaveFormError("Statusy panelu zamówień nie są jeszcze wczytane — poczekaj chwilę i spróbuj ponownie.");
      return { ok: false };
    }

    const shortageId = d.isProductionMode ? Number(d.statusOnComponentShortage) : null;
    const bufferId = d.isProductionMode ? Number(d.finishedGoodsBufferLocationId) : null;
    if (d.isProductionMode) {
      if (!Number.isFinite(shortageId) || shortageId == null || shortageId < 1) {
        setSaveFormError("Wybierz status przy braku komponentów.");
        return { ok: false };
      }
      if (shortageId === pickId) {
        setSaveFormError("Status przy braku komponentów musi być inny niż status wejściowy produkcji.");
        return { ok: false };
      }
      if (!Number.isFinite(bufferId) || bufferId == null || bufferId < 1) {
        setSaveFormError("Wybierz lokalizację buforową produktu gotowego.");
        return { ok: false };
      }
    } else {
      if (!isStatusAllowedForPickingConfig(pickId, sourceAllowedIds)) {
        setSaveFormError(
          "Wybrany status do zbierania nie jest dostępny dla tej konfiguracji. Wybierz status z listy dozwolonych.",
        );
        setDraft({ ...d, statusToPickBlurred: true });
        return { ok: false };
      }
      if (!isStatusAllowedForPickingConfig(afterId, targetAllowedIds)) {
        setSaveFormError(
          "Wybrany status po zbieraniu nie jest dostępny dla tej konfiguracji. Wybierz status z listy dozwolonych.",
        );
        setDraft({ ...d, statusAfterPickBlurred: true });
        return { ok: false };
      }
    }

    if (
      editBackup != null &&
      pickId !== editBackup.statusToPickId &&
      savedConfigs.some((c) => c.statusToPickId === pickId)
    ) {
      setSaveFormError("Ten status ma już zapisaną konfigurację — wybierz inny status do zbierania.");
      return { ok: false };
    }

    if (
      !d.isProductionMode &&
      d.pickingMode === "by_products" &&
      isLocationOrderSortDisabledForMultiContainer(d.blocks.multi_item.containers) &&
      d.orderSort === "location"
    ) {
      setSaveFormError(
        `${LOCATION_ORDER_SORT_DISABLED_REASON} Wybierz dobór po dacie lub grupach kurierskich.`,
      );
      return { ok: false };
    }

    const nextUsesBulkSingle =
      d.blocks.single_item.containers === "cart_no_scan" ||
      savedConfigs.some((c) => c.blocks.single_item.containers === "cart_no_scan");
    const nextUsesBulkMulti =
      d.blocks.multi_item.containers === "cart_no_scan" ||
      savedConfigs.some((c) => c.blocks.multi_item.containers === "cart_no_scan");
    if (nextUsesBulkSingle) {
      const p = parseBulkOrderLimitInput(globalBulkSingle, BULK_ORDER_LIMIT_MAX);
      if (!p.ok) {
        setSaveFormError(`Limity zbioru (magazyn) — jednoelementowe: ${p.message}`);
        setGlobalBulkSingleBlurred(true);
        return { ok: false };
      }
    }
    if (nextUsesBulkMulti) {
      const p = parseBulkOrderLimitInput(globalBulkMulti, BULK_ORDER_LIMIT_MAX);
      if (!p.ok) {
        setSaveFormError(`Limity zbioru (magazyn) — wieloelementowe: ${p.message}`);
        setGlobalBulkMultiBlurred(true);
        return { ok: false };
      }
    }
    const nextUsesBulkAll =
      d.blocks.all_item?.containers === "cart_no_scan" ||
      savedConfigs.some((c) => c.blocks.all_item?.containers === "cart_no_scan");
    if (nextUsesBulkAll) {
      const p = parseBulkOrderLimitInput(globalBulkAll, BULK_ORDER_LIMIT_MAX);
      if (!p.ok) {
        setSaveFormError(`Limity zbioru (magazyn) — wszystkie zamówienia: ${p.message}`);
        setGlobalBulkAllBlurred(true);
        return { ok: false };
      }
    }

    const namePick = statusOptionsFlat.find((o) => o.id === pickId)?.name ?? `Status #${pickId}`;
    const nameAfter = statusOptionsFlat.find((o) => o.id === afterId)?.name ?? `Status #${afterId}`;
    const nameShortage =
      shortageId != null
        ? statusOptionsFlat.find((o) => o.id === shortageId)?.name ?? `Status #${shortageId}`
        : null;

    const normalizedBlocks = normalizeBlocksForPickingMode(d.blocks, d.pickingMode);
    const snapshot: SavedPickingConfiguration = {
      id: editBackup?.id ?? crypto.randomUUID(),
      statusToPickId: pickId,
      statusToPickName: namePick,
      statusAfterPickId: afterId,
      statusAfterPickName: nameAfter,
      statusOnShortageId: null,
      statusOnShortageName: null,
      pickingMode: d.pickingMode,
      orderSort: d.orderSort,
      allOrderSort: d.allOrderSort,
      blocks: normalizedBlocks,
      isProductionMode: d.isProductionMode,
      statusOnComponentShortageId: d.isProductionMode ? shortageId : null,
      statusOnComponentShortageName: d.isProductionMode ? nameShortage : null,
      finishedGoodsBufferLocationId: d.isProductionMode ? bufferId : null,
      finishedGoodsBufferLocationName: null,
      productionExecutionMethod: d.isProductionMode
        ? d.productionExecutionMethod === "PRINT"
          ? "PRINT"
          : "WMS"
        : "WMS",
      afterProductionAction: d.isProductionMode
        ? d.afterProductionAction === "OPEN_PACKING"
          ? "OPEN_PACKING"
          : "STATUS_ONLY"
        : "STATUS_ONLY",
    };

    let nextList: SavedPickingConfiguration[];
    if (editBackup != null) {
      nextList = [...savedConfigs, snapshot];
    } else {
      const idxExisting = savedConfigs.findIndex((c) => c.statusToPickId === pickId);
      nextList =
        idxExisting >= 0
          ? savedConfigs.map((c, i) => (i === idxExisting ? snapshot : c))
          : [...savedConfigs, snapshot];
    }
    nextList.sort((a, b) => a.statusToPickName.localeCompare(b.statusToPickName));
    return { ok: true, nextList };
  }, [
    draft,
    savedConfigs,
    statusOptionsFlat,
    editBackup,
    globalBulkSingle,
    globalBulkMulti,
    globalBulkAll,
    orderUiSummary,
    sourceAllowedIds,
    targetAllowedIds,
  ]);

  /** Modal Zapisz: validate + merge into page config list (no API). */
  const commitDraftLocally = useCallback((): boolean => {
    const built = buildCommittedConfigList();
    if (!built.ok) return false;
    setSavedConfigs(built.nextList);
    setEditBackup(null);
    setDraft(null);
    setSaveFormError(null);
    return true;
  }, [buildCommittedConfigList]);

  useEffect(() => {
    registerActions?.({
      saveAll: async () => {
        if (warehouseId == null) return;
        if (shortagePanelDirty && shortageRef.current) {
          const ok = await shortageRef.current.save();
          if (!ok) throw new Error("shortage_save_failed");
        }
        let configsToPersist = savedConfigs;
        if (draft != null) {
          const built = buildCommittedConfigList();
          if (!built.ok) throw new Error("draft_commit_failed");
          configsToPersist = built.nextList;
          setSavedConfigs(built.nextList);
          setEditBackup(null);
          setDraft(null);
          setSaveFormError(null);
        }
        const configsNeedPersist =
          baselineConfigsFp == null ||
          fingerprintPickingConfigsWarehouseState(configsToPersist, globalBulkSingle, globalBulkMulti, globalBulkAll) !==
            baselineConfigsFp;
        if (configsNeedPersist) {
          const result = await persistPickingConfigList(configsToPersist);
          if (!result.ok) throw new Error(result.message);
        }
        if (extendedDirty) {
          await saveExtendedOnly();
        }
      },
      discardUnsaved: async () => {
        if (shortageRef.current) await shortageRef.current.discard();
        if (warehouseId != null) {
          const e = { ...loadWmsPickingExtendedUi(warehouseId) };
          try {
            const t = await getWmsPickingTerminalSettings(DAMAGE_TENANT_ID, warehouseId);
            e.requireProductScanAtLeastOnce = Boolean(t.require_product_scan_at_least_once);
            e.requireLocationScan = Boolean(t.require_location_scan);
            e.disableForceLocationScanWhenManyLocations = Boolean(
              t.disable_force_location_scan_when_many_locations,
            );
            e.allowReserveLocationPicking = Boolean(t.allow_reserve_location_picking);
            e.allowProductsWithoutEan = Boolean(t.allow_products_without_ean);
            e.showProductImage = Boolean(t.list_display.show_product_image);
            e.showEAN = Boolean(t.list_display.show_ean);
            e.showSKU = Boolean(t.list_display.show_sku);
            e.showCatalogNumber = Boolean(t.list_display.show_catalog_number);
            e.showStock = Boolean(t.list_display.show_stock);
            e.showLocation = Boolean(t.list_display.show_location);
          } catch {
            /* keep local UI defaults for terminal flags */
          }
          setExtended(e);
          setBaselineExtended(stableStringifyPicking(e));
        }
        await loadPickingConfigsFromServer();
        setEditBackup(null);
        setDraft(null);
        setSaveFormError(null);
      },
    });
    return () => registerActions?.(null);
  }, [
    registerActions,
    warehouseId,
    shortagePanelDirty,
    draft,
    savedConfigs,
    globalBulkSingle,
    globalBulkMulti,
    baselineConfigsFp,
    extendedDirty,
    buildCommittedConfigList,
    persistPickingConfigList,
    saveExtendedOnly,
    loadPickingConfigsFromServer,
  ]);

  const handleDeleteSavedConfig = useCallback(
    async (id: string) => {
      setSaveFormError(null);
      setPickingPersistOk(null);
      if (draft != null) {
        setSaveFormError("Dokończ lub anuluj edycję reguły przed usunięciem innej z listy.");
        return;
      }
      const remaining = savedConfigs.filter((c) => c.id !== id);
      if (remaining.length === 0) {
        setSaveFormError("Musi pozostać co najmniej jedna reguła zbierania — nie można usunąć ostatniej.");
        return;
      }
      setPickingPersisting(true);
      const result = await persistPickingConfigList(remaining);
      setPickingPersisting(false);
      if (!result.ok) {
        setSaveFormError(result.message);
        return;
      }
      setPickingPersistOk("Reguła usunięta.");
      window.setTimeout(() => setPickingPersistOk(null), 4000);
    },
    [draft, savedConfigs, persistPickingConfigList, setSaveFormError],
  );

  const warehouseUsesBulkLimits = useMemo(() => {
    const fromSaved = savedConfigs.some(
      (c) =>
        c.blocks.single_item.containers === "cart_no_scan" ||
        c.blocks.multi_item.containers === "cart_no_scan" ||
        c.blocks.all_item?.containers === "cart_no_scan",
    );
    const fromDraft =
      draft != null &&
      (draft.blocks.single_item.containers === "cart_no_scan" ||
        draft.blocks.multi_item.containers === "cart_no_scan" ||
        draft.blocks.all_item?.containers === "cart_no_scan");
    return fromSaved || fromDraft;
  }, [savedConfigs, draft]);

  const showGlobalBulkSingleField =
    savedConfigs.some((c) => c.blocks.single_item.containers === "cart_no_scan") ||
    (draft != null && draft.blocks.single_item.containers === "cart_no_scan");
  const showGlobalBulkMultiField =
    savedConfigs.some((c) => c.blocks.multi_item.containers === "cart_no_scan") ||
    (draft != null && draft.blocks.multi_item.containers === "cart_no_scan");
  const showGlobalBulkAllField =
    savedConfigs.some((c) => c.blocks.all_item?.containers === "cart_no_scan") ||
    (draft != null && draft.blocks.all_item?.containers === "cart_no_scan");

  const globalSingleParsed = parseBulkOrderLimitInput(globalBulkSingle, BULK_ORDER_LIMIT_MAX);
  const globalMultiParsed = parseBulkOrderLimitInput(globalBulkMulti, BULK_ORDER_LIMIT_MAX);
  const globalAllParsed = parseBulkOrderLimitInput(globalBulkAll, BULK_ORDER_LIMIT_MAX);
  const globalBulkSingleErr =
    warehouseUsesBulkLimits && globalBulkSingleBlurred && !globalSingleParsed.ok ? globalSingleParsed.message : null;
  const globalBulkMultiErr =
    warehouseUsesBulkLimits && globalBulkMultiBlurred && !globalMultiParsed.ok ? globalMultiParsed.message : null;
  const globalBulkAllErr =
    warehouseUsesBulkLimits && globalBulkAllBlurred && !globalAllParsed.ok ? globalAllParsed.message : null;

  const statusPairConflictDraft =
    draft && draft.statusToPick !== "" && draft.statusAfterPick !== "" && draft.statusToPick === draft.statusAfterPick;

  if (warehouseId == null) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Wybierz magazyn w górnym pasku, aby konfigurować zbieranie.
      </p>
    );
  }

  const closeDraftEditor = () => {
    if (editBackup) {
      setSavedConfigs((prev) =>
        [...prev, editBackup].sort((a, b) => a.statusToPickName.localeCompare(b.statusToPickName)),
      );
      setEditBackup(null);
    }
    setDraft(null);
    setSaveFormError(null);
  };

  return (
    <>
      <WmsSettingsTabFrame
        title="Zbieranie"
        sections={WMS_PICKING_SETTINGS_NAV_SECTIONS}
        asideLabel="Sekcje ustawień zbierania"
        observeSections={sectionNavObserve}
        observeRevision={pickingConfigsLoading}
        dirty={pickingDirty}
        onSave={() =>
          void (async () => {
            if (warehouseId == null) return;
            if (shortagePanelDirty && shortageRef.current) {
              const ok = await shortageRef.current.save();
              if (!ok) throw new Error("shortage_save_failed");
            }
            let configsToPersist = savedConfigs;
            if (draft != null) {
              const built = buildCommittedConfigList();
              if (!built.ok) throw new Error("draft_commit_failed");
              configsToPersist = built.nextList;
              setSavedConfigs(built.nextList);
              setEditBackup(null);
              setDraft(null);
              setSaveFormError(null);
            }
            const configsNeedPersist =
              baselineConfigsFp == null ||
              fingerprintPickingConfigsWarehouseState(configsToPersist, globalBulkSingle, globalBulkMulti, globalBulkAll) !==
                baselineConfigsFp;
            if (configsNeedPersist) {
              const result = await persistPickingConfigList(configsToPersist);
              if (!result.ok) throw new Error(result.message);
            }
            if (extendedDirty) {
              await saveExtendedOnly();
            }
          })()
        }
        onRestoreDefaults={() => {
          void (async () => {
            if (warehouseId == null) return;
            const e = { ...DEFAULT_WMS_PICKING_EXTENDED_UI };
            setExtended(e);
            setBaselineExtended(stableStringifyPicking(e));
            saveWmsPickingExtendedUi(warehouseId, e);
            try {
              await saveWmsPickingTerminalSettings({
                tenant_id: DAMAGE_TENANT_ID,
                warehouse_id: warehouseId,
                require_product_scan_at_least_once: Boolean(e.requireProductScanAtLeastOnce),
                require_location_scan: Boolean(e.requireLocationScan),
                disable_force_location_scan_when_many_locations: Boolean(
                  e.disableForceLocationScanWhenManyLocations,
                ),
                allow_reserve_location_picking: Boolean(e.allowReserveLocationPicking),
                allow_products_without_ean: Boolean(e.allowProductsWithoutEan),
                list_display: {
                  show_product_image: Boolean(e.showProductImage),
                  show_ean: Boolean(e.showEAN),
                  show_sku: Boolean(e.showSKU),
                  show_catalog_number: Boolean(e.showCatalogNumber),
                  show_stock: Boolean(e.showStock),
                  show_location: Boolean(e.showLocation),
                },
              });
            } catch {
              toast.error("Nie udało się zapisać domyślnych ustawień terminala zbierania.");
            }
            await loadPickingConfigsFromServer();
            setEditBackup(null);
            setDraft(null);
            setSaveFormError(null);
          })();
        }}
      >
        {pickingConfigsLoading ? <p className="text-sm text-slate-500">Ładowanie konfiguracji z serwera…</p> : null}
        {pickingConfigsLoadErr ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <span className="font-medium">Ostrzeżenie: </span>
            {pickingConfigsLoadErr} Możesz kontynuować edycję; pełny zapis po odzyskaniu połączenia wykonasz z paska na dole strony.
          </p>
        ) : null}
        {extendedOk ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
            {extendedOk}
          </p>
        ) : null}
        {pickingPersistOk ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900" role="status">
            {pickingPersistOk}
          </p>
        ) : null}
        {saveFormError && draft == null ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{saveFormError}</p>
        ) : null}

        <SectionCardPicking id="wms-pick-modes">
          <WmsPickingStatusConfig
            savedConfigs={savedConfigs}
            draft={draft}
            pickingConfigsLoading={pickingConfigsLoading}
            pickingPersisting={pickingPersisting}
            orderUiSummary={orderUiSummary}
            setSaveFormError={setSaveFormError}
            setPickingPersistOk={setPickingPersistOk}
            setEditBackup={setEditBackup}
            setSavedConfigs={setSavedConfigs}
            setDraft={setDraft}
            handleDeleteSavedConfig={(id) => void handleDeleteSavedConfig(id)}
          />
        </SectionCardPicking>

        <SectionCardPicking id="wms-pick-queue" title="Lista zleceń" summary="Zbiory, objętość, kurierzy i akcja po zebraniu.">
          <SubsectionPicking title="Zarządzanie zbiorami">
            <FieldGridPicking>
              <WmsControlSettingRow asLabel label="Liczba zamówień w zbiorze wieloelementowych zamówień">
                <input
                  type="number"
                  min={1}
                  max={200}
                  className={numberInputClass}
                  value={extended.multiItemBatchOrdersCount}
                  onChange={(e) =>
                    patchExtended("multiItemBatchOrdersCount", Math.max(1, Math.min(200, Math.floor(Number(e.target.value) || 1))))
                  }
                />
              </WmsControlSettingRow>
              <WmsControlSettingRow asLabel label="Liczba zamówień w zbiorze jednoelementowych zamówień">
                <input
                  type="number"
                  min={1}
                  max={200}
                  className={numberInputClass}
                  value={extended.singleItemBatchOrdersCount}
                  onChange={(e) =>
                    patchExtended("singleItemBatchOrdersCount", Math.max(1, Math.min(200, Math.floor(Number(e.target.value) || 1))))
                  }
                />
              </WmsControlSettingRow>
              <WmsControlSettingRow
                asLabel
                label="Objętość zamówień jednoelementowych"
                hint="0 = bez limitu objętości"
              >
                <input
                  type="number"
                  min={0}
                  max={999999}
                  className={numberInputClass}
                  value={extended.singleItemVolumeLimit}
                  onChange={(e) => patchExtended("singleItemVolumeLimit", Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                />
              </WmsControlSettingRow>
              <WmsControlSettingRow
                asLabel
                settingId="picking.batch_management_mode"
                label="Zarządzanie zbiorami"
              >
                <select
                  className={selectClass}
                  value={extended.batchManagementMode}
                  onChange={(e) =>
                    patchExtended("batchManagementMode", e.target.value as WmsPickingExtendedUiSettings["batchManagementMode"])
                  }
                >
                  <option value="manual">Ręczny</option>
                  <option value="auto_assign_picker">Auto przypisanie zbierającego</option>
                  <option value="full_auto">Pełna automatyzacja</option>
                </select>
              </WmsControlSettingRow>
            </FieldGridPicking>
            <div className="mt-6 border-t border-slate-200/50 pt-4">
              <CustomCheckbox label="Sortuj po wieku zamówienia" checked={extended.sortOrdersByAge} onChange={(v) => patchExtended("sortOrdersByAge", v)} />
            </div>
          </SubsectionPicking>

          <SubsectionPicking title="Akcja po zebraniu zbioru zamówień">
            <div className="mt-2 flex flex-col gap-3">
              {(
                [
                  ["assign_new_batch", "Przydziel nowy zbiór"],
                  ["back_to_list", "Powrót na listę"],
                  ["stay_here", "Zostań na ekranie"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200/80 bg-white px-4 py-3 text-sm font-medium transition-colors hover:border-slate-300"
                >
                  <input
                    type="radio"
                    name="after-batch-picking"
                    className={radioInputClass}
                    checked={extended.afterBatchCompleteAction === value}
                    onChange={() => patchExtended("afterBatchCompleteAction", value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </SubsectionPicking>

          <SubsectionPicking title="Reguły procesu">
            <FieldGridPicking>
              <CustomCheckbox
                label="Oddziel zamówienia z trybu sprzedaży bezpośredniej"
                checked={extended.separateDirectSalesOrders}
                onChange={(v) => patchExtended("separateDirectSalesOrders", v)}
              />
              <CustomCheckbox
                label="Zbieraj wybrane produkty w Trybie Pakowania"
                checked={extended.allowPickInsidePackingMode}
                onChange={(v) => patchExtended("allowPickInsidePackingMode", v)}
              />
            </FieldGridPicking>
          </SubsectionPicking>

          <SubsectionPicking title="Kolejność zbierania według kurierów">
            <FieldGridPicking>
              <CustomCheckbox label="Plakietka kuriera" checked={extended.showCourierBadge} onChange={(v) => patchExtended("showCourierBadge", v)} />
              <CustomCheckbox label="Sortuj zamówienia według kurierów" checked={extended.sortOrdersByCourier} onChange={(v) => patchExtended("sortOrdersByCourier", v)} />
              <CustomCheckbox label="Priorytetyzuj ekspres" checked={extended.prioritizeExpressOrders} onChange={(v) => patchExtended("prioritizeExpressOrders", v)} />
            </FieldGridPicking>
          </SubsectionPicking>

          {warehouseUsesBulkLimits ? (
            <SubsectionPicking
              title="Limity zbioru (bez wymuszenia skanowania)"
              description="Wspólne dla magazynu — stosowane tam, gdzie w regule wybrano „Do wózka bez wymuszenia skanowania kodu kreskowego”."
            >
              <WmsPickingLogisticsBulkLimitsSection
                visible
                showSingleField={showGlobalBulkSingleField}
                showMultiField={showGlobalBulkMultiField}
                showAllField={showGlobalBulkAllField}
                maxSingleItemOrders={globalBulkSingle}
                maxMultiItemOrders={globalBulkMulti}
                maxAllOrders={globalBulkAll}
                onChangeMaxSingle={(v) => {
                  setGlobalBulkSingle(v);
                  setSaveFormError(null);
                }}
                onChangeMaxMulti={(v) => {
                  setGlobalBulkMulti(v);
                  setSaveFormError(null);
                }}
                onChangeMaxAll={(v) => {
                  setGlobalBulkAll(v);
                  setSaveFormError(null);
                }}
                onBlurMaxSingle={() => setGlobalBulkSingleBlurred(true)}
                onBlurMaxMulti={() => setGlobalBulkMultiBlurred(true)}
                onBlurMaxAll={() => setGlobalBulkAllBlurred(true)}
                errorSingle={globalBulkSingleErr}
                errorMulti={globalBulkMultiErr}
                errorAll={globalBulkAllErr}
              />
            </SubsectionPicking>
          ) : (
            <p className="mt-6 border-t border-slate-200/50 pt-6 text-xs text-slate-500">
              Limity zbioru pojawią się tutaj, gdy w którejś regule wybierzesz „Do wózka bez wymuszenia skanowania kodu
              kreskowego”.
            </p>
          )}

          <SubsectionPicking
            title="Integracje / dokumenty"
            description={
              <>
                Dokumenty sprzedaży konfigurujesz w zakładce{" "}
                <strong className="font-semibold text-slate-900">Pakowanie</strong> — w module zbierania nie ma osobnych
                pól dokumentów.
              </>
            }
          />
        </SectionCardPicking>

        <SectionCardPicking id="wms-pick-scan" title="Walidacja zbierania">
          <FieldGridPicking>
            <CustomCheckbox
              settingId="picking.require_product_scan"
              label="Wymagane skanowanie produktu przynajmniej jeden raz"
              hint={PICKING_TERMINAL_SETTING_HINTS.requireProductScanAtLeastOnce}
              checked={extended.requireProductScanAtLeastOnce}
              onChange={(v) => patchExtended("requireProductScanAtLeastOnce", v)}
            />
            <CustomCheckbox
              settingId="picking.require_location_scan"
              label="Wymagane skanowanie lokalizacji"
              hint={PICKING_TERMINAL_SETTING_HINTS.requireLocationScan}
              checked={extended.requireLocationScan}
              onChange={(v) => patchExtended("requireLocationScan", v)}
            />
            <CustomCheckbox
              label="Wyłącz wymuszenie skanu lokalizacji przy wielu lokalizacjach"
              hint={PICKING_TERMINAL_SETTING_HINTS.disableForceLocationScanWhenManyLocations}
              checked={extended.disableForceLocationScanWhenManyLocations}
              onChange={(v) => patchExtended("disableForceLocationScanWhenManyLocations", v)}
            />
            <CustomCheckbox
              label="Zezwól na zbieranie z lokalizacji rezerwowej"
              hint={PICKING_TERMINAL_SETTING_HINTS.allowReserveLocationPicking}
              checked={extended.allowReserveLocationPicking}
              onChange={(v) => patchExtended("allowReserveLocationPicking", v)}
            />
            <CustomCheckbox
              settingId="picking.allow_products_without_ean"
              label="Produkty bez kodu EAN"
              hint={PICKING_TERMINAL_SETTING_HINTS.allowProductsWithoutEan}
              checked={extended.allowProductsWithoutEan}
              onChange={(v) => patchExtended("allowProductsWithoutEan", v)}
            />
          </FieldGridPicking>
        </SectionCardPicking>

        <SectionCardPicking id="wms-pick-carts" title="Metody zbierania" summary="Typ kontenera, skany startowe i auto-sugestie.">
          <FieldGridPicking>
            <WmsControlSettingRow asLabel label="Domyślny typ kontenera">
              <select
                className={selectClass}
                value={extended.defaultPickingContainerType}
                onChange={(e) =>
                  patchExtended(
                    "defaultPickingContainerType",
                    e.target.value as WmsPickingExtendedUiSettings["defaultPickingContainerType"],
                  )
                }
              >
                <option value="cart">Wózek</option>
                <option value="cart_with_baskets">Wózek z koszykami</option>
                <option value="basket">Koszyk</option>
              </select>
            </WmsControlSettingRow>
            <CustomCheckbox label="Wymagaj skanu wózka na start" checked={extended.requireCartScanStart} onChange={(v) => patchExtended("requireCartScanStart", v)} />
            <CustomCheckbox label="Wymagaj skanu koszyka na start" checked={extended.requireBasketScanStart} onChange={(v) => patchExtended("requireBasketScanStart", v)} />
            <CustomCheckbox label="Auto-sugestia wózka" checked={extended.autoSuggestCart} onChange={(v) => patchExtended("autoSuggestCart", v)} />
            <CustomCheckbox label="Auto-sugestia trasy" checked={extended.autoSuggestRoute} onChange={(v) => patchExtended("autoSuggestRoute", v)} />
          </FieldGridPicking>
        </SectionCardPicking>

        <SectionCardPicking id="wms-pick-shortage" title="Braki przy zbieraniu" summary="Statusy po zgłoszeniu braku, priorytety i dogrywka.">
          <SubsectionPicking title="Status zamówienia z brakującymi produktami" description="Preferencja lokalna (przeglądarka) — uzupełnienie do ustawień API poniżej.">
            <WmsControlSettingRow label="Status zamówienia z brakującymi produktami">
              <OrderUiStatusField
                panelSummary={orderUiSummary}
                panelSubgroups={panelSubgroups}
                selectedStatusId={extended.shortageOrderStatusId}
                onPick={(id) => patchExtended("shortageOrderStatusId", id)}
                allowClear
                clearLabel="— brak —"
                placeholder="Wybierz status…"
              />
            </WmsControlSettingRow>
          </SubsectionPicking>

          <PickingShortageSettingsPanel
            ref={shortageRef}
            tenantId={DAMAGE_TENANT_ID}
            warehouseId={warehouseId}
            statusOptionsFlat={statusOptionsFlat}
            orderUiSummary={orderUiSummary}
            panelSubgroups={panelSubgroups}
            orderUiLoading={orderUiLoading}
            orderUiErr={orderUiErr}
            onDirtyChange={setShortagePanelDirty}
          />
          <SubsectionPicking title="Notatki i ostrzeżenia (UI)">
            <FieldGridPicking>
              <CustomCheckbox label="Pokaż wszystkie notatki" checked={extended.showAllNotes} onChange={(v) => patchExtended("showAllNotes", v)} />
              <CustomCheckbox label="Wyskakujące notatki" checked={extended.notesPopup} onChange={(v) => patchExtended("notesPopup", v)} />
              <CustomCheckbox label="Pokaż ostrzeżenia" checked={extended.showWarnings} onChange={(v) => patchExtended("showWarnings", v)} />
              <CustomCheckbox label="Podpowiedzi braków" checked={extended.showMissingProductsHints} onChange={(v) => patchExtended("showMissingProductsHints", v)} />
            </FieldGridPicking>
          </SubsectionPicking>
        </SectionCardPicking>

        <SectionCardPicking id="wms-pick-warehouses" title="Magazyny" summary="Podział pracy i identyfikatory magazynów.">
          <FieldGridPicking>
            <CustomCheckbox
              label="Rozdziel pracę między magazynami"
              checked={extended.splitWorkBetweenWarehouses}
              onChange={(v) => patchExtended("splitWorkBetweenWarehouses", v)}
            />
            <CustomCheckbox
              label="Ignoruj stany magazynowe lokalizacji"
              checked={extended.ignoreLocationStockLevels}
              onChange={(v) => patchExtended("ignoreLocationStockLevels", v)}
            />
            <CustomCheckbox label="Zbieranie strefowe" checked={extended.zonePickingEnabled} onChange={(v) => patchExtended("zonePickingEnabled", v)} />
            <WmsControlSettingRow asLabel label="Główny magazyn zbierania">
              <input
                className={textInputClassPicking}
                value={extended.mainPickingWarehouse}
                onChange={(e) => patchExtended("mainPickingWarehouse", e.target.value)}
                placeholder="ID lub nazwa"
              />
            </WmsControlSettingRow>
            <WmsControlSettingRow asLabel label="Magazyn zapasowy">
              <input
                className={textInputClassPicking}
                value={extended.fallbackWarehouse}
                onChange={(e) => patchExtended("fallbackWarehouse", e.target.value)}
                placeholder="ID lub nazwa"
              />
            </WmsControlSettingRow>
          </FieldGridPicking>
        </SectionCardPicking>

        <SectionCardPicking id="wms-pick-automation" title="Automatyzacja" summary="Automatyczne akcje podczas i po zbieraniu.">
          <FieldGridPicking>
            <CustomCheckbox label="Auto: następne zamówienie" checked={extended.autoStartNextOrder} onChange={(v) => patchExtended("autoStartNextOrder", v)} />
            <CustomCheckbox label="Auto: otwórz skaner" checked={extended.autoOpenScanner} onChange={(v) => patchExtended("autoOpenScanner", v)} />
            <CustomCheckbox label="Auto: oznaczaj zebrane linie" checked={extended.autoMarkPickedLines} onChange={(v) => patchExtended("autoMarkPickedLines", v)} />
            <CustomCheckbox label="Auto: przejdź do statusu pakowania" checked={extended.autoMoveToPackingStatus} onChange={(v) => patchExtended("autoMoveToPackingStatus", v)} />
            <CustomCheckbox label="Auto: druk etykiet przesunięć" checked={extended.autoPrintTransferLabels} onChange={(v) => patchExtended("autoPrintTransferLabels", v)} />
          </FieldGridPicking>
        </SectionCardPicking>

        <SectionCardPicking id="wms-pick-view" title="Widok">
          <SubsectionPicking title="Lista zbierania">
            <FieldGridPicking>
              <CustomCheckbox label="Zdjęcie produktu" checked={extended.showProductImage} onChange={(v) => patchExtended("showProductImage", v)} />
              <CustomCheckbox label="EAN" checked={extended.showEAN} onChange={(v) => patchExtended("showEAN", v)} />
              <CustomCheckbox label="SKU" checked={extended.showSKU} onChange={(v) => patchExtended("showSKU", v)} />
              <CustomCheckbox label="Numer katalogowy" checked={extended.showCatalogNumber} onChange={(v) => patchExtended("showCatalogNumber", v)} />
              <CustomCheckbox label="Stan magazynowy" checked={extended.showStock} onChange={(v) => patchExtended("showStock", v)} />
              <CustomCheckbox label="Lokalizacja" checked={extended.showLocation} onChange={(v) => patchExtended("showLocation", v)} />
            </FieldGridPicking>
          </SubsectionPicking>
        </SectionCardPicking>

        <SectionCardPicking id="wms-pick-advanced" title="Zaawansowane" summary="Diagnostyka, legacy i routing.">
          <FieldGridPicking>
            <CustomCheckbox
              label="[BETA] Korzystaj z dostępności produktów u dostawców"
              checked={extended.supplierAvailabilityCheck}
              onChange={(v) => patchExtended("supplierAvailabilityCheck", v)}
            />
            <CustomCheckbox label="Tryb legacy" checked={extended.legacyMode} onChange={(v) => patchExtended("legacyMode", v)} />
            <CustomCheckbox label="Tryb debug" hint="Logi diagnostyczne" checked={extended.debugMode} onChange={(v) => patchExtended("debugMode", v)} />
            <CustomCheckbox label="Zaawansowany routing" hint="Algorytm tras" checked={extended.advancedRoutingMode} onChange={(v) => patchExtended("advancedRoutingMode", v)} />
          </FieldGridPicking>
        </SectionCardPicking>
      </WmsSettingsTabFrame>

      <PickingSettingsModal
        open={draft != null}
        title={editBackup ? "Edycja konfiguracji zbierania" : "Konfigurator trybu zbierania"}
        subtitle="Zmiany w regule zatwierdzasz tutaj; zapis na serwer — paskiem na dole strony ustawień WMS."
        onClose={closeDraftEditor}
        onSave={() => {
          commitDraftLocally();
        }}
        dirty={draftDirty}
        saving={pickingPersisting}
        saveError={draft != null ? saveFormError : null}
      >
        {draft != null ? (
          <PickingConfiguratorEditor
            fieldIdPrefix={`picking-draft-${draft.id.slice(0, 8)}`}
            warehouseId={warehouseId}
            orderUiSummary={orderUiSummary}
            panelSubgroups={panelSubgroups}
            orderUiLoading={orderUiLoading}
            orderUiErr={orderUiErr}
            excludeSourceStatusIds={excludeSourceStatusIds}
            packingStartStatusIds={packingStartStatusIds}
            statusToPick={draft.statusToPick}
            statusAfterPick={draft.statusAfterPick}
            onStatusToPickChange={(v) => setDraft((d) => (d ? { ...d, statusToPick: v } : d))}
            onStatusAfterPickChange={(v) => setDraft((d) => (d ? { ...d, statusAfterPick: v } : d))}
            onStatusToPickBlur={() => setDraft((d) => (d ? { ...d, statusToPickBlurred: true } : d))}
            onStatusAfterPickBlur={() => setDraft((d) => (d ? { ...d, statusAfterPickBlurred: true } : d))}
            statusToPickShowError={draft.statusToPickBlurred}
            statusAfterPickShowError={draft.statusAfterPickBlurred}
            statusPairConflict={Boolean(statusPairConflictDraft)}
            pickingMode={draft.pickingMode}
            onPickingModeChange={(mode) =>
              setDraft((d) => (d ? { ...d, pickingMode: mode, blocks: normalizeBlocksForPickingMode(d.blocks, mode) } : d))
            }
            orderSort={draft.orderSort}
            onOrderSortChange={(sort) => setDraft((d) => (d ? { ...d, orderSort: sort } : d))}
            allOrderSort={draft.allOrderSort}
            onAllOrderSortChange={(sort) => setDraft((d) => (d ? { ...d, allOrderSort: sort } : d))}
            blocks={draft.blocks}
            patchBlock={patchDraftBlock}
            isProductionMode={draft.isProductionMode}
            onIsProductionModeChange={(v) => setDraft((d) => (d ? { ...d, isProductionMode: v } : d))}
            statusOnComponentShortage={draft.statusOnComponentShortage}
            onStatusOnComponentShortageChange={(v) =>
              setDraft((d) => (d ? { ...d, statusOnComponentShortage: v } : d))
            }
            finishedGoodsBufferLocationId={draft.finishedGoodsBufferLocationId}
            onFinishedGoodsBufferLocationIdChange={(v) =>
              setDraft((d) => (d ? { ...d, finishedGoodsBufferLocationId: v } : d))
            }
            productionExecutionMethod={draft.productionExecutionMethod}
            onProductionExecutionMethodChange={(v) =>
              setDraft((d) => (d ? { ...d, productionExecutionMethod: v } : d))
            }
            afterProductionAction={draft.afterProductionAction}
            onAfterProductionActionChange={(v) =>
              setDraft((d) => (d ? { ...d, afterProductionAction: v } : d))
            }
            bufferLocations={bufferLocations}
          />
        ) : null}
      </PickingSettingsModal>
    </>
  );
}

