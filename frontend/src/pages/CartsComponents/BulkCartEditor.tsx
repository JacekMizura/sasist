import { useEffect, useMemo, useState, type FormEvent } from "react";

import { ProductLikePageLayout } from "../../components/catalog/ProductLikePageLayout";
import {
  productLikeFieldLabelClass,
  productLikeInputClass,
} from "../../components/catalog/productLikeTokens";
import { CapacityStrategyFields } from "../../modules/warehouse-structure/CapacityStrategyFields";
import {
  capacityStrategyLabel,
  formatScanCodeLabel,
} from "../../modules/warehouse-structure/labels";
import { cartsSectionClass } from "../../modules/carts/cartsModuleTokens";
import { wmsSectionTitle } from "../../modules/carts/wmsOperationalUi";
import { log } from "../../utils/logger";
import api from "../../api/axios";
import { fetchWmsCartStats, parseCapacitySnapshot } from "../../api/wmsCartStatsApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { useTranslation } from "../../locales";
import {
  CapacityStrategy,
  type CapacitySnapshot,
  type CapacityStrategyValue,
} from "../../types/cartCapacity";
import CartImageUrlField from "./ui/CartImageUrlField";
import CartCapacitySection from "./ui/CartCapacitySection";
import ProgressBar from "./ui/ProgressBar";
import StatusPill from "./ui/StatusPill";

type BulkFormState = {
  name: string;
  length: number;
  width: number;
  height: number;
};

type CartGroup = { id: number; name: string };

const VOLUME_STRATEGIES: CapacityStrategyValue[] = [
  CapacityStrategy.LIMIT_VOLUME,
  CapacityStrategy.HYBRID_STOP_FIRST,
  CapacityStrategy.HYBRID_STOP_VOLUME,
];

