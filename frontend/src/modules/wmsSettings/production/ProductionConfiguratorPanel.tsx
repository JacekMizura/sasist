import { Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  createProductionConfig,
  deleteProductionConfig,
  disableProductionConfig,
  listProductionConfigs,
  updateProductionConfig,
  type AfterProductionAction,
  type ProductionConfigRead,
  type ProductionExecutionMethod,
} from "../../../api/wmsProductionConfigApi";
import { getOrderPanelSubgroups, getOrderUiStatusSummary } from "../../../api/orderUiStatusApi";
import { getWarehouseLocations, type WarehouseLocationItem } from "../../../api/warehouseGraphApi";
import { OrderUiStatusField } from "../../../components/orders/OrderUiStatusField";
import { OrderUiStatusConfigRowPresent } from "../../../components/orders/orderList/OrderUiStatusConfigRowPresent";
import { buildOrderUiStatusNameById } from "../../../components/orders/automation/buildOrderUiStatusNameById";
import { IconButton } from "../../../design-system";
import { brandPrimaryButtonClass } from "../../../design-system/brandUi";
import { DAMAGE_TENANT_ID } from "../../../pages/damage/damageShared";
import { SettingInfoButton } from "../../../pages/Settings/SettingInfoButton";
import {
  WmsBoolSettingRow,
  wmsSettingControlInputClass,
  wmsSettingControlSelectClass,
  wmsSettingsRowsStackClass,
} from "../../../pages/Settings/wmsSettingsUi";
import type {
  OrderUiPanelSubgroupRead,
  OrderUiStatusPanelSummary,
} from "../../../types/orderUiStatus";
import type { PanelConfigurableUiStatusBrief } from "../../../utils/panelListStatusBriefMappers";
import { PickingSettingsModal } from "../picking/PickingSettingsModal";
import {
  productionExecutionMethodLabel,
  PRODUCTION_TRIGGER_SCOPE_NOTE,
} from "./productionConfigLabels";

const LIST_GRID =
  "sm:grid-cols-[minmax(8rem,1.1fr)_minmax(9rem,1fr)_minmax(7rem,0.85fr)_minmax(7rem,0.85fr)_minmax(9rem,1fr)_auto]";

const listHeaderClass = "text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400";

type Props = {
  warehouseId: number | null;
};

type ProductionConfigDraft = {
  editId: number | null;
  name: string;
  isActive: boolean;
  sourceStatusId: string;
  statusAfterProductionId: string;
  statusOnComponentShortageId: string;
  finishedGoodsBufferLocationId: string;
  productionExecutionMethod: ProductionExecutionMethod;
  afterProductionAction: AfterProductionAction;
  sourceStatusBlurred: boolean;
  statusAfterBlurred: boolean;
};

