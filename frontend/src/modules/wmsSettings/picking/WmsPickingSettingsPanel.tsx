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
import {
  WmsBoolSettingRow,
  WmsControlSettingRow,
  wmsSettingControlInputClass,
  wmsSettingControlSelectClass,
  wmsSettingsRowsStackClass,
} from "../../../pages/Settings/wmsSettingsUi";
import { OrderUiStatusField } from "../../../components/orders/OrderUiStatusField";
import { PickingSettingsModal } from "./PickingSettingsModal";
import { WMS_PICKING_SETTINGS_NAV_SECTIONS } from "./pickingSettingsNavSections";
import {
  BY_PRODUCTS_MULTI_CONTAINER_OPTIONS,
  BY_PRODUCTS_SINGLE_CONTAINER_OPTIONS,
  PICKING_COLLECTION_MODE_OPTIONS,
  ORDER_SORT_DATE_COURIER,
  ORDER_SORT_LOCATION_DATE_COURIER,
  coerceConsolidationOrderSort,
  containerLabel,
  ensureContainerInOptions,
  showsByOrdersOrderSort,
  showsConsolidationOrderSort,
  showsSingleItemOrderSort,
} from "./pickingConfiguratorOptions";
import { brandPrimaryButtonClass } from "../../../design-system/brandUi";

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
  title: string;
  summary?: string;
  children: ReactNode;
}) {
  const meta = WMS_PICKING_SETTINGS_NAV_SECTIONS.find((s) => s.id === id);
  return (
    <WmsSettingsSection
      id={id}
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
type PickingOrderTypeKey = "single_item" | "multi_item";

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
  blocks: Record<PickingOrderTypeKey, PickingBlockState>;
};

function fingerprintPickingConfigsWarehouseState(
  configs: SavedPickingConfiguration[],
  globalBulkSingle: string,
  globalBulkMulti: string,
): string {
  const sorted = [...configs].sort(
    (a, b) => a.statusToPickId - b.statusToPickId || String(a.id).localeCompare(String(b.id)),
  );
  return stableStringifyPicking({ cfgs: sorted, globalBulkSingle, globalBulkMulti });
}

type PickingConfigDraft = {
  id: string;
  statusToPick: string;
  statusAfterPick: string;
  statusToPickBlurred: boolean;
  statusAfterPickBlurred: boolean;
  pickingMode: PickingMode;
  orderSort: PickingOrderSort;
  blocks: Record<PickingOrderTypeKey, PickingBlockState>;
};

function fingerprintDraftForm(d: PickingConfigDraft): string {
  return stableStringifyPicking({
    statusToPick: d.statusToPick.trim(),
    statusAfterPick: d.statusAfterPick.trim(),
    pickingMode: d.pickingMode,
    orderSort: d.orderSort,
    blocks: d.blocks,
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
    blocks: normalizeBlocksForPickingMode(createInitialPickingBlocks(), pickingModeDefault),
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
  }
  if (single.containers === "consolidation_rack") {
    single = { ...single, containers: "cart_scan" };
  }
  return { single_item: single, multi_item: multi };
}

function pickingModeLabel(mode: PickingMode): string {
  return PICKING_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? mode;
}

function pickingOrderSortLabel(sort: PickingOrderSort): string {
  return PICKING_ORDER_SORT_OPTIONS.find((o) => o.value === sort)?.label ?? sort;
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
  const blocks = normalizeBlocksForPickingMode(
    {
      single_item: mk(row.single_mode),
      multi_item: mk(row.multi_mode),
    },
    pickingMode,
  );
  const rawSort = row.order_sort;
  const orderSort: PickingOrderSort =
    rawSort === "location" || rawSort === "courier" || rawSort === "date" ? rawSort : "date";
  return {
    id: String(row.id),
    statusToPickId: row.source_status_id,
    statusToPickName: row.source_status_name?.trim() || `Status #${row.source_status_id}`,
    statusAfterPickId: row.target_status_id,
    statusAfterPickName: row.target_status_name?.trim() || `Status #${row.target_status_id}`,
    statusOnShortageId: null,
    statusOnShortageName: null,
    pickingMode,
    orderSort,
    blocks,
  };
}

function uiContainersToDbMode(c: PickingContainers): PickingConfigModeDb {
  if (c === "cart_no_scan") return "bulk";
  if (c === "cart_scan") return "scanned";
  if (c === "baskets") return "baskets";
  if (c === "consolidation_rack") return "consolidation_rack";
  return "mobile";
}

function validateSavedConfigForServer(cfg: SavedPickingConfiguration): string | null {
  if (cfg.statusToPickId === cfg.statusAfterPickId) {
    return `Reguła „${cfg.statusToPickName}”: status do zbierania i po zebraniu muszą się różnić.`;
  }
  if (cfg.blocks.single_item.containers === "consolidation_rack") {
    return `Reguła „${cfg.statusToPickName}”: regał kompletacyjny jest dostępny tylko dla zamówień wieloelementowych.`;
  }
  return null;
}

function validateGlobalBulkLimitsForWarehouse(
  configs: SavedPickingConfiguration[],
  globalBulkSingle: string,
  globalBulkMulti: string,
): string | null {
  const needsSingle = configs.some((c) => c.blocks.single_item.containers === "cart_no_scan");
  const needsMulti = configs.some((c) => c.blocks.multi_item.containers === "cart_no_scan");
  if (needsSingle) {
    const p = parseBulkOrderLimitInput(globalBulkSingle, BULK_ORDER_LIMIT_MAX);
    if (!p.ok) return `Limity zbioru (magazyn) — jednoelementowe: ${p.message}`;
  }
  if (needsMulti) {
    const p = parseBulkOrderLimitInput(globalBulkMulti, BULK_ORDER_LIMIT_MAX);
    if (!p.ok) return `Limity zbioru (magazyn) — wieloelementowe: ${p.message}`;
  }
  return null;
}

function savedConfigToReplaceItem(
  cfg: SavedPickingConfiguration,
  globalBulk: { single: string; multi: string },
): WmsPickingConfigReplaceItem {
  const singleMode = uiContainersToDbMode(cfg.blocks.single_item.containers);
  const multiMode = uiContainersToDbMode(cfg.blocks.multi_item.containers);
  const pick_unit = cfg.pickingMode === "by_products" ? "products" : "orders";
  let order_sort: PickingConfigOrderSortDb = cfg.orderSort;
  if (
    cfg.pickingMode === "by_products" &&
    cfg.blocks.multi_item.containers === "consolidation_rack"
  ) {
    order_sort = coerceConsolidationOrderSort(cfg.orderSort);
  }
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
  return {
    source_status_id: cfg.statusToPickId,
    target_status_id: cfg.statusAfterPickId,
    status_on_shortage_id: null,
    single_mode: singleMode,
    multi_mode: multiMode,
    pick_unit,
    order_sort,
    max_single_orders,
    max_multi_orders,
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
    blocks: normalizeBlocksForPickingMode(
      {
        single_item: { ...cfg.blocks.single_item },
        multi_item: { ...cfg.blocks.multi_item },
      },
      cfg.pickingMode,
    ),
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
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-900">{legend}</p>
      <div className="mt-2 flex flex-col gap-1.5" role="radiogroup" aria-label={legend}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <label
              key={opt.value}
              className={[
                "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors",
                selected
                  ? "border-blue-500 bg-blue-50/40 ring-1 ring-blue-500/15"
                  : "border-slate-200 bg-white hover:border-slate-300",
              ].join(" ")}
            >
              <input
                type="radio"
                name={name}
                className={`${radioInputClass} mt-0.5`}
                checked={selected}
                onChange={() => onChange(opt.value)}
              />
              <span className="min-w-0 text-sm font-medium leading-snug text-slate-900">{opt.label}</span>
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
  options: Array<{ value: PickingOrderSort; label: string }>;
  onChange: (v: PickingOrderSort) => void;
}) {
  const safeValue = options.some((o) => o.value === value) ? value : options[0]!.value;
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
      <PickingRadioGroup
        legend={legend}
        name={name}
        value={safeValue}
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
  maxSingleItemOrders,
  maxMultiItemOrders,
  onChangeMaxSingle,
  onChangeMaxMulti,
  onBlurMaxSingle,
  onBlurMaxMulti,
  errorSingle,
  errorMulti,
}: {
  visible: boolean;
  showSingleField: boolean;
  showMultiField: boolean;
  maxSingleItemOrders: string;
  maxMultiItemOrders: string;
  onChangeMaxSingle: (v: string) => void;
  onChangeMaxMulti: (v: string) => void;
  onBlurMaxSingle: () => void;
  onBlurMaxMulti: () => void;
  errorSingle: string | null;
  errorMulti: string | null;
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
  blocks,
  patchBlock,
}: {
  fieldIdPrefix: string;
  warehouseId: number | null;
  orderUiSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
  orderUiLoading: boolean;
  orderUiErr: string | null;
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
  blocks: Record<PickingOrderTypeKey, PickingBlockState>;
  patchBlock: (key: PickingOrderTypeKey, patch: Partial<PickingBlockState>) => void;
}) {
  const allStatusOptions = useMemo(() => flattenOrderUiStatusOptions(orderUiSummary), [orderUiSummary]);

  const selectDisabled =
    warehouseId == null || orderUiLoading || orderUiErr != null || allStatusOptions.length === 0;

  const canPickStatus = !selectDisabled;
  const statusToPickRequired = canPickStatus && statusToPickShowError && statusToPick === "";
  const statusAfterPickRequired = canPickStatus && statusAfterPickShowError && statusAfterPick === "";

  const multiContainers = blocks.multi_item.containers;
  const singleContainers = blocks.single_item.containers;
  const showByOrdersSort = showsByOrdersOrderSort(pickingMode);
  const showConsolidationSort = showsConsolidationOrderSort(pickingMode, multiContainers);
  const showSingleSort = showsSingleItemOrderSort(pickingMode, singleContainers, multiContainers);
  const byProducts = pickingMode === "by_products";

  return (
    <div className="space-y-4" aria-label="Konfigurator trybu zbierania">
      {warehouseId == null ? (
        <p className="text-sm text-amber-800">Wybierz magazyn, aby wczytać statusy panelu zamówień.</p>
      ) : null}
      {orderUiErr ? <p className="text-sm text-red-700">{orderUiErr}</p> : null}
      {!orderUiLoading && warehouseId != null && orderUiErr == null && allStatusOptions.length === 0 ? (
        <p className="text-sm text-slate-600">
          Brak statusów panelu dla tego magazynu. Dodaj je w ustawieniach zamówień (statusy panelu).
        </p>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-3.5">
        <WmsControlSettingRow
          label={
            <>
              Status do zbierania
              <span className="ml-1 text-red-600" aria-hidden>
                *
              </span>
            </>
          }
          hint="Wybierz status zamówienia, z którego startuje zbieranie. Każdy status może mieć jedną konfigurację."
          footer={
            <>
              {statusToPickRequired ? (
                <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
                  To pole jest wymagane.
                </p>
              ) : null}
              {statusPairConflict ? (
                <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
                  Status do zbierania nie może być taki sam jak status do pakowania.
                </p>
              ) : null}
            </>
          }
        >
          <OrderUiStatusField
            panelSummary={orderUiSummary}
            panelSubgroups={panelSubgroups}
            selectedStatusId={statusIdFromSettingValue(statusToPick)}
            onPick={(id) => {
              onStatusToPickChange(id != null ? String(id) : "");
              onStatusToPickBlur();
            }}
            allowClear
            clearLabel="— wybierz —"
            placeholder="Wybierz status zamówienia…"
            disabled={selectDisabled}
          />
        </WmsControlSettingRow>
      </div>

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
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <PickingRadioGroup
              legend="Jak chcesz zbierać zamówienia wieloelementowe?"
              name={`${fieldIdPrefix}-multi-where`}
              value={multiContainers}
              options={BY_PRODUCTS_MULTI_CONTAINER_OPTIONS}
              onChange={(v) => {
                patchBlock("multi_item", { containers: v });
                if (v === "consolidation_rack") {
                  onOrderSortChange(coerceConsolidationOrderSort(orderSort));
                }
              }}
            />
            {showConsolidationSort ? (
              <PickingNestedOrderSort
                legend="Wybierz sposób doboru zamówień wieloelementowych:"
                name={`${fieldIdPrefix}-multi-order-sort`}
                value={coerceConsolidationOrderSort(orderSort)}
                options={ORDER_SORT_DATE_COURIER}
                onChange={onOrderSortChange}
              />
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <PickingRadioGroup
              legend="Jak chcesz zbierać zamówienia jednoelementowe?"
              name={`${fieldIdPrefix}-single-where`}
              value={singleContainers}
              options={BY_PRODUCTS_SINGLE_CONTAINER_OPTIONS}
              onChange={(v) => patchBlock("single_item", { containers: v })}
            />
            {showSingleSort ? (
              <PickingNestedOrderSort
                legend="Wybierz sposób doboru zamówień jednoelementowych:"
                name={`${fieldIdPrefix}-single-order-sort`}
                value={orderSort}
                options={ORDER_SORT_LOCATION_DATE_COURIER}
                onChange={onOrderSortChange}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-3.5">
        <WmsControlSettingRow
          label={
            <>
              Wybierz status do pakowania zamówienia
              <span className="ml-1 text-red-600" aria-hidden>
                *
              </span>
            </>
          }
          hint="Status, na który zamówienie przechodzi po zakończeniu zbierania."
          footer={
            <>
              {statusAfterPickRequired ? (
                <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
                  Wybierz status do pakowania.
                </p>
              ) : null}
              {statusPairConflict ? (
                <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
                  Wybierz inny status niż „do zbierania”, aby uniknąć pętli w procesie.
                </p>
              ) : null}
            </>
          }
        >
          <OrderUiStatusField
            panelSummary={orderUiSummary}
            panelSubgroups={panelSubgroups}
            selectedStatusId={statusIdFromSettingValue(statusAfterPick)}
            onPick={(id) => {
              onStatusAfterPickChange(id != null ? String(id) : "");
              onStatusAfterPickBlur();
            }}
            allowClear
            clearLabel="— wybierz —"
            placeholder="Wybierz status…"
            disabled={selectDisabled}
          />
        </WmsControlSettingRow>
      </div>
    </div>
  );
}

function SavedPickingConfigSummaryCard({
  config,
  onEdit,
  onDelete,
  actionsDisabled,
  isDefault,
}: {
  config: SavedPickingConfiguration;
  onEdit: (config: SavedPickingConfiguration) => void;
  onDelete: (id: string) => void;
  actionsDisabled?: boolean;
  /** Only when product has an explicit default-config concept. */
  isDefault?: boolean;
}) {
  const modeLabel = pickingModeLabel(config.pickingMode);
  const orderSortHint = pickingOrderSortLabel(config.orderSort);
  const singleWhere = pickingWhereLabel(config.blocks.single_item.containers, "single_item");
  const multiWhere = pickingWhereLabel(config.blocks.multi_item.containers, "multi_item");
  const byProducts = config.pickingMode === "by_products";

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-slate-300"
      aria-label={`Zapisana konfiguracja: ${config.statusToPickName}`}
    >
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-4">
        <div className="grid min-w-0 flex-1 gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Konfiguracja</p>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
              <h4 className="truncate text-sm font-semibold leading-snug text-slate-900">
                {config.statusToPickName}
              </h4>
              {isDefault ? (
                <span className="shrink-0 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Domyślny
                </span>
              ) : null}
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tryb zbierania</p>
            <p className="mt-0.5 text-sm font-medium leading-snug text-slate-900">{modeLabel}</p>
            <p className="mt-0.5 truncate text-xs leading-snug text-slate-500" title={orderSortHint}>
              {orderSortHint}
            </p>
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ustawienia</p>
            {byProducts ? (
              <>
                <p className="mt-0.5 truncate text-xs leading-snug text-slate-700" title={multiWhere}>
                  <span className="font-medium text-slate-500">Multi:</span> {multiWhere}
                </p>
                <p className="mt-0.5 truncate text-xs leading-snug text-slate-700" title={singleWhere}>
                  <span className="font-medium text-slate-500">1-el:</span> {singleWhere}
                </p>
              </>
            ) : (
              <p className="mt-0.5 text-xs leading-snug text-slate-700">Dobór zamówień wg kolejności powyżej</p>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Do pakowania</p>
            <p className="mt-0.5 truncate text-sm font-medium leading-snug text-slate-900" title={config.statusAfterPickName}>
              {config.statusAfterPickName}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 self-stretch border-t border-slate-100 pt-2 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <button
            type="button"
            className="inline-flex flex-1 items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 lg:flex-none"
            disabled={actionsDisabled}
            onClick={() => onEdit(config)}
          >
            Edytuj
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-red-100 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            disabled={actionsDisabled}
            onClick={() => onDelete(config.id)}
            aria-label="Usuń"
          >
            Usuń
          </button>
        </div>
      </div>
    </div>
  );
}

function WmsPickingStatusConfig({
  savedConfigs,
  draft,
  pickingConfigsLoading,
  pickingPersisting,
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
  setSaveFormError: Dispatch<SetStateAction<string | null>>;
  setPickingPersistOk: Dispatch<SetStateAction<string | null>>;
  setEditBackup: Dispatch<SetStateAction<SavedPickingConfiguration | null>>;
  setSavedConfigs: Dispatch<SetStateAction<SavedPickingConfiguration[]>>;
  setDraft: Dispatch<SetStateAction<PickingConfigDraft | null>>;
  handleDeleteSavedConfig: (id: string) => void;
}) {
  return (
    <div className="space-y-3" aria-label="Konfigurator zbierania">
      <div className="flex flex-wrap items-center justify-end gap-2">
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
          Dodaj konfigurację zbierania
        </button>
      </div>

      {savedConfigs.length === 0 && !draft && !pickingConfigsLoading ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
          Brak konfiguracji zbierania — dodaj pierwszą powyżej.
        </p>
      ) : null}

      {savedConfigs.length > 0 ? (
        <div className="flex flex-col gap-2">
          {savedConfigs.map((cfg) => (
            <SavedPickingConfigSummaryCard
              key={cfg.id}
              config={cfg}
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

  const [extended, setExtended] = useState<WmsPickingExtendedUiSettings>(() => ({ ...DEFAULT_WMS_PICKING_EXTENDED_UI }));
  const [baselineExtended, setBaselineExtended] = useState<string | null>(null);
  const [extendedOk, setExtendedOk] = useState<string | null>(null);

  const [orderUiSummary, setOrderUiSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [panelSubgroups, setPanelSubgroups] = useState<OrderUiPanelSubgroupRead[]>([]);
  const [orderUiLoading, setOrderUiLoading] = useState(false);
  const [orderUiErr, setOrderUiErr] = useState<string | null>(null);

  const statusOptionsFlat = useMemo(() => flattenOrderUiStatusOptions(orderUiSummary), [orderUiSummary]);

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
    const e = { ...loadWmsPickingExtendedUi(warehouseId) };
    setExtended(e);
    setBaselineExtended(stableStringifyPicking(e));
  }, [warehouseId]);

  function patchExtended<K extends keyof WmsPickingExtendedUiSettings>(key: K, value: WmsPickingExtendedUiSettings[K]) {
    setExtended((prev) => ({ ...prev, [key]: value }));
  }

  const extendedDirty = useMemo(() => {
    if (baselineExtended == null) return false;
    return stableStringifyPicking(extended) !== baselineExtended;
  }, [extended, baselineExtended]);

  const saveExtendedOnly = useCallback(() => {
    if (warehouseId == null) return;
    saveWmsPickingExtendedUi(warehouseId, extended);
    setBaselineExtended(stableStringifyPicking(extended));
    setExtendedOk("Zapisano preferencje widoku zbierania.");
    window.setTimeout(() => setExtendedOk(null), 4000);
  }, [warehouseId, extended]);

  const loadOrderUiStatuses = useCallback(async () => {
    if (warehouseId == null) {
      setOrderUiSummary(null);
      setPanelSubgroups([]);
      setOrderUiErr(null);
      return;
    }
    setOrderUiLoading(true);
    setOrderUiErr(null);
    try {
      const [data, subgroups] = await Promise.all([
        getOrderUiStatusSummary(DAMAGE_TENANT_ID, warehouseId),
        getOrderPanelSubgroups(DAMAGE_TENANT_ID, warehouseId).catch(() => [] as OrderUiPanelSubgroupRead[]),
      ]);
      setOrderUiSummary(data);
      setPanelSubgroups(subgroups);
    } catch {
      setOrderUiErr("Nie udało się wczytać statusów panelu zamówień.");
      setOrderUiSummary(null);
      setPanelSubgroups([]);
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
  const [globalBulkSingleBlurred, setGlobalBulkSingleBlurred] = useState(false);
  const [globalBulkMultiBlurred, setGlobalBulkMultiBlurred] = useState(false);

  const configsBulkDirty =
    baselineConfigsFp != null &&
    fingerprintPickingConfigsWarehouseState(savedConfigs, globalBulkSingle, globalBulkMulti) !== baselineConfigsFp;

  const pickingDirty =
    warehouseId != null &&
    (extendedDirty || configsBulkDirty || shortagePanelDirty || draftDirty);

  useEffect(() => {
    onDirtyChange?.(pickingDirty);
  }, [pickingDirty, onDirtyChange]);

  const inferGlobalBulkLimitsFromRows = useCallback((rows: WmsPickingConfigReadApi[]) => {
    const s = rows.map((r) => r.max_single_orders).find((x) => x != null);
    const m = rows.map((r) => r.max_multi_orders).find((x) => x != null);
    return {
      single: String(s ?? BULK_ORDER_LIMIT_DEFAULT_SINGLE),
      multi: String(m ?? BULK_ORDER_LIMIT_DEFAULT_MULTI),
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
      setBaselineConfigsFp(fingerprintPickingConfigsWarehouseState(savedRows, g.single, g.multi));
      setGlobalBulkSingleBlurred(false);
      setGlobalBulkMultiBlurred(false);
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
        setBaselineConfigsFp(fingerprintPickingConfigsWarehouseState(mapped, g.single, g.multi));
      } else {
        setSavedConfigs([]);
        setBaselineConfigsFp(
          fingerprintPickingConfigsWarehouseState(
            [],
            BULK_ORDER_LIMIT_DEFAULT_SINGLE,
            BULK_ORDER_LIMIT_DEFAULT_MULTI,
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
        const v = validateSavedConfigForServer(cfg);
        if (v) return { ok: false, message: v };
      }
      const gErr = validateGlobalBulkLimitsForWarehouse(configs, globalBulkSingle, globalBulkMulti);
      if (gErr) {
        setGlobalBulkSingleBlurred(true);
        setGlobalBulkMultiBlurred(true);
        return { ok: false, message: gErr };
      }
      let items: WmsPickingConfigReplaceItem[];
      try {
        items = configs.map((c) => savedConfigToReplaceItem(c, { single: globalBulkSingle, multi: globalBulkMulti }));
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
        setBaselineConfigsFp(fingerprintPickingConfigsWarehouseState(saved, g.single, g.multi));
        return { ok: true, saved };
      } catch {
        return { ok: false, message: "Zapis konfiguracji nie powiódł się. Spróbuj ponownie." };
      }
    },
    [warehouseId, globalBulkSingle, globalBulkMulti, inferGlobalBulkLimitsFromRows],
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
      setSaveFormError("Status do zbierania i po zebraniu muszą się różnić.");
      setDraft({ ...d, statusToPickBlurred: true, statusAfterPickBlurred: true });
      return { ok: false };
    }

    if (
      editBackup != null &&
      pickId !== editBackup.statusToPickId &&
      savedConfigs.some((c) => c.statusToPickId === pickId)
    ) {
      setSaveFormError("Ten status ma już zapisaną konfigurację — wybierz inny status do zbierania.");
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

    const namePick = statusOptionsFlat.find((o) => o.id === pickId)?.name ?? `Status #${pickId}`;
    const nameAfter = statusOptionsFlat.find((o) => o.id === afterId)?.name ?? `Status #${afterId}`;

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
      blocks: normalizedBlocks,
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
          fingerprintPickingConfigsWarehouseState(configsToPersist, globalBulkSingle, globalBulkMulti) !==
            baselineConfigsFp;
        if (configsNeedPersist) {
          const result = await persistPickingConfigList(configsToPersist);
          if (!result.ok) throw new Error(result.message);
        }
        if (extendedDirty) {
          saveExtendedOnly();
        }
      },
      discardUnsaved: async () => {
        if (shortageRef.current) await shortageRef.current.discard();
        if (warehouseId != null) {
          const e = { ...loadWmsPickingExtendedUi(warehouseId) };
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
      (c) => c.blocks.single_item.containers === "cart_no_scan" || c.blocks.multi_item.containers === "cart_no_scan",
    );
    const fromDraft =
      draft != null &&
      (draft.blocks.single_item.containers === "cart_no_scan" || draft.blocks.multi_item.containers === "cart_no_scan");
    return fromSaved || fromDraft;
  }, [savedConfigs, draft]);

  const showGlobalBulkSingleField =
    savedConfigs.some((c) => c.blocks.single_item.containers === "cart_no_scan") ||
    (draft != null && draft.blocks.single_item.containers === "cart_no_scan");
  const showGlobalBulkMultiField =
    savedConfigs.some((c) => c.blocks.multi_item.containers === "cart_no_scan") ||
    (draft != null && draft.blocks.multi_item.containers === "cart_no_scan");

  const globalSingleParsed = parseBulkOrderLimitInput(globalBulkSingle, BULK_ORDER_LIMIT_MAX);
  const globalMultiParsed = parseBulkOrderLimitInput(globalBulkMulti, BULK_ORDER_LIMIT_MAX);
  const globalBulkSingleErr =
    warehouseUsesBulkLimits && globalBulkSingleBlurred && !globalSingleParsed.ok ? globalSingleParsed.message : null;
  const globalBulkMultiErr =
    warehouseUsesBulkLimits && globalBulkMultiBlurred && !globalMultiParsed.ok ? globalMultiParsed.message : null;

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
        description="Konfiguracja procesu zbierania, kolejki zleceń i terminala magazyniera."
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
              fingerprintPickingConfigsWarehouseState(configsToPersist, globalBulkSingle, globalBulkMulti) !==
                baselineConfigsFp;
            if (configsNeedPersist) {
              const result = await persistPickingConfigList(configsToPersist);
              if (!result.ok) throw new Error(result.message);
            }
            if (extendedDirty) {
              saveExtendedOnly();
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

        <SectionCardPicking id="wms-pick-modes" title="Konfigurator zbierania">
          <WmsPickingStatusConfig
            savedConfigs={savedConfigs}
            draft={draft}
            pickingConfigsLoading={pickingConfigsLoading}
            pickingPersisting={pickingPersisting}
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
                maxSingleItemOrders={globalBulkSingle}
                maxMultiItemOrders={globalBulkMulti}
                onChangeMaxSingle={(v) => {
                  setGlobalBulkSingle(v);
                  setSaveFormError(null);
                }}
                onChangeMaxMulti={(v) => {
                  setGlobalBulkMulti(v);
                  setSaveFormError(null);
                }}
                onBlurMaxSingle={() => setGlobalBulkSingleBlurred(true)}
                onBlurMaxMulti={() => setGlobalBulkMultiBlurred(true)}
                errorSingle={globalBulkSingleErr}
                errorMulti={globalBulkMultiErr}
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

        <SectionCardPicking id="wms-pick-scan" title="Terminal" summary="Wymagania skanów i reguły walidacji podczas zbierania.">
          <FieldGridPicking>
            <CustomCheckbox
              label="Wymagane skanowanie produktu przynajmniej jeden raz"
              checked={extended.requireProductScanAtLeastOnce}
              onChange={(v) => patchExtended("requireProductScanAtLeastOnce", v)}
            />
            <CustomCheckbox
              label="Wymagane skanowanie lokalizacji"
              checked={extended.requireLocationScan}
              onChange={(v) => patchExtended("requireLocationScan", v)}
            />
            <CustomCheckbox
              label="Wyłącz wymuszenie skanu lokalizacji przy wielu lokalizacjach"
              checked={extended.disableForceLocationScanWhenManyLocations}
              onChange={(v) => patchExtended("disableForceLocationScanWhenManyLocations", v)}
            />
            <CustomCheckbox
              label="Zezwól na zbieranie z lokalizacji rezerwowej"
              checked={extended.allowReserveLocationPicking}
              onChange={(v) => patchExtended("allowReserveLocationPicking", v)}
            />
            <CustomCheckbox
              label="Produkty bez etykiet do koszyków"
              checked={extended.allowProductsWithoutLabelsToBaskets}
              onChange={(v) => patchExtended("allowProductsWithoutLabelsToBaskets", v)}
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

        <SectionCardPicking id="wms-pick-view" title="Widok" summary="Kolumny listy, gęstość i tryb kompaktowy.">
          <SubsectionPicking title="Kolumny produktu (lista zbierania)" description="Wybór informacji widocznych na liście zbierania.">
            <FieldGridPicking>
              <CustomCheckbox label="Zdjęcie produktu" checked={extended.showProductImage} onChange={(v) => patchExtended("showProductImage", v)} />
              <CustomCheckbox label="EAN" checked={extended.showEAN} onChange={(v) => patchExtended("showEAN", v)} />
              <CustomCheckbox label="SKU" checked={extended.showSKU} onChange={(v) => patchExtended("showSKU", v)} />
              <CustomCheckbox label="Numer katalogowy" checked={extended.showCatalogNumber} onChange={(v) => patchExtended("showCatalogNumber", v)} />
              <CustomCheckbox label="Stan magazynowy" checked={extended.showStock} onChange={(v) => patchExtended("showStock", v)} />
              <CustomCheckbox label="Lokalizacja" checked={extended.showLocation} onChange={(v) => patchExtended("showLocation", v)} />
            </FieldGridPicking>
          </SubsectionPicking>
          <SubsectionPicking title="Układ listy">
            <FieldGridPicking>
              <CustomCheckbox
                settingId="picking.compact_mode"
                label="Tryb kompaktowy"
                checked={extended.compactMode}
                onChange={(v) => patchExtended("compactMode", v)}
              />
              <CustomCheckbox label="Plakietka priorytetu" checked={extended.showPriorityBadge} onChange={(v) => patchExtended("showPriorityBadge", v)} />
              <WmsControlSettingRow asLabel settingId="picking.list_density" label="Gęstość listy">
                <select
                  className={selectClass}
                  value={extended.listDensity}
                  onChange={(e) => patchExtended("listDensity", e.target.value as WmsPickingExtendedUiSettings["listDensity"])}
                >
                  <option value="comfortable">Komfortowa</option>
                  <option value="compact">Kompaktowa</option>
                </select>
              </WmsControlSettingRow>
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
            blocks={draft.blocks}
            patchBlock={patchDraftBlock}
          />
        ) : null}
      </PickingSettingsModal>
    </>
  );
}