export default function BulkCartEditor({
  cartId,
  onClose,
}: {
  cartId: number | null;
  onClose: () => void;
}) {
  const t = useTranslation();
  const { warehouse } = useWarehouse();
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(Boolean(cartId));
  const [formData, setFormData] = useState<BulkFormState>({
    name: "",
    length: 0,
    width: 0,
    height: 0,
  });
  const [imageUrl, setImageUrl] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [availableGroups, setAvailableGroups] = useState<CartGroup[]>([]);
  const [capacityStrategy, setCapacityStrategy] = useState<CapacityStrategyValue>(
    CapacityStrategy.LIMIT_VOLUME,
  );
  const [capacityOrders, setCapacityOrders] = useState<number | "">("");
  const [capacityVolume, setCapacityVolume] = useState<number | "">("");
  const [cartCode, setCartCode] = useState("");
  const [cartScanCode, setCartScanCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [usedVolume, setUsedVolume] = useState(0);
  const [totalVolumeDm3, setTotalVolumeDm3] = useState(0);
  const [capacitySnapshot, setCapacitySnapshot] = useState<CapacitySnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setInitLoading(true);
      try {
        const resGroups = await api.get("/carts/groups/?tenant_id=1&cart_type=BULK");
        if (cancelled) return;

        const groupsRaw: unknown[] = Array.isArray(resGroups.data) ? resGroups.data : [];
        const groups: CartGroup[] = groupsRaw
          .map((g) => {
            const obj = g as { id?: unknown; name?: unknown };
            return { id: Number(obj.id), name: String(obj.name ?? "") };
          })
          .filter((g) => Number.isFinite(g.id) && g.id > 0);
        setAvailableGroups(groups);

        if (cartId) {
          const [res, stats] = await Promise.all([
            api.get(`/carts/${cartId}/`),
            fetchWmsCartStats(cartId),
          ]);
          if (cancelled) return;

          const data = res.data;
          setFormData({
            name: data.name ?? "",
            length: Number(data.length) || 0,
            width: Number(data.width) || 0,
            height: Number(data.height) || 0,
          });
          setCartCode(String(data.code ?? data.barcode ?? "").trim());
          const sc =
            data.scan_code != null && String(data.scan_code).trim() !== ""
              ? String(data.scan_code).trim()
              : null;
          setCartScanCode(sc);
          setImageUrl(data.image_url ?? "");
          setStatus(String(data.status ?? stats.status ?? ""));
          setUsedVolume(Number(stats.volume_used) || 0);
          setTotalVolumeDm3(Number(data.total_volume_dm3) || 0);
          setCapacitySnapshot(parseCapacitySnapshot(data.capacity) ?? stats.capacity ?? null);

          const rawGroupId = data.group_id;
          const initialGroupId =
            rawGroupId != null && rawGroupId !== "" && !Number.isNaN(Number(rawGroupId))
              ? Number(rawGroupId)
              : null;
          setGroupId(initialGroupId);

          const rawStrategy = String(data.capacity_strategy ?? CapacityStrategy.LIMIT_VOLUME).toUpperCase();
          const strategy = (Object.values(CapacityStrategy) as string[]).includes(rawStrategy)
            ? (rawStrategy as CapacityStrategyValue)
            : CapacityStrategy.LIMIT_VOLUME;
          setCapacityStrategy(strategy);
          setCapacityOrders(data.capacity_orders != null ? Number(data.capacity_orders) : "");
          setCapacityVolume(data.capacity_volume != null ? Number(data.capacity_volume) : "");
        } else {
          setCartScanCode(null);
          setCapacitySnapshot(null);
        }
      } catch (err) {
        if (!cancelled) console.error("BulkCartEditor init error:", err);
      } finally {
        if (!cancelled) setInitLoading(false);
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [cartId]);

  const computedVolume = useMemo(
    () => (Number(formData.length) * Number(formData.width) * Number(formData.height)) / 1000,
    [formData.length, formData.width, formData.height],
  );

  const fillPercent = useMemo(() => {
    if (capacitySnapshot?.capacity_usage_percent != null) {
      return Math.min(100, Math.max(0, capacitySnapshot.capacity_usage_percent));
    }
    const cap = totalVolumeDm3 || computedVolume || 1;
    return Math.min(100, Math.round((usedVolume / cap) * 100));
  }, [usedVolume, totalVolumeDm3, computedVolume, capacitySnapshot]);

  const groupName = useMemo(() => {
    if (groupId == null) return t.unassigned;
    return availableGroups.find((g) => g.id === groupId)?.name ?? t.unassigned;
  }, [groupId, availableGroups, t.unassigned]);

  const showVolumeField = VOLUME_STRATEGIES.includes(capacityStrategy);

  const handleSave = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!warehouse) return;
    const trimmedCode = cartCode.trim();
    if (cartId && !trimmedCode) {
      alert("Podaj kod wózka.");
      return;
    }
    setLoading(true);
    try {
      const vol = computedVolume;
      const payload: Record<string, unknown> = {
        name: formData.name.toUpperCase(),
        tenant_id: 1,
        warehouse_id: warehouse.id,
        group_id: groupId,
        image_url: imageUrl.trim() || null,
        length: Number(formData.length),
        width: Number(formData.width),
        height: Number(formData.height),
        capacity_strategy: capacityStrategy,
      };
      if (
        capacityStrategy === CapacityStrategy.LIMIT_ORDERS ||
        capacityStrategy === CapacityStrategy.HYBRID_STOP_FIRST ||
        capacityStrategy === CapacityStrategy.HYBRID_STOP_VOLUME
      ) {
        payload.capacity_orders = capacityOrders === "" ? null : Number(capacityOrders);
      }
      if (showVolumeField) {
        payload.capacity_volume = capacityVolume === "" ? vol : Number(capacityVolume);
      }
      if (cartId) {
        payload.code = trimmedCode;
      } else if (trimmedCode) {
        payload.code = trimmedCode;
      }

      if (cartId) {
        await api.put(`/carts/${cartId}/`, payload);
      } else {
        await api.post("/carts/bulk/", payload);
      }
      log("[BulkCartEditor] Save success");
      onClose();
    } catch (err: unknown) {
      console.error("[BulkCartEditor] Błąd zapisu:", err);
      const ax = err as { response?: { status?: number; data?: { detail?: string } } };
      if (ax.response?.status === 409 || ax.response?.status === 422) {
        const d = ax.response.data?.detail;
        alert(typeof d === "string" ? d : t.saveErrorBulk);
      } else {
        alert(t.saveErrorBulk);
      }
    } finally {
      setLoading(false);
    }
  };

  const title = formData.name.trim() || (cartId ? t.editBulkCart : t.newBulkCart);

  const editorBody = initLoading ? (
    <p className="py-10 text-center text-[15px] text-slate-500">Ładowanie wózka…</p>
  ) : (
    <div className="space-y-3">
      <section className={cartsSectionClass}>
        <h3 className={wmsSectionTitle}>Podstawowe dane</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cartId ? (
            <div>
              <label className={productLikeFieldLabelClass}>ID</label>
              <p className="mt-1 font-mono text-[14px] tabular-nums text-slate-700">{cartId}</p>
            </div>
          ) : null}
          <div className={cartId ? "" : "sm:col-span-2"}>
            <label className={productLikeFieldLabelClass} htmlFor="bulk-cart-code">
              Kod{cartId ? "" : " (opcjonalnie)"}
            </label>
            <input
              id="bulk-cart-code"
              className={`${productLikeInputClass} mt-1 font-mono text-[15px]`}
              value={cartCode}
              onChange={(e) => setCartCode(e.target.value)}
              placeholder={cartId ? "" : "Puste = wygeneruj CART-0001"}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={productLikeFieldLabelClass}>{t.name}</label>
            <input
              className={`${productLikeInputClass} mt-1 text-[15px] font-semibold`}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          {cartId && cartScanCode ? (
            <div className="sm:col-span-2 lg:col-span-4">
              <label className={productLikeFieldLabelClass}>Kod terminala WMS</label>
              <p className="mt-1 font-mono text-[14px] text-slate-700">{formatScanCodeLabel(cartScanCode)}</p>
            </div>
          ) : null}
          <div>
            <label className={productLikeFieldLabelClass}>Grupa wózków</label>
            <select
              className={`${productLikeInputClass} mt-1 text-[15px]`}
              value={groupId === null ? "" : String(groupId)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") setGroupId(null);
                else {
                  const n = Number(v);
                  setGroupId(Number.isNaN(n) ? null : n);
                }
              }}
            >
              <option value="">{t.unassigned}</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={String(g.id)}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          {cartId ? (
            <div>
              <label className={productLikeFieldLabelClass}>Status</label>
              <div className="mt-1">
                <StatusPill status={status} />
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className={cartsSectionClass}>
        <h3 className={wmsSectionTitle}>Wymiary (cm)</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["width", t.width],
              ["length", t.length],
              ["height", t.height],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <label className={productLikeFieldLabelClass}>{label}</label>
              <input
                type="number"
                className={`${productLikeInputClass} mt-1 tabular-nums text-[15px]`}
                value={formData[field] || ""}
                onChange={(e) => setFormData({ ...formData, [field]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[14px] text-slate-600">
          Obliczona pojemność:{" "}
          <span className="font-bold tabular-nums text-slate-900">{computedVolume.toFixed(1)} dm³</span>
        </p>
      </section>

      <section className={cartsSectionClass}>
        <h3 className={wmsSectionTitle}>Pojemność operacyjna</h3>
        <div className="mt-3 space-y-4">
          <CapacityStrategyFields
            strategy={capacityStrategy}
            onStrategyChange={setCapacityStrategy}
            capacityOrders={capacityOrders}
            onCapacityOrdersChange={setCapacityOrders}
            cartKind="BULK"
            namePrefix="bulkCapacityStrategy"
          />
          {showVolumeField ? (
            <label className="block max-w-xs text-sm">
              <span className={productLikeFieldLabelClass}>Limit objętości (dm³)</span>
              <input
                type="number"
                min={0}
                step={0.1}
                className={`${productLikeInputClass} mt-1`}
                value={capacityVolume === "" ? "" : capacityVolume}
                onChange={(e) =>
                  setCapacityVolume(e.target.value === "" ? "" : Number(e.target.value))
                }
                placeholder={computedVolume.toFixed(1)}
              />
            </label>
          ) : null}
        </div>
      </section>

      {cartId ? (
        <section className={cartsSectionClass}>
          <h3 className={wmsSectionTitle}>Operacje</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
              <p className="text-[12px] font-bold uppercase text-slate-500">Strategia</p>
              <p className="mt-1 text-[15px] font-bold text-slate-900">
                {capacityStrategyLabel(capacityStrategy)}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
              <p className="text-[12px] font-bold uppercase text-slate-500">Objętość</p>
              <p className="mt-1 text-[15px] font-bold tabular-nums text-slate-900">
                {usedVolume.toFixed(1)} / {(totalVolumeDm3 || computedVolume).toFixed(1)} dm³
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
              <p className="text-[12px] font-bold uppercase text-slate-500">Wykorzystanie</p>
              <p className="mt-1 text-[15px] font-bold tabular-nums text-slate-900">{fillPercent}%</p>
            </div>
          </div>
          <div className="mt-3 max-w-xl">
            <ProgressBar percent={fillPercent} />
          </div>
          {capacitySnapshot ? (
            <div className="mt-3 max-w-md rounded-md border border-slate-200 bg-white px-3 py-2">
              <CartCapacitySection capacity={capacitySnapshot} />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={cartsSectionClass}>
        <h3 className={wmsSectionTitle}>Zdjęcie</h3>
        <div className="mt-3 max-w-sm">
          <CartImageUrlField value={imageUrl} onChange={setImageUrl} />
        </div>
      </section>
    </div>
  );

  return (
    <ProductLikePageLayout
      variant="page"
      hideTabs
      hideModeLabel
      modeLabel=""
      title={title}
      imageUrl={imageUrl}
      imageAlt={formData.name}
      metaChips={[
        ...(cartCode ? [{ label: "Kod", value: cartCode }] : []),
        ...(cartId
          ? [
              { label: "Pojemność", value: `${(totalVolumeDm3 || computedVolume).toFixed(1)} dm³`, variant: "blue" as const },
              { label: "Strategia", value: capacityStrategyLabel(capacityStrategy) },
              { label: "Grupa", value: groupName },
            ]
          : []),
      ]}
      headerActions={
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-[14px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t.close}
        </button>
      }
      tabs={[]}
      activeTab="basic"
      onTabChange={() => {}}
      onSubmit={handleSave}
      saving={loading}
      saveLabel={loading ? t.savingBulk : t.confirm}
    >
      {editorBody}
    </ProductLikePageLayout>
  );
}