function statusIdFromValue(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
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

function ProductionConfigStatusBadge({ status }: { status: PanelConfigurableUiStatusBrief }) {
  return (
    <OrderUiStatusConfigRowPresent
      status={status}
      variant="compact"
      className="!inline-flex h-9 w-fit max-w-full shrink-0 items-center !px-4 !py-0 shadow-none hover:translate-y-0 hover:shadow-none"
    />
  );
}

function createEmptyDraft(): ProductionConfigDraft {
  return {
    editId: null,
    name: "",
    isActive: true,
    sourceStatusId: "",
    statusAfterProductionId: "",
    statusOnComponentShortageId: "",
    finishedGoodsBufferLocationId: "",
    productionExecutionMethod: "WMS",
    afterProductionAction: "STATUS_ONLY",
    sourceStatusBlurred: false,
    statusAfterBlurred: false,
  };
}

function draftFromConfig(row: ProductionConfigRead): ProductionConfigDraft {
  return {
    editId: row.id,
    name: row.name,
    isActive: row.is_active,
    sourceStatusId: String(row.source_status_id),
    statusAfterProductionId: String(row.status_after_production_id),
    statusOnComponentShortageId: String(row.status_on_component_shortage_id),
    finishedGoodsBufferLocationId: String(row.finished_goods_buffer_location_id),
    productionExecutionMethod: row.production_execution_method === "PRINT" ? "PRINT" : "WMS",
    afterProductionAction: row.after_production_action === "OPEN_PACKING" ? "OPEN_PACKING" : "STATUS_ONLY",
    sourceStatusBlurred: false,
    statusAfterBlurred: false,
  };
}

function fingerprintDraft(d: ProductionConfigDraft): string {
  return JSON.stringify({
    editId: d.editId,
    name: d.name.trim(),
    isActive: d.isActive,
    sourceStatusId: d.sourceStatusId.trim(),
    statusAfterProductionId: d.statusAfterProductionId.trim(),
    statusOnComponentShortageId: d.statusOnComponentShortageId.trim(),
    finishedGoodsBufferLocationId: d.finishedGoodsBufferLocationId.trim(),
    productionExecutionMethod: d.productionExecutionMethod,
    afterProductionAction: d.afterProductionAction,
  });
}

function ProductionRadioGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">{legend}</legend>
      {options.map((opt) => (
        <label
          key={opt.value}
          className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 hover:bg-slate-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500/30"
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="h-4 w-4 shrink-0 border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-800">{opt.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function ProductionConfigForm({
  draft,
  setDraft,
  warehouseId,
  orderUiSummary,
  panelSubgroups,
  orderUiLoading,
  orderUiErr,
  bufferLocations,
  usedSourceStatusIds,
}: {
  draft: ProductionConfigDraft;
  setDraft: React.Dispatch<React.SetStateAction<ProductionConfigDraft | null>>;
  warehouseId: number | null;
  orderUiSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
  orderUiLoading: boolean;
  orderUiErr: string | null;
  bufferLocations: WarehouseLocationItem[];
  usedSourceStatusIds: number[];
}) {
  const statusNameById = useMemo(() => buildOrderUiStatusNameById(orderUiSummary), [orderUiSummary]);
  const isEdit = draft.editId != null;
  const selectDisabled = warehouseId == null || orderUiLoading || orderUiErr != null;

  const sourceId = statusIdFromValue(draft.sourceStatusId);
  const afterId = statusIdFromValue(draft.statusAfterProductionId);
  const shortageId = statusIdFromValue(draft.statusOnComponentShortageId);
  const statusPairConflict =
    sourceId != null && afterId != null && sourceId === afterId;

  const excludeSourceIds = usedSourceStatusIds.filter((id) => id !== sourceId);

  return (
    <div className="space-y-4" aria-label="Formularz konfiguracji produkcji">
      {warehouseId == null ? (
        <p className="text-sm text-amber-800">Wybierz magazyn, aby wczytać statusy panelu zamówień.</p>
      ) : null}
      {orderUiErr ? <p className="text-sm text-red-700">{orderUiErr}</p> : null}

      <div className={wmsSettingsRowsStackClass}>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <label className="block text-sm font-semibold text-slate-900">
            Nazwa
            <span className="ml-1 text-red-600" aria-hidden>
              *
            </span>
          </label>
          <input
            type="text"
            className={`${wmsSettingControlInputClass} mt-3`}
            value={draft.name}
            onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
            placeholder="Np. Produkcja z zamówień ST"
            maxLength={128}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <WmsBoolSettingRow
            label="Aktywna"
            checked={draft.isActive}
            onChange={(v) => setDraft((d) => (d ? { ...d, isActive: v } : d))}
            hint="Nieaktywne konfiguracje nie uruchamiają produkcji z zamówień."
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 min-[720px]:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="text-sm font-semibold text-slate-900">
              Status wejściowy
              <span className="ml-1 text-red-600" aria-hidden>
                *
              </span>
            </p>
            <SettingInfoButton
              title="Status wejściowy"
              description="Status zamówienia, z którego startuje produkcja z zamówień. Każdy status może mieć jedną konfigurację."
            />
          </div>
          <div className="mt-3">
            {isEdit ? (
              <p className="text-sm text-slate-600">
                {orderUiSummary
                  ? statusNameById.get(sourceId ?? 0) ?? `Status #${draft.sourceStatusId}`
                  : `Status #${draft.sourceStatusId}`}
              </p>
            ) : (
              <OrderUiStatusField
                panelSummary={orderUiSummary}
                panelSubgroups={panelSubgroups}
                statusNameById={statusNameById}
                selectedStatusId={sourceId}
                onPick={(id) => {
                  if (excludeSourceIds.includes(id ?? -1)) {
                    toast.error("Ten status ma już przypisaną konfigurację produkcji.");
                    return;
                  }
                  setDraft((d) =>
                    d ? { ...d, sourceStatusId: id != null ? String(id) : "", sourceStatusBlurred: true } : d,
                  );
                }}
                allowClear
                clearLabel="— wybierz —"
                placeholder="Wybierz status zamówienia…"
                disabled={selectDisabled}
                floatingZIndexClass="z-[5100]"
              />
            )}
            {!isEdit && draft.sourceStatusBlurred && !draft.sourceStatusId ? (
              <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
                To pole jest wymagane.
              </p>
            ) : null}
            {statusPairConflict ? (
              <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
                Status wejściowy i status po wyprodukowaniu muszą się różnić.
              </p>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="text-sm font-semibold text-slate-900">
              Status po wyprodukowaniu
              <span className="ml-1 text-red-600" aria-hidden>
                *
              </span>
            </p>
            <SettingInfoButton
              title="Status po wyprodukowaniu"
              description="Status, na który zamówienie trafi po wykonaniu przypisanej ilości produkcji."
            />
          </div>
          <div className="mt-3">
            <OrderUiStatusField
              panelSummary={orderUiSummary}
              panelSubgroups={panelSubgroups}
              statusNameById={statusNameById}
              selectedStatusId={afterId}
              onPick={(id) =>
                setDraft((d) =>
                  d ? { ...d, statusAfterProductionId: id != null ? String(id) : "", statusAfterBlurred: true } : d,
                )
              }
              allowClear
              clearLabel="— wybierz —"
              placeholder="Wybierz status…"
              disabled={selectDisabled}
              floatingZIndexClass="z-[5100]"
            />
            {draft.statusAfterBlurred && !draft.statusAfterProductionId ? (
              <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
                To pole jest wymagane.
              </p>
            ) : null}
          </div>
        </div>

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
              selectedStatusId={shortageId}
              onPick={(id) =>
                setDraft((d) =>
                  d ? { ...d, statusOnComponentShortageId: id != null ? String(id) : "" } : d,
                )
              }
              allowClear
              clearLabel="— wybierz —"
              placeholder="Wybierz status…"
              disabled={selectDisabled}
              floatingZIndexClass="z-[5100]"
            />
            {!draft.statusOnComponentShortageId ? (
              <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
                Wybierz status przy braku komponentów.
              </p>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="text-sm font-semibold text-slate-900">
              Lokalizacja buforowa
              <span className="ml-1 text-red-600" aria-hidden>
                *
              </span>
            </p>
            <SettingInfoButton
              title="Lokalizacja buforowa"
              description="Tu trafia produkt gotowy z produkcji — dostępny do pakowania bez kolejki rozlokowania."
            />
          </div>
          <div className="mt-3">
            <select
              className={wmsSettingControlSelectClass}
              value={draft.finishedGoodsBufferLocationId}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, finishedGoodsBufferLocationId: e.target.value } : d))
              }
              disabled={warehouseId == null}
              aria-label="Lokalizacja buforowa"
            >
              <option value="">— wybierz lokalizację —</option>
              {bufferLocations.map((loc) => (
                <option key={loc.id} value={String(loc.id)}>
                  {loc.name}
                </option>
              ))}
            </select>
            {!draft.finishedGoodsBufferLocationId ? (
              <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">
                Wybierz lokalizację buforową.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
        <div className="mb-2 flex items-center gap-1.5">
          <p className="text-sm font-semibold text-slate-900">Sposób realizacji</p>
          <SettingInfoButton
            title="Sposób realizacji"
            description="Terminal WMS — kompletacja na kolektorze. Wydruk zlecenia — karta produkcyjna PDF."
          />
        </div>
        <ProductionRadioGroup
          legend="Sposób realizacji"
          name="production-execution-method"
          value={draft.productionExecutionMethod}
          options={[
            { value: "WMS", label: "Terminal WMS" },
            { value: "PRINT", label: "Wydruk zlecenia" },
          ]}
          onChange={(v) => setDraft((d) => (d ? { ...d, productionExecutionMethod: v } : d))}
        />
      </div>

      <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
        <div className="mb-2 flex items-center gap-1.5">
          <p className="text-sm font-semibold text-slate-900">Po wyprodukowaniu</p>
          <SettingInfoButton
            title="Po wyprodukowaniu"
            description="Tylko zmień status — zamówienie przechodzi na status po produkcji. Otwórz pakowanie — dodatkowo otwiera ekran pakowania."
          />
        </div>
        <ProductionRadioGroup
          legend="Po wyprodukowaniu"
          name="after-production-action"
          value={draft.afterProductionAction}
          options={[
            { value: "STATUS_ONLY", label: "Tylko zmień status" },
            { value: "OPEN_PACKING", label: "Otwórz pakowanie" },
          ]}
          onChange={(v) => setDraft((d) => (d ? { ...d, afterProductionAction: v } : d))}
        />
      </div>

      <p className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
        {PRODUCTION_TRIGGER_SCOPE_NOTE}
      </p>
    </div>
  );
}

function ProductionConfigListRow({
  config,
  orderUiSummary,
  onEdit,
  onDisable,
  onDelete,
  busy,
}: {
  config: ProductionConfigRead;
  orderUiSummary: OrderUiStatusPanelSummary | null;
  onEdit: (row: ProductionConfigRead) => void;
  onDisable: (row: ProductionConfigRead) => void;
  onDelete: (row: ProductionConfigRead) => void;
  busy: boolean;
}) {
  const sourceBrief = resolvePanelStatusBrief(
    orderUiSummary,
    config.source_status_id,
    config.source_status_name ?? `Status #${config.source_status_id}`,
  );
  const afterBrief = resolvePanelStatusBrief(
    orderUiSummary,
    config.status_after_production_id,
    config.status_after_production_name ?? `Status #${config.status_after_production_id}`,
  );

  return (
    <div
      className={`grid grid-cols-1 items-center gap-4 border-b border-slate-100 px-3 py-4 last:border-b-0 sm:gap-4 sm:px-4 lg:gap-5 ${LIST_GRID}`}
      aria-label={`Konfiguracja produkcji: ${config.name}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{config.name}</p>
        <span
          className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            config.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {config.is_active ? "Aktywna" : "Wyłączona"}
        </span>
      </div>
      <div className="flex min-w-0 justify-center sm:justify-start">
        <ProductionConfigStatusBadge status={sourceBrief} />
      </div>
      <div className="min-w-0 text-center sm:text-left">
        <p className="text-sm font-medium text-slate-800">
          {productionExecutionMethodLabel(config.production_execution_method)}
        </p>
      </div>
      <div className="min-w-0 text-center sm:text-left">
        <p className="text-sm text-slate-700">
          {config.finished_goods_buffer_location_name?.trim() ||
            `#${config.finished_goods_buffer_location_id}`}
        </p>
      </div>
      <div className="flex min-w-0 justify-center sm:justify-start">
        <ProductionConfigStatusBadge status={afterBrief} />
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1.5">
        <IconButton
          tone="neutral"
          title="Edytuj"
          aria-label="Edytuj"
          disabled={busy}
          onClick={() => onEdit(config)}
        >
          <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
        </IconButton>
        {config.is_active ? (
          <IconButton
            tone="neutral"
            title="Wyłącz"
            aria-label="Wyłącz"
            disabled={busy}
            onClick={() => onDisable(config)}
          >
            <Power className="h-4 w-4" strokeWidth={2} aria-hidden />
          </IconButton>
        ) : null}
        <IconButton
          tone="danger"
          title="Usuń"
          aria-label="Usuń"
          disabled={busy}
          onClick={() => onDelete(config)}
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
        </IconButton>
      </div>
    </div>
  );
}

export function ProductionConfiguratorPanel({ warehouseId }: Props) {
  const [configs, setConfigs] = useState<ProductionConfigRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [draft, setDraft] = useState<ProductionConfigDraft | null>(null);
  const [editBaseline, setEditBaseline] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [orderUiSummary, setOrderUiSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [panelSubgroups, setPanelSubgroups] = useState<OrderUiPanelSubgroupRead[]>([]);
  const [orderUiLoading, setOrderUiLoading] = useState(false);
  const [orderUiErr, setOrderUiErr] = useState<string | null>(null);
  const [bufferLocations, setBufferLocations] = useState<WarehouseLocationItem[]>([]);

  const usedSourceStatusIds = useMemo(
    () => configs.map((c) => c.source_status_id).filter((id) => Number.isFinite(id) && id > 0),
    [configs],
  );

  const draftDirty = useMemo(() => {
    if (!draft) return false;
    const fp = fingerprintDraft(draft);
    if (editBaseline != null) return fp !== editBaseline;
    return fp !== fingerprintDraft(createEmptyDraft());
  }, [draft, editBaseline]);

  const loadConfigs = useCallback(async () => {
    if (warehouseId == null) {
      setConfigs([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await listProductionConfigs(DAMAGE_TENANT_ID, warehouseId, true);
      setConfigs(rows);
    } catch {
      toast.error("Nie udało się wczytać konfiguracji produkcji.");
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  useEffect(() => {
    if (warehouseId == null) {
      setOrderUiSummary(null);
      setPanelSubgroups([]);
      setOrderUiErr(null);
      return;
    }
    let cancelled = false;
    setOrderUiLoading(true);
    setOrderUiErr(null);
    void Promise.all([
      getOrderUiStatusSummary(DAMAGE_TENANT_ID, warehouseId),
      getOrderPanelSubgroups(DAMAGE_TENANT_ID, warehouseId).catch(() => [] as OrderUiPanelSubgroupRead[]),
    ])
      .then(([summary, subgroups]) => {
        if (cancelled) return;
        setOrderUiSummary(summary);
        setPanelSubgroups(subgroups);
      })
      .catch(() => {
        if (!cancelled) setOrderUiErr("Nie udało się wczytać statusów panelu zamówień.");
      })
      .finally(() => {
        if (!cancelled) setOrderUiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [warehouseId]);

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

  const closeDraft = () => {
    if (saving) return;
    setDraft(null);
    setEditBaseline(null);
    setSaveError(null);
  };

  const openCreate = () => {
    setSaveError(null);
    setEditBaseline(null);
    setDraft(createEmptyDraft());
  };

  const openEdit = (row: ProductionConfigRead) => {
    setSaveError(null);
    const d = draftFromConfig(row);
    setEditBaseline(fingerprintDraft(d));
    setDraft(d);
  };

  const validateDraft = (d: ProductionConfigDraft): string | null => {
    if (!d.name.trim()) return "Podaj nazwę konfiguracji.";
    const sourceId = statusIdFromValue(d.sourceStatusId);
    const afterId = statusIdFromValue(d.statusAfterProductionId);
    const shortageId = statusIdFromValue(d.statusOnComponentShortageId);
    const bufferId = statusIdFromValue(d.finishedGoodsBufferLocationId);

    if (d.editId == null && (sourceId == null || sourceId < 1)) {
      setDraft({ ...d, sourceStatusBlurred: true });
      return "Wybierz status wejściowy.";
    }
    if (afterId == null || afterId < 1) {
      setDraft({ ...d, statusAfterBlurred: true });
      return "Wybierz status po wyprodukowaniu.";
    }
    if (sourceId != null && afterId === sourceId) {
      return "Status wejściowy i status po wyprodukowaniu muszą się różnić.";
    }
    if (shortageId == null || shortageId < 1) return "Wybierz status przy braku komponentów.";
    if (shortageId === sourceId) {
      return "Status przy braku komponentów musi być inny niż status wejściowy.";
    }
    if (bufferId == null || bufferId < 1) return "Wybierz lokalizację buforową.";
    return null;
  };

  const saveDraft = async () => {
    if (!draft || warehouseId == null) return;
    const err = validateDraft(draft);
    if (err) {
      setSaveError(err);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (draft.editId != null) {
        await updateProductionConfig(DAMAGE_TENANT_ID, warehouseId, draft.editId, {
          name: draft.name.trim(),
          is_active: draft.isActive,
          status_after_production_id: Number(draft.statusAfterProductionId),
          status_on_component_shortage_id: Number(draft.statusOnComponentShortageId),
          finished_goods_buffer_location_id: Number(draft.finishedGoodsBufferLocationId),
          production_order_trigger_scope: "SINGLE_ELEMENT",
          production_execution_method: draft.productionExecutionMethod,
          after_production_action: draft.afterProductionAction,
        });
        toast.success("Zapisano konfigurację produkcji.");
      } else {
        await createProductionConfig({
          tenant_id: DAMAGE_TENANT_ID,
          warehouse_id: warehouseId,
          name: draft.name.trim(),
          is_active: draft.isActive,
          source_status_id: Number(draft.sourceStatusId),
          status_after_production_id: Number(draft.statusAfterProductionId),
          status_on_component_shortage_id: Number(draft.statusOnComponentShortageId),
          finished_goods_buffer_location_id: Number(draft.finishedGoodsBufferLocationId),
          production_order_trigger_scope: "SINGLE_ELEMENT",
          production_execution_method: draft.productionExecutionMethod,
          after_production_action: draft.afterProductionAction,
        });
        toast.success("Dodano konfigurację produkcji.");
      }
      closeDraft();
      await loadConfigs();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Zapis konfiguracji nie powiódł się.";
      setSaveError(typeof msg === "string" ? msg : "Zapis konfiguracji nie powiódł się.");
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async (row: ProductionConfigRead) => {
    if (warehouseId == null) return;
    if (!window.confirm(`Wyłączyć konfigurację „${row.name}"?`)) return;
    setActionBusy(true);
    try {
      await disableProductionConfig(DAMAGE_TENANT_ID, warehouseId, row.id);
      toast.success("Konfiguracja wyłączona.");
      await loadConfigs();
    } catch {
      toast.error("Nie udało się wyłączyć konfiguracji.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleDelete = async (row: ProductionConfigRead) => {
    if (warehouseId == null) return;
    if (!window.confirm(`Usunąć konfigurację „${row.name}"? Jeśli jest w użyciu, zostanie tylko wyłączona.`)) {
      return;
    }
    setActionBusy(true);
    try {
      const res = await deleteProductionConfig(DAMAGE_TENANT_ID, warehouseId, row.id);
      if (res.action === "disabled") {
        toast.success("Konfiguracja w użyciu — wyłączono zamiast usuwać.");
      } else {
        toast.success("Konfiguracja usunięta.");
      }
      await loadConfigs();
    } catch {
      toast.error("Operacja nie powiodła się.");
    } finally {
      setActionBusy(false);
    }
  };

  const busy = loading || saving || actionBusy;

  return (
    <div className="space-y-4" aria-label="Konfigurator produkcji">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          className={brandPrimaryButtonClass}
          onClick={openCreate}
          disabled={draft != null || busy || warehouseId == null}
        >
          <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Dodaj konfigurację
        </button>
      </div>

      {warehouseId == null ? (
        <p className="rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          Wybierz magazyn w pasku u góry, aby zarządzać konfiguracją produkcji.
        </p>
      ) : loading && configs.length === 0 ? (
        <p className="text-sm text-slate-500">Wczytywanie konfiguracji…</p>
      ) : configs.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
          Brak konfiguracji produkcji — dodaj pierwszą powyżej.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div
            className={`hidden gap-4 border-b border-slate-100 px-3 py-3 sm:grid sm:px-4 lg:gap-5 ${LIST_GRID}`}
          >
            <p className={listHeaderClass}>Nazwa</p>
            <p className={listHeaderClass}>Status wejściowy</p>
            <p className={listHeaderClass}>Realizacja</p>
            <p className={listHeaderClass}>Bufor</p>
            <p className={listHeaderClass}>Po produkcji</p>
            <span className="sr-only">Akcje</span>
          </div>
          {configs.map((row) => (
            <ProductionConfigListRow
              key={row.id}
              config={row}
              orderUiSummary={orderUiSummary}
              onEdit={openEdit}
              onDisable={handleDisable}
              onDelete={handleDelete}
              busy={busy}
            />
          ))}
        </div>
      )}

      <PickingSettingsModal
        open={draft != null}
        title={draft?.editId != null ? "Edycja konfiguracji produkcji" : "Nowa konfiguracja produkcji"}
        subtitle="Zmiany zapisujesz tutaj — niezależnie od pozostałych ustawień produkcji."
        onClose={closeDraft}
        onSave={() => void saveDraft()}
        dirty={draftDirty}
        saving={saving}
        saveError={saveError}
      >
        {draft != null ? (
          <ProductionConfigForm
            draft={draft}
            setDraft={setDraft}
            warehouseId={warehouseId}
            orderUiSummary={orderUiSummary}
            panelSubgroups={panelSubgroups}
            orderUiLoading={orderUiLoading}
            orderUiErr={orderUiErr}
            bufferLocations={bufferLocations}
            usedSourceStatusIds={usedSourceStatusIds}
          />
        ) : null}
      </PickingSettingsModal>
    </div>
  );
}

export default ProductionConfiguratorPanel;
