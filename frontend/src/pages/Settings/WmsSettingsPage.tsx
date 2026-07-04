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
import { getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import {
  listPickingConfigs,
  replacePickingConfigsForWarehouse,
  type PickingConfigModeDb,
  type PickingConfigOrderSortDb,
  type WmsPickingConfigReadApi,
  type WmsPickingConfigReplaceItem,
} from "../../api/wmsPickingConfigApi";
import { useWarehouse } from "../../context/WarehouseContext";
import type { OrderUiMainGroup, OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { TabsContainer } from "../../components/layout/TabsContainer";
import { tabsNavItemClassName } from "../../components/layout/TabsNav";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import toast from "react-hot-toast";
import { useBlocker } from "react-router-dom";
import {
  DirectSalesSettingsPanel,
  type DirectSalesSettingsPanelHandle,
} from "../../modules/wmsSettings/directSales/DirectSalesSettingsPanel";
import WmsPackingSettingsPanel, { type WmsPackingSettingsPanelHandle } from "./WmsPackingSettingsPanel";
import WmsReturnsSettingsPanel from "./WmsReturnsSettingsPanel";
import WmsInventoryManagementSettingsPanel from "./WmsInventoryManagementSettingsPanel";
import WmsSmartMatchingSettingsPanel from "./WmsSmartMatchingSettingsPanel";
import WmsThreeDMatchingSettingsPanel from "./WmsThreeDMatchingSettingsPanel";
import WmsProductValidationSettingsPanel from "./WmsProductValidationSettingsPanel";
import WmsProductionSettingsPanel from "./WmsProductionSettingsPanel";
import StickySaveBar from "./StickySaveBar";
import { WmsSettingsLayout } from "./WmsSettingsLayout";
import { WMS_PICKING_SETTINGS_NAV_SECTIONS } from "./wmsPickingSettingsNavSections";
import { getWmsSettingsPlaceholderSections } from "./wmsPlaceholderSettingsSections";
import { WMS_SETTINGS_SECTION_ANCHOR_CLASS } from "./wmsSettingsSectionConstants";
import { useWmsSettingsSectionAnchor } from "./WmsSettingsSectionRegistryContext";
import {
  getWmsPickingShortageSettings,
  saveWmsPickingShortageSettings,
  type WmsShortageResolvePriorityApi,
} from "../../api/wmsPickingShortageSettingsApi";
import { getWmsPackingSettings } from "../../api/wmsPackingSettingsApi";
import type { WmsPickingExtendedUiSettings } from "../../types/wmsPickingExtendedUi";
import {
  DEFAULT_WMS_PICKING_EXTENDED_UI,
  loadWmsPickingExtendedUi,
  saveWmsPickingExtendedUi,
} from "../../types/wmsPickingExtendedUi";
import { loadCachedPickingConfigRows, saveCachedPickingConfigRows } from "../../types/wmsPickingConfigLocalCache";

const PANEL_STATUS_GROUP_ORDER: OrderUiMainGroup[] = ["NEW", "IN_PROGRESS", "DONE"];

function flattenOrderUiStatusOptions(summary: OrderUiStatusPanelSummary | null): Array<{ id: number; name: string }> {
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

const selectClass =
  "mt-1.5 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition-all focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500";

const numberInputClass =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums shadow-sm outline-none transition-all focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500";

const fieldHintClass = "mt-1.5 text-xs leading-relaxed text-slate-500";

const configBlockTitleClass = "text-sm font-semibold text-slate-900";

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

const radioLabelClass =
  "flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 hover:bg-slate-50 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500/30";

const radioInputClass = "h-4 w-4 shrink-0 border-slate-300 text-blue-600 focus:ring-blue-500 bg-white cursor-pointer";

const WMS_SETTINGS_TABS = [
  { id: "common", label: "Stany magazynowe" },
  { id: "packing", label: "Pakowanie" },
  { id: "picking", label: "Zbieranie" },
  { id: "direct_sales", label: "Sprzedaż bezpośrednia" },
  { id: "complaints", label: "Reklamacje" },
  { id: "returns", label: "Zwroty" },
  { id: "crossdocking", label: "Crossdocking" },
  { id: "receiving", label: "Przyjęcia" },
  { id: "production", label: "Produkcja" },
  { id: "putaway", label: "Rozlokowania" },
  { id: "transfers", label: "Przesunięcia" },
  { id: "smart_matching", label: "Smart Matching" },
  { id: "three_d_matching", label: "3D Matching" },
] as const;

type WmsSettingsTabId = (typeof WMS_SETTINGS_TABS)[number]["id"];

const textInputClassPicking =
  "mt-1.5 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition-all focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500";

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
  const anchorRef = useWmsSettingsSectionAnchor(id);
  return (
    <section ref={anchorRef} id={id} data-wms-section="" className={`pt-8 mt-8 border-t border-slate-200 first:border-t-0 first:pt-0 first:mt-0 ${WMS_SETTINGS_SECTION_ANCHOR_CLASS}`}>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {summary ? <p className="mt-1 text-sm text-slate-500">{summary}</p> : null}
      </div>
      <div className="space-y-6">
        {children}
      </div>
    </section>
  );
}

function SubsectionPicking({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-5 shadow-sm">
      <div className="mb-4 pb-4 border-b border-slate-100/80">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function FieldGridPicking({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</div>;
}

function HelpPicking({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs leading-relaxed text-slate-500">{children}</p>;
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
    <label className="flex items-start gap-3 cursor-pointer group py-1" title={title}>
      <div className="relative flex items-center justify-center mt-0.5 shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors
          ${checked
            ? 'bg-blue-600 border-blue-600 text-white'
            : 'bg-white border-slate-300 group-hover:border-blue-400'}`}>
          {checked && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
      <span className="min-w-0 flex-1 select-none">
        <span className="block text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">{label}</span>
        {help ? <HelpPicking>{help}</HelpPicking> : null}
      </span>
    </label>
  );
}

function CustomCheckbox({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 cursor-pointer group py-1 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <div className="relative flex items-center justify-center mt-0.5 shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
        />
        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors
          ${checked
            ? 'bg-blue-600 border-blue-600 text-white'
            : 'bg-white border-slate-300 group-hover:border-blue-400'}`}>
          {checked && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
      <span className="min-w-0 flex-1 select-none">
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        {hint && <span className={`${fieldHintClass} block`}>{hint}</span>}
      </span>
    </label>
  );
}

function WmsSettingsPlaceholderOverviewSection({ label, sectionId }: { label: string; sectionId: string }) {
  const anchorRef = useWmsSettingsSectionAnchor(sectionId);
  return (
    <section
      ref={anchorRef}
      id={sectionId}
      data-wms-section=""
      className={`min-h-[240px] rounded-xl border border-dashed border-slate-300 bg-slate-50/50 ${WMS_SETTINGS_SECTION_ANCHOR_CLASS}`}
      aria-label={`Sekcja: ${label}`}
    />
  );
}

function WmsSettingsFutureTabShell({ label, tabId }: { label: string; tabId: string }) {
  const placeholderSections = useMemo(() => getWmsSettingsPlaceholderSections(tabId), [tabId]);
  const overviewId = placeholderSections[0].id;
  return (
    <WmsSettingsLayout
      sections={placeholderSections}
      asideLabel={`Sekcje: ${label}`}
      mainClassName="space-y-5"
    >
      <header className="border-b border-slate-200 pb-3">
        <h2 className="text-base font-semibold text-slate-900">{label}</h2>
        <p className="mt-1 text-xs text-slate-500">Konfiguracja modułu będzie rozwijana w kolejnych wersjach.</p>
      </header>
      <WmsSettingsPlaceholderOverviewSection label={label} sectionId={overviewId} />
    </WmsSettingsLayout>
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
  autoBraki: boolean;
  allowContinue: boolean;
  priority: WmsShortageResolvePriorityApi;
  autoReopen: boolean;
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
    orderUiLoading: boolean;
    orderUiErr: string | null;
    onDirtyChange?: (dirty: boolean) => void;
  }
>(function PickingShortageSettingsPanel(
  { tenantId, warehouseId, statusOptionsFlat, orderUiLoading, orderUiErr, onDirtyChange },
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
  const [autoBraki, setAutoBraki] = useState(true);
  const [allowContinue, setAllowContinue] = useState(true);
  const [priority, setPriority] = useState<WmsShortageResolvePriorityApi>("high");
  const [autoReopen, setAutoReopen] = useState(true);
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
      setAutoBraki(r.auto_enqueue_braki);
      setAllowContinue(r.allow_continue_other_lines_after_shortage);
      setPriority(r.priority_after_shortage_resolved ?? "high");
      setAutoReopen(r.auto_reopen_picking_after_shortage_resolved);
      setBaselineShortageFp(
        shortageUiFingerprint({
          reportedStatus: reported,
          recoveryStatus: recoveryResolved,
          autoBraki: r.auto_enqueue_braki,
          allowContinue: r.allow_continue_other_lines_after_shortage,
          priority: r.priority_after_shortage_resolved ?? "high",
          autoReopen: r.auto_reopen_picking_after_shortage_resolved,
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
      await saveWmsPickingShortageSettings({
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        shortage_reported_order_ui_status_id: rs != null && Number.isFinite(rs) && rs > 0 ? rs : null,
        auto_enqueue_braki: autoBraki,
        allow_continue_other_lines_after_shortage: allowContinue,
        priority_after_shortage_resolved: priority,
        auto_reopen_picking_after_shortage_resolved: autoReopen,
        recovery_completed_order_ui_status_id: rc != null && Number.isFinite(rc) && rc > 0 ? rc : null,
      });
      setBaselineShortageFp(
        shortageUiFingerprint({
          reportedStatus,
          recoveryStatus,
          autoBraki,
          allowContinue,
          priority,
          autoReopen,
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
    autoBraki,
    allowContinue,
    priority,
    autoReopen,
  ]);

  const shortageCurrentFp = useMemo(
    () =>
      shortageUiFingerprint({
        reportedStatus,
        recoveryStatus,
        autoBraki,
        allowContinue,
        priority,
        autoReopen,
      }),
    [reportedStatus, recoveryStatus, autoBraki, allowContinue, priority, autoReopen],
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
        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium text-slate-900">Status po zgłoszeniu braku podczas zbierania</label>
            <select
              className={selectClass}
              value={reportedStatus}
              onChange={(e) => setReportedStatus(e.target.value)}
              disabled={saving}
            >
              <option value="">— Bez zmiany statusu</option>
              {statusOptionsFlat.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-white/50 bg-white/60 p-4 shadow-sm">
            <CustomCheckbox
              label="Pokaż zamówienie w zakładce Braki po zgłoszeniu braku"
              hint="Zamówienie trafi na listę do decyzji / uzupełnienia braków."
              checked={autoBraki}
              onChange={setAutoBraki}
              disabled={saving}
            />
          </div>

          <div className="rounded-xl border border-white/50 bg-white/60 p-4 shadow-sm">
            <CustomCheckbox
              label="Pozwól magazynierowi zbierać pozostałe produkty po zgłoszeniu braku"
              hint="Po zgłoszeniu braku można dalej zbierać inne pozycje z tego zamówienia."
              checked={allowContinue}
              onChange={setAllowContinue}
              disabled={saving}
            />
          </div>

          <div>
            <span className="text-sm font-medium text-slate-900">Priorytet po rozwiązaniu problemu</span>
            <p className={fieldHintClass}>Określa jak szybko zamówienie wróci do realizacji.</p>
            <div className="mt-2 space-y-1">
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
          </div>

          <div className="rounded-xl border border-white/50 bg-white/60 p-4 shadow-sm">
            <CustomCheckbox
              label="Po rozwiązaniu problemu pokaż zamówienie ponownie w Zbieraniu"
              hint="Po podmianie produktu lub cofnięciu braku zamówienie wróci na listę zbierania."
              checked={autoReopen}
              onChange={setAutoReopen}
              disabled={saving}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-900">Status po zebraniu brakujących produktów</label>
            <p className={fieldHintClass}>Status ustawiany po zebraniu brakujących pozycji.</p>
            <select
              className={selectClass}
              value={recoveryStatus}
              onChange={(e) => setRecoveryStatus(e.target.value)}
              disabled={saving}
            >
              <option value="">— Jak w ustawieniach Pakowanie (status startu)</option>
              {statusOptionsFlat.map((s) => (
                <option key={`r-${s.id}`} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
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

const PICKING_WHERE_OPTIONS: Array<{ value: PickingContainers; label: string }> = [
  { value: "cart_no_scan", label: "Wózek (bez skanowania)" },
  { value: "cart_scan", label: "Wózek (ze skanowaniem)" },
  { value: "baskets", label: "Wózek z koszykami" },
  { value: "mobile_cart", label: "Wózek mobilny" },
  { value: "consolidation_rack", label: "Regał kompletacyjny" },
];

const PICKING_MODE_OPTIONS: Array<{ value: PickingMode; label: string; hint: string }> = [
  {
    value: "by_orders",
    label: "Po zamówieniach",
    hint: "Zbieranie zamówienie po zamówieniu. Poniżej wybierasz kolejność kolejki zamówień.",
  },
  {
    value: "by_products",
    label: "Po produktach",
    hint: "Lista zagregowana po produktach (jak widok produktów WMS). Domyślnie kolejność po lokalizacjach na trasie.",
  },
];

const PICKING_ORDER_SORT_OPTIONS: Array<{ value: PickingOrderSort; label: string; hint: string }> = [
  {
    value: "date",
    label: "Po dacie (najstarsze)",
    hint: "FIFO po dacie zamówienia.",
  },
  {
    value: "location",
    label: "Po lokalizacjach",
    hint: "Kolejka zamówień wg pierwszej lokalizacji na trasie (uproszczenie).",
  },
  {
    value: "courier",
    label: "Po kurierach",
    hint: "W przygotowaniu — zachowanie jak sortowanie po dacie, do rozbudowy logistyki.",
  },
];

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
  const single: PickingBlockState = { ...blocks.single_item, ...shape };
  let multi: PickingBlockState = { ...blocks.multi_item, ...shape };
  if (mode === "by_products" && multi.containers === "cart_no_scan") {
    multi = { ...multi, containers: "baskets" };
  }
  return { single_item: single, multi_item: multi };
}

function pickingModeLabel(mode: PickingMode): string {
  return mode === "by_orders" ? "Po zamówieniach" : "Po produktach";
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
  if (cfg.pickingMode === "by_products" && cfg.blocks.multi_item.containers === "cart_no_scan") {
    return `Reguła „${cfg.statusToPickName}”: przy zbieraniu po produktach (wieloelementowe) nie można użyć wózka bez skanowania — wybierz wózek z koszykami, wózek ze skanem, wózek mobilny lub regał kompletacyjny.`;
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
  const order_sort: PickingConfigOrderSortDb = cfg.pickingMode === "by_products" ? "date" : cfg.orderSort;
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

function pickingWhereLabel(mode: PickingContainers): string {
  return PICKING_WHERE_OPTIONS.find((o) => o.value === mode)?.label ?? mode;
}

function pickingFlowSummaryLine(config: SavedPickingConfiguration, orderTypeKey: PickingOrderTypeKey): string {
  const block = config.blocks[orderTypeKey];
  if (config.pickingMode === "by_orders") {
    return `Kolejność zamówień: ${pickingOrderSortLabel(config.orderSort)}`;
  }
  if (orderTypeKey === "single_item") {
    return "Trasa: kolejność lokalizacji (produkty)";
  }
  if (block.containers === "mobile_cart") {
    return block.batchType === "multi"
      ? "Trasa: lokalizacje · pick & pack (wiele zamówień — wg pojemności)"
      : "Trasa: lokalizacje · jedno zamówienie na przejście · pick & pack";
  }
  if (block.containers === "consolidation_rack") {
    return "Konsolidacja: lokalne pozycje odkładasz na przypisaną półkę regału (RK-xx/Ax)";
  }
  return block.batchType === "multi"
    ? "Trasa: lokalizacje · zbiór wielu zamówień (wg koszyków / skanów / limitów)"
    : "Trasa: lokalizacje · jedno zamówienie na przejście";
}

const PICKING_ORDER_TYPE_SECTIONS = [
  { key: "single_item", label: "Zamówienia jednoelementowe", letter: "A" },
  { key: "multi_item", label: "Zamówienia wieloelementowe", letter: "B" },
] as const;

type PickingOrderTypeKey = (typeof PICKING_ORDER_TYPE_SECTIONS)[number]["key"];

function PickingWhereYouPickField({
  fieldIdPrefix,
  value,
  onPatch,
  options = PICKING_WHERE_OPTIONS,
  footnote,
}: {
  fieldIdPrefix: string;
  value: PickingContainers;
  onPatch: (patch: Partial<PickingBlockState>) => void;
  options?: Array<{ value: PickingContainers; label: string }>;
  footnote?: string;
}) {
  const groupId = `${fieldIdPrefix}-where`;
  return (
    <div className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <p id={`${groupId}-legend`} className="text-sm font-semibold tracking-tight text-slate-900">
        Gdzie zbierasz
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Główny wybór procesu — osobno dla zamówień jedno- i wieloelementowych.
      </p>
      <div
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
        role="radiogroup"
        aria-labelledby={`${groupId}-legend`}
      >
        {options.map((opt) => (
          <label
            key={opt.value}
            className={[
              "flex cursor-pointer items-start gap-3 rounded-lg border-2 px-3 py-3 transition-colors sm:min-h-[3.25rem]",
              value === opt.value
                ? "border-blue-500 ring-1 ring-blue-500/20 bg-blue-50/20"
                : "border-slate-200 bg-white hover:border-slate-300",
            ].join(" ")}
          >
            <input
              type="radio"
              name={`${fieldIdPrefix}-where`}
              className={radioInputClass + " mt-0.5"}
              checked={value === opt.value}
              onChange={() => onPatch({ containers: opt.value })}
            />
            <span className="text-sm font-medium leading-snug text-slate-900">{opt.label}</span>
          </label>
        ))}
      </div>
      {footnote ? <p className="mt-4 text-xs leading-relaxed text-slate-500 pt-3 border-t border-slate-100">{footnote}</p> : null}
    </div>
  );
}

function PickingConfiguratorFields({
  fieldIdPrefix,
  orderTypeKey,
  pickingMode,
  value,
  onPatch,
}: {
  fieldIdPrefix: string;
  orderTypeKey: PickingOrderTypeKey;
  pickingMode: PickingMode;
  value: PickingBlockState;
  onPatch: (patch: Partial<PickingBlockState>) => void;
}) {
  const isSingleItem = orderTypeKey === "single_item";
  const isMobile = value.containers === "mobile_cart";
  const isBaskets = value.containers === "baskets";
  const isConsolidationRack = value.containers === "consolidation_rack";
  const byOrdersMode = pickingMode === "by_orders";

  const containerChoices = (() => {
    const base = PICKING_WHERE_OPTIONS.filter((o) =>
      orderTypeKey === "single_item" ? o.value !== "consolidation_rack" : true,
    );
    if (byOrdersMode) return base;
    if (!isSingleItem && orderTypeKey === "multi_item") {
      return base.filter((o) => o.value !== "cart_no_scan");
    }
    return base;
  })();

  const containerFootnote =
    !byOrdersMode && !isSingleItem
      ? "Zamówienia wielopozycyjne na trasie po lokalizacjach wymagają rozdzielenia (koszyki, skan slotów, wózek mobilny lub regał kompletacyjny dla konsolidacji). Wózek bez skanowania nie jest dostępny."
      : undefined;

  const showBatchSection = !byOrdersMode && !isMobile && !isConsolidationRack && !isSingleItem;
  const isBatchSizeContainerLimited = true;

  if (byOrdersMode) {
    return (
      <div className="space-y-5 px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
        <PickingWhereYouPickField
          fieldIdPrefix={fieldIdPrefix}
          value={value.containers}
          onPatch={onPatch}
          options={containerChoices}
        />
        <p className="text-xs leading-relaxed text-slate-500">
          Kolejność zamówień ustawiasz w sekcji „Tryb zbierania” powyżej (niezależnie od jedno- / wieloelementowych).
        </p>
        {isMobile && orderTypeKey === "multi_item" ? (
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-semibold text-blue-900">Pick & pack na wózku mobilnym</p>
            <p className="mt-1 text-xs leading-relaxed text-blue-800">
              Zbieranie i pakowanie w jednym przejściu — kolejka zamówień wg wybranej kolejności (np. data lub kurier).
            </p>
          </div>
        ) : null}
        {isConsolidationRack && orderTypeKey === "multi_item" ? (
          <div className="rounded-lg border border-violet-100 bg-violet-50 px-4 py-3">
            <p className="text-xs font-semibold text-violet-900">Regał kompletacyjny (konsolidacja)</p>
            <p className="mt-1 text-xs leading-relaxed text-violet-800">
              Lokalne pozycje planów konsolidacyjnych odkładasz na przypisaną półkę (np. RK-01/A2), nie do koszyka ani slotu wózka.
              Wymaga skonfigurowanych regałów kompletacyjnych w magazynie.
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  let step = 1;
  const tBatch = !isMobile && !isConsolidationRack && showBatchSection ? `${step++}. Typ zbioru` : null;
  const tRoute = !isMobile && !isConsolidationRack ? `${step++}. Kolejność w magazynie` : null;

  return (
    <div className="space-y-5 px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
      <PickingWhereYouPickField
        fieldIdPrefix={fieldIdPrefix}
        value={value.containers}
        onPatch={onPatch}
        options={containerChoices}
        footnote={containerFootnote}
      />

      {isMobile && orderTypeKey === "multi_item" ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-xs font-semibold text-blue-900">Pick & pack na wózku mobilnym</p>
          <p className="mt-1 text-xs leading-relaxed text-blue-800">
            Zbieranie i pakowanie odbywa się w jednym przejściu — trasa po lokalizacjach, bez osobnej konfiguracji koszyków.
          </p>
        </div>
      ) : null}

      {isConsolidationRack && orderTypeKey === "multi_item" ? (
        <div className="rounded-lg border border-violet-100 bg-violet-50 px-4 py-3">
          <p className="text-xs font-semibold text-violet-900">Regał kompletacyjny (konsolidacja)</p>
          <p className="mt-1 text-xs leading-relaxed text-violet-800">
            Dotyczy wyłącznie planów konsolidacyjnych ze statusem STAGING i przypisaną półką. Pozycje lokalne: TO_PICK → PICKED → odkład na półkę.
          </p>
        </div>
      ) : null}

      {showBatchSection && tBatch ? (
        <div className="border-t border-slate-100 pt-5">
          <p className={configBlockTitleClass}>{tBatch}</p>
          <div className="mt-3 flex flex-col gap-1">
            <label className={radioLabelClass}>
              <input
                type="radio"
                name={`${fieldIdPrefix}-batch-type`}
                className={radioInputClass}
                checked={value.batchType === "single"}
                onChange={() => onPatch({ batchType: "single" })}
              />
              <span className="text-sm text-slate-900">Pojedyncze zamówienie na przejście</span>
            </label>
            <label className={radioLabelClass}>
              <input
                type="radio"
                name={`${fieldIdPrefix}-batch-type`}
                className={radioInputClass}
                checked={value.batchType === "multi"}
                onChange={() => onPatch({ batchType: "multi" })}
              />
              <span className="text-sm text-slate-900">Wiele zamówień w jednym zbiorze</span>
            </label>
          </div>
          {value.batchType === "multi" && isBatchSizeContainerLimited ? (
            <p className="mt-3 text-xs leading-relaxed text-slate-500 bg-slate-50/80 p-3 rounded-lg border border-slate-100">
              {isBaskets
                ? "Liczba zamówień w zbiorze wynika z koszyków — zwykle jedno zamówienie na koszyk."
                : "Przy wózku ze skanem slotów lub limitach zbioru bez skanu — liczba zamówień wynika z pojemności i reguł przypisania."}
            </p>
          ) : null}
        </div>
      ) : null}

      {!isMobile && tRoute ? (
        <div className="border-t border-slate-100 pt-5">
          <p className={configBlockTitleClass}>{tRoute}</p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 bg-slate-50/80 p-4 rounded-lg border border-slate-100">
            {isSingleItem ? (
              <>
                Pozycje z zamówienia jednoelementowego — <span className="font-semibold text-slate-900">nawigacja po kolejności lokalizacji</span>{" "}
                na trasie zbiórki.
              </>
            ) : (
              <>
                W zbiorze wielozamówieniowym kolejność odwiedzanych lokalizacji jest ustalana{' '}
                <span className="font-semibold text-slate-900">po pozycjach na trasie</span>, tak aby skrócić przejście w
                magazynie.
              </>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function PickingOrderTypeConfiguratorSection({
  title,
  letter,
  children,
}: {
  title: string;
  letter: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <div className="border-b border-slate-100/80 bg-slate-50/30 px-4 py-4 sm:px-5">
        <span className="text-sm font-semibold text-slate-900 sm:text-base">
          <span className="tabular-nums text-slate-400 mr-1">{letter}.</span> {title}
        </span>
      </div>
      <div className="px-4 py-5 sm:px-5">{children}</div>
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
  const cols = showSingleField && showMultiField ? "sm:grid-cols-2" : "sm:grid-cols-1";

  return (
    <div className="mt-5 space-y-4">
      <div>
        <h3 className={configBlockTitleClass}>Limity zbioru (wózek bez skanowania)</h3>
        <p className={fieldHintClass}>
          Jedna para wartości na cały magazyn. Stosowane tylko tam, gdzie w konfiguratorze wybrano „Wózek (bez skanowania)”
          — przy skanie slotów lub koszykach limity wynikają z ustawień w danym wózku albo wózku z koszykami.
        </p>
      </div>
      <div className={["grid w-full gap-4", cols].join(" ")}>
        {showSingleField ? (
          <label className="block">
            <span className="text-sm font-medium text-slate-900">Maksymalna liczba zamówień (jednoelementowe)</span>
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
            {errorSingle ? (
              <p className="mt-1 text-xs font-medium text-red-700" role="alert">
                {errorSingle}
              </p>
            ) : null}
          </label>
        ) : null}
        {showMultiField ? (
          <label className="block">
            <span className="text-sm font-medium text-slate-900">Maksymalna liczba zamówień (wieloelementowe)</span>
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
            {errorMulti ? (
              <p className="mt-1 text-xs font-medium text-red-700" role="alert">
                {errorMulti}
              </p>
            ) : null}
          </label>
        ) : null}
      </div>
    </div>
  );
}

function PickingConfiguratorEditor({
  fieldIdPrefix,
  warehouseId,
  orderUiSummary,
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
  reservedStatusIds,
}: {
  fieldIdPrefix: string;
  warehouseId: number | null;
  orderUiSummary: OrderUiStatusPanelSummary | null;
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
  reservedStatusIds: Set<number>;
}) {
  const allStatusOptions = useMemo(() => flattenOrderUiStatusOptions(orderUiSummary), [orderUiSummary]);
  const statusOptionsForPick = useMemo(() => {
    const pickId = Number(statusToPick);
    return allStatusOptions.filter((o) => !reservedStatusIds.has(o.id) || o.id === pickId);
  }, [allStatusOptions, reservedStatusIds, statusToPick]);

  const selectDisabled =
    warehouseId == null || orderUiLoading || orderUiErr != null || allStatusOptions.length === 0;

  const canPickStatus = !selectDisabled;
  const statusToPickRequired = canPickStatus && statusToPickShowError && statusToPick === "";
  const statusAfterPickRequired = canPickStatus && statusAfterPickShowError && statusAfterPick === "";

  const statusToPickSelectClass = [
    selectClass,
    statusToPickRequired || statusPairConflict ? " border-red-400 focus-visible:ring-red-500/35" : "",
  ].join(" ");

  const statusAfterPickSelectClass = [
    selectClass,
    statusAfterPickRequired || statusPairConflict ? " border-red-400 focus-visible:ring-red-500/35" : "",
  ].join(" ");

  return (
    <div className="space-y-6 sm:space-y-7">
      {warehouseId == null ? (
        <p className="text-sm text-amber-800">Wybierz magazyn, aby wczytać statusy panelu zamówień.</p>
      ) : null}
      {orderUiErr ? <p className="text-sm text-red-700">{orderUiErr}</p> : null}
      {!orderUiLoading && warehouseId != null && orderUiErr == null && allStatusOptions.length === 0 ? (
        <p className="text-sm text-slate-600">
          Brak statusów panelu dla tego magazynu. Dodaj je w ustawieniach zamówień (statusy panelu).
        </p>
      ) : null}

      <div className="rounded-xl border border-white/50 bg-white/60 p-4 sm:p-5 shadow-sm">
        <label className="block">
          <span className="text-sm font-medium text-slate-900">Status do zbierania</span>
          <span className="ml-1 text-red-600" aria-hidden>
            *
          </span>
          <select
            className={statusToPickSelectClass}
            value={statusToPick}
            onChange={(e) => {
              onStatusToPickChange(e.target.value);
            }}
            onBlur={onStatusToPickBlur}
            disabled={selectDisabled}
            aria-busy={orderUiLoading}
            aria-invalid={statusToPickRequired || statusPairConflict}
            aria-required
          >
            {orderUiLoading ? (
              <option value="">Ładowanie…</option>
            ) : statusOptionsForPick.length === 0 ? (
              <option value="">—</option>
            ) : (
              <>
                <option value="">Wybierz status</option>
                {statusOptionsForPick.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.name}
                  </option>
                ))}
              </>
            )}
          </select>
        </label>
        {statusToPickRequired ? (
          <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
            To pole jest wymagane.
          </p>
        ) : null}
        {statusPairConflict ? (
          <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
            Status do zbierania nie może być taki sam jak status po zebraniu.
          </p>
        ) : null}
        <p className={fieldHintClass}>Każdy status może mieć tylko jedną zapisaną konfigurację.</p>
      </div>

      <div className="rounded-xl border border-white/50 bg-white/60 p-4 shadow-sm sm:p-5">
        <p className="text-sm font-semibold text-slate-900">Tryb zbierania</p>
        <p className="mt-1 text-xs text-slate-500">Określa logikę magazynu dla obu typów zamówień (jedno- i wieloelementowych).</p>
        <div className="mt-5 flex flex-col gap-3" role="radiogroup" aria-label="Tryb zbierania">
          {PICKING_MODE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={[
                "flex cursor-pointer flex-col gap-1 rounded-lg border-2 px-4 py-3 transition-colors",
                pickingMode === opt.value
                  ? "border-blue-500 ring-1 ring-blue-500/20 bg-blue-50/20"
                  : "border-slate-200 bg-white hover:border-slate-300",
              ].join(" ")}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${fieldIdPrefix}-picking-mode`}
                  className={radioInputClass}
                  checked={pickingMode === opt.value}
                  onChange={() => onPickingModeChange(opt.value)}
                />
                <span className="text-sm font-medium text-slate-900">{opt.label}</span>
              </span>
              <span className="pl-7 text-xs leading-relaxed text-slate-500">{opt.hint}</span>
            </label>
          ))}
        </div>
        {pickingMode === "by_orders" ? (
          <div className="mt-6 rounded-lg border border-slate-200/80 bg-white px-4 py-4">
            <p className={configBlockTitleClass}>Kolejność zamówień</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Dotyczy trybu <span className="font-medium text-slate-900">po zamówieniach</span> — nie listy produktów.
            </p>
            <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label="Kolejność zamówień">
              {PICKING_ORDER_SORT_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={[
                    "flex cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2 transition-colors",
                    orderSort === opt.value
                      ? "border-blue-400 bg-blue-50/30 ring-1 ring-blue-500/20"
                      : "border-transparent hover:bg-slate-50",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`${fieldIdPrefix}-order-sort`}
                      className={radioInputClass}
                      checked={orderSort === opt.value}
                      onChange={() => onOrderSortChange(opt.value)}
                    />
                    <span className="text-sm font-medium text-slate-900">{opt.label}</span>
                  </span>
                  <span className="pl-7 text-xs text-slate-500">{opt.hint}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs leading-relaxed text-slate-500 pt-3 border-t border-slate-200/50">
            <span className="font-medium text-slate-900">Po produktach:</span> zawsze agregacja po SKU i kolejność po
            lokalizacjach na trasie — bez osobnej kolejki zamówień w tym widoku.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-5">
        {PICKING_ORDER_TYPE_SECTIONS.map((def) => (
          <PickingOrderTypeConfiguratorSection key={def.key} letter={def.letter} title={def.label}>
            <PickingConfiguratorFields
              fieldIdPrefix={`${fieldIdPrefix}-${def.key}`}
              orderTypeKey={def.key}
              pickingMode={pickingMode}
              value={blocks[def.key]}
              onPatch={(patch) => patchBlock(def.key, patch)}
            />
          </PickingOrderTypeConfiguratorSection>
        ))}
      </div>

      <div className="rounded-xl border border-white/50 bg-white/60 p-4 sm:p-5 shadow-sm">
        <label className="block">
          <span className="text-sm font-medium text-slate-900">Status po zebraniu (do pakowania)</span>
          <span className="ml-1 text-red-600" aria-hidden>
            *
          </span>
          <select
            className={statusAfterPickSelectClass}
            value={statusAfterPick}
            onChange={(e) => onStatusAfterPickChange(e.target.value)}
            onBlur={onStatusAfterPickBlur}
            disabled={selectDisabled}
            aria-busy={orderUiLoading}
            aria-invalid={statusAfterPickRequired || statusPairConflict}
          >
            {orderUiLoading ? (
              <option value="">Ładowanie…</option>
            ) : allStatusOptions.length === 0 ? (
              <option value="">—</option>
            ) : (
              <>
                <option value="">Wybierz status</option>
                {allStatusOptions.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.name}
                  </option>
                ))}
              </>
            )}
          </select>
        </label>
        {statusAfterPickRequired ? (
          <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
            Wybierz status po zebraniu.
          </p>
        ) : null}
        {statusPairConflict ? (
          <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
            Wybierz inny status niż „do zbierania”, aby uniknąć pętli w procesie.
          </p>
        ) : null}
        <p className={fieldHintClass}>
          Po zakończeniu zbierania status zamówienia zostanie automatycznie zmieniony.
        </p>
      </div>
    </div>
  );
}

function SavedPickingConfigSummaryCard({
  config,
  onEdit,
  onDelete,
  actionsDisabled,
}: {
  config: SavedPickingConfiguration;
  onEdit: (config: SavedPickingConfiguration) => void;
  onDelete: (id: string) => void;
  actionsDisabled?: boolean;
}) {
  const usesBulk =
    config.blocks.single_item.containers === "cart_no_scan" || config.blocks.multi_item.containers === "cart_no_scan";
  return (
    <div
      className="rounded-xl border border-slate-200/80 bg-white px-5 py-5 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
      aria-label={`Zapisana konfiguracja: ${config.statusToPickName}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <h4 className="text-lg font-semibold text-slate-900">{config.statusToPickName}</h4>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            disabled={actionsDisabled}
            onClick={() => onEdit(config)}
          >
            Edytuj
          </button>
          <button
            type="button"
            className="rounded-lg border border-red-100 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 hover:border-red-200 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            disabled={actionsDisabled}
            onClick={() => onDelete(config.id)}
          >
            Usuń
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-sm">
        <div className="flex justify-between md:col-span-2 border-b border-slate-100 pb-3">
          <span className="text-slate-500 font-medium">Tryb zbierania:</span>
          <span className="font-semibold text-slate-900">
            {pickingModeLabel(config.pickingMode)}
            {config.pickingMode === "by_orders" ? (
              <span className="font-normal text-slate-600"> · {pickingOrderSortLabel(config.orderSort)}</span>
            ) : null}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">Jednoelementowe</span>
          <span className="font-medium text-slate-900">{pickingWhereLabel(config.blocks.single_item.containers)}</span>
          <span className="text-slate-500 text-xs mt-0.5">{pickingFlowSummaryLine(config, "single_item")}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-slate-500 text-xs uppercase tracking-wider font-semibold mb-1">Wieloelementowe</span>
          <span className="font-medium text-slate-900">{pickingWhereLabel(config.blocks.multi_item.containers)}</span>
          <span className="text-slate-500 text-xs mt-0.5">{pickingFlowSummaryLine(config, "multi_item")}</span>
        </div>
        <div className="md:col-span-2 mt-2 pt-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-slate-500 font-medium">Po zebraniu:</span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200/80">
            {config.statusAfterPickName}
          </span>
        </div>
        {usesBulk ? (
          <div className="md:col-span-2 mt-1 text-xs text-slate-500">
            Limity zbioru (bez skanu): ustawienia magazynowe w sekcji „Logistyka i organizacja zbiorów”.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WmsPickingStatusConfig({
  warehouseId,
  savedConfigs,
  draft,
  pickingConfigsLoading,
  pickingPersisting,
  editBackup,
  setSaveFormError,
  setPickingPersistOk,
  setEditBackup,
  setSavedConfigs,
  setDraft,
  handleDeleteSavedConfig,
  handleSaveConfiguration,
  orderUiSummary,
  orderUiLoading,
  orderUiErr,
  patchDraftBlock,
  reservedStatusIds,
  statusPairConflictDraft,
}: {
  warehouseId: number;
  savedConfigs: SavedPickingConfiguration[];
  draft: PickingConfigDraft | null;
  pickingConfigsLoading: boolean;
  pickingPersisting: boolean;
  editBackup: SavedPickingConfiguration | null;
  setSaveFormError: Dispatch<SetStateAction<string | null>>;
  setPickingPersistOk: Dispatch<SetStateAction<string | null>>;
  setEditBackup: Dispatch<SetStateAction<SavedPickingConfiguration | null>>;
  setSavedConfigs: Dispatch<SetStateAction<SavedPickingConfiguration[]>>;
  setDraft: Dispatch<SetStateAction<PickingConfigDraft | null>>;
  handleDeleteSavedConfig: (id: string) => void;
  handleSaveConfiguration: () => void | Promise<void>;
  orderUiSummary: OrderUiStatusPanelSummary | null;
  orderUiLoading: boolean;
  orderUiErr: string | null;
  patchDraftBlock: (key: PickingOrderTypeKey, patch: Partial<PickingBlockState>) => void;
  reservedStatusIds: Set<number>;
  statusPairConflictDraft: boolean;
}) {
  return (
    <div className="space-y-6" aria-label="Konfiguracja trybu zbierania">
        {savedConfigs.length === 0 && !draft && !pickingConfigsLoading ? (
          <p className="text-sm text-slate-600 bg-slate-50 p-4 rounded-lg border border-slate-200">Nie masz jeszcze reguł zbierania — dodaj pierwszą regułę poniżej.</p>
        ) : null}

        {savedConfigs.length > 0 ? (
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Zapisane reguły</p>
            <div className="flex flex-col gap-4">
              {savedConfigs.map((cfg) => (
                <SavedPickingConfigSummaryCard
                  key={cfg.id}
                  config={cfg}
                  actionsDisabled={pickingPersisting}
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
        ) : null}

        <button
          type="button"
          className={`w-full rounded-xl border-2 border-dashed border-slate-300 bg-white py-4 text-sm font-medium text-slate-600 transition-colors hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 ${savedConfigs.length > 0 ? "mt-6" : ""}`}
          onClick={() => {
            setSaveFormError(null);
            setPickingPersistOk(null);
            setEditBackup(null);
            setDraft(createEmptyDraft());
          }}
          disabled={draft != null || pickingConfigsLoading || pickingPersisting}
        >
          + Dodaj kolejny status zbierania
        </button>

        {draft != null ? (
          <div className="mt-8 rounded-2xl border-2 border-blue-200 bg-blue-50/50 p-5 sm:p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-1">{editBackup ? "Edycja konfiguracji" : "Nowa konfiguracja zbierania"}</h3>
            <p className="text-sm text-slate-600 mb-6">
              Po wypełnieniu, reguła zostanie wysłana do systemu używając paska na dole strony („Zapisz” / „Anuluj”).
            </p>
            <PickingConfiguratorEditor
              fieldIdPrefix={`picking-draft-${draft.id.slice(0, 8)}`}
              warehouseId={warehouseId}
              orderUiSummary={orderUiSummary}
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
              reservedStatusIds={reservedStatusIds}
            />
          </div>
        ) : null}
    </div>
  );
}

export type WmsPickingSettingsActions = {
  saveAll: () => Promise<void>;
  discardUnsaved: () => Promise<void>;
};

function WmsPickingSettingsSections({
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
  const [orderUiLoading, setOrderUiLoading] = useState(false);
  const [orderUiErr, setOrderUiErr] = useState<string | null>(null);

  const statusOptionsFlat = useMemo(() => flattenOrderUiStatusOptions(orderUiSummary), [orderUiSummary]);

  const reservedStatusIds = useMemo(
    () => new Set(savedConfigs.map((c) => c.statusToPickId)),
    [savedConfigs],
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
      setOrderUiErr(null);
      return;
    }
    setOrderUiLoading(true);
    setOrderUiErr(null);
    try {
      const data = await getOrderUiStatusSummary(DAMAGE_TENANT_ID, warehouseId);
      setOrderUiSummary(data);
    } catch {
      setOrderUiErr("Nie udało się wczytać statusów panelu zamówień.");
      setOrderUiSummary(null);
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

  const handleSaveConfiguration = useCallback(async (): Promise<boolean> => {
    setPickingPersistOk(null);
    setSaveFormError(null);
    setPickingConfigsLoadErr(null);
    if (!draft) return true;

    const d = draft;
    if (!d.statusToPick.trim()) {
      setSaveFormError("Wybierz status do zbierania.");
      setDraft({ ...d, statusToPickBlurred: true });
      return false;
    }
    if (!d.statusAfterPick.trim()) {
      setSaveFormError("Wybierz status po zebraniu.");
      setDraft({ ...d, statusAfterPickBlurred: true });
      return false;
    }
    const pickId = Number(d.statusToPick);
    const afterId = Number(d.statusAfterPick);
    if (!Number.isFinite(pickId) || pickId <= 0) {
      setSaveFormError("Nieprawidłowy status do zbierania.");
      setDraft({ ...d, statusToPickBlurred: true });
      return false;
    }
    if (!Number.isFinite(afterId) || afterId <= 0) {
      setSaveFormError("Nieprawidłowy status po zebraniu.");
      setDraft({ ...d, statusAfterPickBlurred: true });
      return false;
    }
    if (pickId === afterId) {
      setSaveFormError("Status do zbierania i po zebraniu muszą się różnić.");
      setDraft({ ...d, statusToPickBlurred: true, statusAfterPickBlurred: true });
      return false;
    }

    if (
      editBackup != null &&
      pickId !== editBackup.statusToPickId &&
      savedConfigs.some((c) => c.statusToPickId === pickId)
    ) {
      setSaveFormError("Ten status ma już zapisaną konfigurację — wybierz inny status do zbierania.");
      return false;
    }

    if (d.pickingMode === "by_products" && d.blocks.multi_item.containers === "cart_no_scan") {
      setSaveFormError(
        "Przy zbieraniu po produktach (wieloelementowe) wybierz wózek z koszykami, wózek ze skanem lub wózek mobilny — wymagane jest rozdzielenie zamówień.",
      );
      return false;
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
        return false;
      }
    }
    if (nextUsesBulkMulti) {
      const p = parseBulkOrderLimitInput(globalBulkMulti, BULK_ORDER_LIMIT_MAX);
      if (!p.ok) {
        setSaveFormError(`Limity zbioru (magazyn) — wieloelementowe: ${p.message}`);
        setGlobalBulkMultiBlurred(true);
        return false;
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

    setPickingPersisting(true);
    const result = await persistPickingConfigList(nextList);
    setPickingPersisting(false);

    if (!result.ok) {
      setSaveFormError(result.message);
      return false;
    }

    setEditBackup(null);
    setPickingPersistOk("Konfiguracja zapisana.");
    window.setTimeout(() => setPickingPersistOk(null), 5000);

    const match = result.saved.find((c) => c.statusToPickId === pickId);
    if (match) {
      setDraft(savedConfigurationToDraft(match));
    }
    return true;
  }, [
    draft,
    savedConfigs,
    statusOptionsFlat,
    editBackup,
    globalBulkSingle,
    globalBulkMulti,
    persistPickingConfigList,
    setDraft,
    setSaveFormError,
    setEditBackup,
  ]);

  useEffect(() => {
    registerActions?.({
      saveAll: async () => {
        if (warehouseId == null) return;
        if (shortagePanelDirty && shortageRef.current) {
          const ok = await shortageRef.current.save();
          if (!ok) throw new Error("shortage_save_failed");
        }
        if (draftDirty) {
          const ok = await handleSaveConfiguration();
          if (!ok) throw new Error("draft_save_failed");
        }
        if (configsBulkDirty) {
          const result = await persistPickingConfigList(savedConfigs);
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
        if (editBackup) {
          setSavedConfigs((prev) =>
            [...prev, editBackup].sort((a, b) => a.statusToPickName.localeCompare(b.statusToPickName)),
          );
          setEditBackup(null);
        }
        setDraft(null);
        setSaveFormError(null);
      },
    });
    return () => registerActions?.(null);
  }, [
    registerActions,
    warehouseId,
    shortagePanelDirty,
    draftDirty,
    configsBulkDirty,
    extendedDirty,
    handleSaveConfiguration,
    persistPickingConfigList,
    saveExtendedOnly,
    loadPickingConfigsFromServer,
    editBackup,
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

  return (
    <WmsSettingsLayout
      sections={WMS_PICKING_SETTINGS_NAV_SECTIONS}
      asideLabel="Sekcje ustawień zbierania"
      observeSections={sectionNavObserve}
      observeRevision={pickingConfigsLoading}
      mainClassName="space-y-6"
    >
      <header className="border-b border-slate-200 pb-4 mb-2">
        <h2 className="text-xl font-bold text-slate-900">Ustawienia zbierania WMS</h2>
        <p className="mt-1 text-sm text-slate-500">Reguły statusów i preferencje widoku dla procesu zbierania.</p>
      </header>

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
      {saveFormError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{saveFormError}</p>
      ) : null}

      <div className="space-y-4">
        <SectionCardPicking
          id="wms-pick-appearance"
          title="1. Wygląd i prezentacja"
          summary="Kolumny na liście zbierania, magazyny, układ i gęstość listy."
        >
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
          
          <SubsectionPicking title="Magazyny i strefy" description="Podział pracy i identyfikatory magazynów (placeholder).">
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <CustomCheckbox label="Dziel pracę między magazynami" checked={extended.splitWorkBetweenWarehouses} onChange={(v) => patchExtended("splitWorkBetweenWarehouses", v)} />
              <CustomCheckbox label="Ignoruj poziomy stanów w lokalizacjach" checked={extended.ignoreLocationStockLevels} onChange={(v) => patchExtended("ignoreLocationStockLevels", v)} />
              <CustomCheckbox label="Zbieranie strefowe" checked={extended.zonePickingEnabled} onChange={(v) => patchExtended("zonePickingEnabled", v)} />
            </div>
            <div className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Główny magazyn zbierania
                <input
                  className={textInputClassPicking}
                  value={extended.mainPickingWarehouse}
                  onChange={(e) => patchExtended("mainPickingWarehouse", e.target.value)}
                  placeholder="ID lub nazwa"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Magazyn zapasowy
                <input
                  className={textInputClassPicking}
                  value={extended.fallbackWarehouse}
                  onChange={(e) => patchExtended("fallbackWarehouse", e.target.value)}
                  placeholder="ID lub nazwa"
                />
              </label>
            </div>
          </SubsectionPicking>
          
          <SubsectionPicking title="Układ listy">
            <FieldGridPicking>
              <CustomCheckbox label="Tryb kompaktowy" checked={extended.compactMode} onChange={(v) => patchExtended("compactMode", v)} />
              <CustomCheckbox label="Plakietka priorytetu" checked={extended.showPriorityBadge} onChange={(v) => patchExtended("showPriorityBadge", v)} />
              <label className="block text-sm font-medium text-slate-700 sm:col-span-2 pt-2">
                Gęstość listy
                <select
                  className={selectClass}
                  value={extended.listDensity}
                  onChange={(e) => patchExtended("listDensity", e.target.value as WmsPickingExtendedUiSettings["listDensity"])}
                >
                  <option value="comfortable">Komfortowa</option>
                  <option value="compact">Kompaktowa</option>
                </select>
              </label>
            </FieldGridPicking>
          </SubsectionPicking>
        </SectionCardPicking>

        <SectionCardPicking
          id="wms-pick-workflow"
          title="2. Workflow / statusy"
          summary="Konfiguracja reguł statusów, braki, limity zbioru i obsługa braków."
        >
          <SubsectionPicking title="Konfiguracja trybu zbierania" description="Mapowanie statusów panelu na tryb zbierania — zapis do API.">
            <WmsPickingStatusConfig
              warehouseId={warehouseId}
              savedConfigs={savedConfigs}
              draft={draft}
              pickingConfigsLoading={pickingConfigsLoading}
              pickingPersisting={pickingPersisting}
              editBackup={editBackup}
              setSaveFormError={setSaveFormError}
              setPickingPersistOk={setPickingPersistOk}
              setEditBackup={setEditBackup}
              setSavedConfigs={setSavedConfigs}
              setDraft={setDraft}
              handleDeleteSavedConfig={(id) => void handleDeleteSavedConfig(id)}
              handleSaveConfiguration={() => void handleSaveConfiguration()}
              orderUiSummary={orderUiSummary}
              orderUiLoading={orderUiLoading}
              orderUiErr={orderUiErr}
              patchDraftBlock={patchDraftBlock}
              reservedStatusIds={reservedStatusIds}
              statusPairConflictDraft={Boolean(statusPairConflictDraft)}
            />
          </SubsectionPicking>

          <SubsectionPicking title="Status przy braku (preferencja lokalna)" description="Docelowo powiązanie z procesem OMS; na razie zapis w przeglądarce.">
            <label className="block text-sm font-medium text-slate-700">
              Status zamówienia przy braku
              <select
                className={selectClass}
                value={extended.shortageOrderStatusId ?? ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  patchExtended("shortageOrderStatusId", v === "" ? null : Number(v));
                }}
              >
                <option value="">— brak —</option>
                {statusOptionsFlat.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          </SubsectionPicking>

          <SubsectionPicking title="Po zakończeniu zbioru (wsadowego)" description="Zachowanie po domknięciu partii — lokalnie.">
            <div className="flex flex-col gap-3 mt-2">
              {(
                [
                  ["assign_new_batch", "Przypisz nowy zbiór"],
                  ["back_to_list", "Wróć na listę"],
                  ["stay_here", "Zostań na ekranie"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200/80 bg-white px-4 py-3 text-sm font-medium hover:border-slate-300 transition-colors">
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
                label="Oddziel zamówienia sprzedaży bezpośredniej"
                checked={extended.separateDirectSalesOrders}
                onChange={(v) => patchExtended("separateDirectSalesOrders", v)}
              />
              <CustomCheckbox
                label="Zezwól na zbieranie w trybie pakowania"
                checked={extended.allowPickInsidePackingMode}
                onChange={(v) => patchExtended("allowPickInsidePackingMode", v)}
              />
            </FieldGridPicking>
          </SubsectionPicking>

          {warehouseUsesBulkLimits ? (
            <SubsectionPicking
              title="Limity zbioru (wózek bez skanowania)"
              description="Wspólne dla magazynu — stosowane tam, gdzie w regule wybrano tryb bez skanu."
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
            <p className="text-xs text-slate-500 pt-6 mt-6 border-t border-slate-200/50">
              Limity zbioru dla wózka bez skanowania pojawią się tutaj, gdy w którejś regule wybierzesz ten tryb kontenera.
            </p>
          )}

          <SubsectionPicking title="Obsługa braków (API)" description="Statusy po zgłoszeniu braku, priorytety, dogrywka.">
            <PickingShortageSettingsPanel
              ref={shortageRef}
              tenantId={DAMAGE_TENANT_ID}
              warehouseId={warehouseId}
              statusOptionsFlat={statusOptionsFlat}
              orderUiLoading={orderUiLoading}
              orderUiErr={orderUiErr}
              onDirtyChange={setShortagePanelDirty}
            />
          </SubsectionPicking>
        </SectionCardPicking>

        <SectionCardPicking id="wms-pick-automation" title="3. Automatyzacja" summary="Automatyczne akcje podczas i po zbieraniu.">
          <FieldGridPicking>
            <CustomCheckbox label="Auto: następne zamówienie" checked={extended.autoStartNextOrder} onChange={(v) => patchExtended("autoStartNextOrder", v)} />
            <CustomCheckbox label="Auto: otwórz skaner" checked={extended.autoOpenScanner} onChange={(v) => patchExtended("autoOpenScanner", v)} />
            <CustomCheckbox label="Auto: oznaczaj zebrane linie" checked={extended.autoMarkPickedLines} onChange={(v) => patchExtended("autoMarkPickedLines", v)} />
            <CustomCheckbox label="Auto: przejdź do statusu pakowania" checked={extended.autoMoveToPackingStatus} onChange={(v) => patchExtended("autoMoveToPackingStatus", v)} />
          </FieldGridPicking>
        </SectionCardPicking>

        <SectionCardPicking id="wms-pick-documents" title="4. Dokumenty sprzedaży" summary="Powiązanie z dokumentami sprzedaży.">
          <HelpPicking>
            Dokumenty sprzedaży konfigurujesz w zakładce <strong className="font-semibold text-slate-900">Pakowanie</strong> — w module
            zbierania nie ma osobnych pól dokumentów.
          </HelpPicking>
        </SectionCardPicking>

        <SectionCardPicking id="wms-pick-labels" title="5. Etykiety / Kurierzy" summary="Plakietki kurierskie, sortowanie, etykiety przesunięć oraz kontenery i trasy.">
          <SubsectionPicking title="Kurier i kolejka" description="Widoczność i priorytety powiązane z kurierem.">
            <FieldGridPicking>
              <CustomCheckbox label="Plakietka kuriera" checked={extended.showCourierBadge} onChange={(v) => patchExtended("showCourierBadge", v)} />
              <CustomCheckbox label="Sortuj zamówienia po kurierze" checked={extended.sortOrdersByCourier} onChange={(v) => patchExtended("sortOrdersByCourier", v)} />
              <CustomCheckbox label="Priorytetyzuj ekspres" checked={extended.prioritizeExpressOrders} onChange={(v) => patchExtended("prioritizeExpressOrders", v)} />
              <CustomCheckbox label="Auto: druk etykiet przesunięć" checked={extended.autoPrintTransferLabels} onChange={(v) => patchExtended("autoPrintTransferLabels", v)} />
            </FieldGridPicking>
          </SubsectionPicking>
          <SubsectionPicking title="Wózki, koszyki, trasy">
            <FieldGridPicking>
              <label className="block text-sm font-medium text-slate-700 sm:col-span-2 pb-2">
                Domyślny typ kontenera
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
              </label>
              <CustomCheckbox label="Auto-sugestia wózka" checked={extended.autoSuggestCart} onChange={(v) => patchExtended("autoSuggestCart", v)} />
              <CustomCheckbox label="Auto-sugestia trasy" checked={extended.autoSuggestRoute} onChange={(v) => patchExtended("autoSuggestRoute", v)} />
              <CustomCheckbox label="Wymagaj skanu wózka na start" checked={extended.requireCartScanStart} onChange={(v) => patchExtended("requireCartScanStart", v)} />
              <CustomCheckbox label="Wymagaj skanu koszyka na start" checked={extended.requireBasketScanStart} onChange={(v) => patchExtended("requireBasketScanStart", v)} />
            </FieldGridPicking>
          </SubsectionPicking>
        </SectionCardPicking>

        <SectionCardPicking id="wms-pick-permissions" title="6. Uprawnienia / Walidacja" summary="Wymagania skanów i reguły walidacji podczas zbierania.">
          <FieldGridPicking>
            <CustomCheckbox
              label="Wymagaj skanu produktu (min. raz)"
              checked={extended.requireProductScanAtLeastOnce}
              onChange={(v) => patchExtended("requireProductScanAtLeastOnce", v)}
            />
            <CustomCheckbox label="Wymagaj skanu lokalizacji" checked={extended.requireLocationScan} onChange={(v) => patchExtended("requireLocationScan", v)} />
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
            <CustomCheckbox
              label="Wyłącz auto-odpinanie zamówień z brakami z wózków"
              checked={extended.disableAutoDetachMissingOrdersFromCarts}
              onChange={(v) => patchExtended("disableAutoDetachMissingOrdersFromCarts", v)}
            />
          </FieldGridPicking>
        </SectionCardPicking>

        <SectionCardPicking id="wms-pick-assistant" title="7. Asystent zbierania" summary="Zbiory, kolejka zamówień oraz notatki i ostrzeżenia.">
          <SubsectionPicking title="Zbiory / kolejka">
            <FieldGridPicking>
              <label className="block text-sm font-medium text-slate-700">
                Liczba zamówień w batchu (wielopoz.)
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
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Liczba zamówień w batchu (jednopoz.)
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
              </label>
              <label className="block text-sm font-medium text-slate-700 sm:col-span-2" title="0 = bez limitu objętości (placeholder)">
                Limit objętości jednopoz. (0 = brak)
                <input
                  type="number"
                  min={0}
                  max={999999}
                  className={numberInputClass}
                  value={extended.singleItemVolumeLimit}
                  onChange={(e) => patchExtended("singleItemVolumeLimit", Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700 sm:col-span-2 pb-2">
                Tryb zarządzania zbiorem
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
              </label>
            </FieldGridPicking>
            <div className="mt-6 grid gap-x-6 gap-y-4 border-t border-slate-200/50 pt-6 sm:grid-cols-2">
              <CustomCheckbox label="Sortuj po wieku zamówienia" checked={extended.sortOrdersByAge} onChange={(v) => patchExtended("sortOrdersByAge", v)} />
            </div>
          </SubsectionPicking>
          <SubsectionPicking title="Notatki i ostrzeżenia">
            <FieldGridPicking>
              <CustomCheckbox label="Pokaż wszystkie notatki" checked={extended.showAllNotes} onChange={(v) => patchExtended("showAllNotes", v)} />
              <CustomCheckbox label="Wyskakujące notatki" checked={extended.notesPopup} onChange={(v) => patchExtended("notesPopup", v)} />
              <CustomCheckbox label="Pokaż ostrzeżenia" checked={extended.showWarnings} onChange={(v) => patchExtended("showWarnings", v)} />
              <CustomCheckbox label="Podpowiedzi braków" checked={extended.showMissingProductsHints} onChange={(v) => patchExtended("showMissingProductsHints", v)} />
            </FieldGridPicking>
          </SubsectionPicking>
        </SectionCardPicking>

        <SectionCardPicking id="wms-pick-advanced" title="8. Zaawansowane" summary="Diagnostyka, legacy i routing.">
          <SubsectionPicking title="Zaawansowane">
            <FieldGridPicking>
              <CustomCheckbox
                label="Sprawdzanie dostępności u dostawcy"
                checked={extended.supplierAvailabilityCheck}
                onChange={(v) => patchExtended("supplierAvailabilityCheck", v)}
              />
              <CustomCheckbox label="Tryb legacy" checked={extended.legacyMode} onChange={(v) => patchExtended("legacyMode", v)} />
              <CustomCheckbox label="Tryb debug" hint="Logi diagnostyczne" checked={extended.debugMode} onChange={(v) => patchExtended("debugMode", v)} />
              <CustomCheckbox label="Zaawansowany routing" hint="Algorytm tras" checked={extended.advancedRoutingMode} onChange={(v) => patchExtended("advancedRoutingMode", v)} />
            </FieldGridPicking>
          </SubsectionPicking>
        </SectionCardPicking>
      </div>
    </WmsSettingsLayout>
  );
}

export default function WmsSettingsPage() {
  const { warehouse } = useWarehouse();
  const warehouseIdTop = warehouse?.id ?? null;

  const [activeTab, setActiveTab] = useState<WmsSettingsTabId>("common");

  const packingRef = useRef<WmsPackingSettingsPanelHandle>(null);
  const directSalesRef = useRef<DirectSalesSettingsPanelHandle>(null);
  const pickingActionsRef = useRef<WmsPickingSettingsActions | null>(null);

  const [packingDirty, setPackingDirty] = useState(false);
  const [directSalesDirty, setDirectSalesDirty] = useState(false);
  const [pickingDirty, setPickingDirty] = useState(false);
  const [globalSaving, setGlobalSaving] = useState(false);

  const isDirty = packingDirty || directSalesDirty || pickingDirty;

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!packingDirty && !directSalesDirty && !pickingDirty) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [packingDirty, directSalesDirty, pickingDirty]);

  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const leave = window.confirm(
      "Masz niezapisane zmiany w ustawieniach WMS. Opuszczenie strony odrzuci niezapisane dane. Kontynuować?",
    );
    if (leave) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  const handleGlobalSave = useCallback(async () => {
    setGlobalSaving(true);
    try {
      if (packingDirty && packingRef.current) await packingRef.current.saveAll();
      if (directSalesDirty && directSalesRef.current) await directSalesRef.current.saveAll();
      if (pickingDirty && pickingActionsRef.current) await pickingActionsRef.current.saveAll();
      toast.success("Zapisano ustawienia WMS.");
    } catch {
      toast.error("Nie udało się zapisać ustawień — popraw błędy w formularzu i spróbuj ponownie.");
    } finally {
      setGlobalSaving(false);
    }
  }, [packingDirty, directSalesDirty, pickingDirty]);

  const handleGlobalDiscard = useCallback(async () => {
    try {
      if (packingDirty && packingRef.current) await packingRef.current.discardUnsaved();
      if (directSalesDirty && directSalesRef.current) await directSalesRef.current.discardUnsaved();
      if (pickingDirty && pickingActionsRef.current) await pickingActionsRef.current.discardUnsaved();
    } catch {
      toast.error("Nie udało się przywrócić zapisanych ustawień.");
    }
  }, [packingDirty, directSalesDirty, pickingDirty]);

  const handleSave = handleGlobalSave;
  const handleReset = handleGlobalDiscard;

  const activeLabel = WMS_SETTINGS_TABS.find((t) => t.id === activeTab)?.label ?? "";

  return (
    <PageLayout omitCard className="min-w-0 overflow-visible">
        {/* ZAPOBIEGA ROZLEWANIU: PADDING I OBRAMOWANIE WRÓCIŁY NA GŁÓWNY KONTENER */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <PageHeader title="Ustawienia WMS" />
          
          <div className="mt-4 space-y-6">
            <TabsContainer className="w-full [-webkit-overflow-scrolling:touch]">
              <nav
                className="flex w-full flex-nowrap gap-6 overflow-x-auto border-b border-slate-200 sm:justify-start"
                aria-label="Sekcje ustawień WMS"
                role="tablist"
              >
                {WMS_SETTINGS_TABS.map((tab) => {
                  const selected = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      id={`wms-settings-tab-${tab.id}`}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls={`wms-settings-panel-${tab.id}`}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => {
                        setActiveTab(tab.id);
                      }}
                      className={`shrink-0 whitespace-nowrap pb-3 ${tabsNavItemClassName(selected)} ${selected ? 'border-b-2 border-blue-600 text-blue-600 font-medium' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </TabsContainer>

            <div
              id={`wms-settings-panel-${activeTab}`}
              className={["w-full min-h-[200px] min-w-0 overflow-visible", isDirty ? "pb-2" : ""].filter(Boolean).join(" ")}
              role="tabpanel"
              aria-labelledby={`wms-settings-tab-${activeTab}`}
            >
              <div className={activeTab === "picking" ? "block" : "hidden"} aria-hidden={activeTab !== "picking"}>
                <WmsPickingSettingsSections
                  registerActions={(api) => {
                    pickingActionsRef.current = api;
                  }}
                  onDirtyChange={setPickingDirty}
                  sectionNavObserve={activeTab === "picking"}
                />
              </div>
              <div className={activeTab === "packing" ? "block" : "hidden"} aria-hidden={activeTab !== "packing"}>
                <WmsPackingSettingsPanel
                  ref={packingRef}
                  warehouseId={warehouseIdTop}
                  onDirtyChange={setPackingDirty}
                  sectionNavObserve={activeTab === "packing"}
                />
              </div>
              <div className={activeTab === "direct_sales" ? "block" : "hidden"} aria-hidden={activeTab !== "direct_sales"}>
                <DirectSalesSettingsPanel
                  ref={directSalesRef}
                  warehouseId={warehouseIdTop}
                  onDirtyChange={setDirectSalesDirty}
                  sectionNavObserve={activeTab === "direct_sales"}
                />
              </div>
              <div className={activeTab === "returns" ? "block" : "hidden"} aria-hidden={activeTab !== "returns"}>
                <WmsReturnsSettingsPanel warehouseId={warehouseIdTop} />
              </div>
              <div className={activeTab === "common" ? "block" : "hidden"} aria-hidden={activeTab !== "common"}>
                <WmsInventoryManagementSettingsPanel warehouseId={warehouseIdTop} />
              </div>
              <div className={activeTab === "smart_matching" ? "block" : "hidden"} aria-hidden={activeTab !== "smart_matching"}>
                <WmsSmartMatchingSettingsPanel warehouseId={warehouseIdTop} sectionNavObserve={activeTab === "smart_matching"} />
              </div>
              <div className={activeTab === "three_d_matching" ? "block" : "hidden"} aria-hidden={activeTab !== "three_d_matching"}>
                <WmsThreeDMatchingSettingsPanel warehouseId={warehouseIdTop} sectionNavObserve={activeTab === "three_d_matching"} />
              </div>
              <div className={activeTab === "receiving" ? "block" : "hidden"} aria-hidden={activeTab !== "receiving"}>
                <WmsProductValidationSettingsPanel warehouseId={warehouseIdTop} />
              </div>
              <div className={activeTab === "production" ? "block" : "hidden"} aria-hidden={activeTab !== "production"}>
                <WmsProductionSettingsPanel warehouseId={warehouseIdTop} />
              </div>
              {activeTab !== "picking" &&
              activeTab !== "packing" &&
              activeTab !== "direct_sales" &&
              activeTab !== "returns" &&
              activeTab !== "common" &&
              activeTab !== "smart_matching" &&
              activeTab !== "three_d_matching" &&
              activeTab !== "receiving" &&
              activeTab !== "production" ? (
                <div className="w-full">
                  <WmsSettingsFutureTabShell label={activeLabel} tabId={activeTab} />
                </div>
              ) : null}
            </div>
          </div>
          <StickySaveBar
            className="-mx-5"
            visible={isDirty}
            saving={globalSaving}
            onCancel={() => void handleReset()}
            onSave={() => void handleSave()}
          />
        </div>
      </PageLayout>
  );
}