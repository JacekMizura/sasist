import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Activity, Layers, Link2, Package } from "lucide-react";

import { ProductLikePageLayout } from "../../components/catalog/ProductLikePageLayout";
import { ProductLikeSection } from "../../components/catalog/ProductLikeSection";
import {
  productLikeFieldLabelClass,
  productLikeInputClass,
} from "../../components/catalog/productLikeTokens";
import { CapacityModeFields } from "../../modules/warehouse-structure/CapacityModeFields";
import { WarehouseEntityColumns } from "../../modules/warehouse-structure/WarehouseEntityColumns";
import {
  capacityModeLabel,
  formatScanCodeLabel,
  type CapacityMode,
} from "../../modules/warehouse-structure/labels";
import { log } from "../../utils/logger";
import api from "../../api/axios";
import { useWarehouse } from "../../context/WarehouseContext";
import { useTranslation } from "../../locales";
import CartImageUrlField from "./ui/CartImageUrlField";
import ProgressBar from "./ui/ProgressBar";

type BulkFormState = {
  name: string;
  length: number;
  width: number;
  height: number;
};

type CartGroup = { id: number; name: string };

type BulkCartTab = "basic" | "capacity" | "operations" | "relations";

const BULK_TABS = [
  { id: "basic" as const, label: "Podstawowe", icon: Package },
  { id: "capacity" as const, label: "Pojemność", icon: Layers },
  { id: "operations" as const, label: "Operacje", icon: Activity },
  { id: "relations" as const, label: "Powiązania", icon: Link2 },
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
  const [activeTab, setActiveTab] = useState<BulkCartTab>("basic");
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
  const [capacityMode, setCapacityMode] = useState<CapacityMode>("volume");
  const [maxOrders, setMaxOrders] = useState<number | "">("");
  const [maxVolumeDm3, setMaxVolumeDm3] = useState<number | "">("");
  const [cartCode, setCartCode] = useState("");
  const [cartScanCode, setCartScanCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [usedVolume, setUsedVolume] = useState(0);
  const [totalVolumeDm3, setTotalVolumeDm3] = useState(0);

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
          const res = await api.get(`/carts/${cartId}/`);
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
          setStatus(String(data.status ?? ""));
          setUsedVolume(Number(data.used_volume) || 0);
          setTotalVolumeDm3(Number(data.total_volume_dm3) || 0);

          const rawGroupId = data.group_id;
          const initialGroupId =
            rawGroupId != null && rawGroupId !== "" && !Number.isNaN(Number(rawGroupId))
              ? Number(rawGroupId)
              : null;
          setGroupId(initialGroupId);
          setCapacityMode((data.capacity_mode ?? "volume") as CapacityMode);
          setMaxOrders(data.max_orders != null ? data.max_orders : "");
          setMaxVolumeDm3(data.max_volume_dm3 != null ? data.max_volume_dm3 : "");
        } else {
          setCartScanCode(null);
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
    [formData.length, formData.width, formData.height]
  );

  const fillPercent = useMemo(() => {
    const cap = totalVolumeDm3 || computedVolume || 1;
    return Math.min(100, Math.round((usedVolume / cap) * 100));
  }, [usedVolume, totalVolumeDm3, computedVolume]);

  const groupName = useMemo(() => {
    if (groupId == null) return t.unassigned;
    return availableGroups.find((g) => g.id === groupId)?.name ?? t.unassigned;
  }, [groupId, availableGroups, t.unassigned]);

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
        capacity_mode: capacityMode,
      };
      if (capacityMode === "orders" || capacityMode === "mixed") {
        payload.max_orders = maxOrders === "" ? null : Number(maxOrders);
      }
      if (capacityMode === "volume" || capacityMode === "mixed") {
        payload.max_volume_dm3 = maxVolumeDm3 === "" ? vol : Number(maxVolumeDm3);
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

  const tabContent = (() => {
    if (initLoading) {
      return <p className="py-12 text-center text-slate-500">Ładowanie wózka…</p>;
    }

    switch (activeTab) {
      case "basic":
        return (
          <WarehouseEntityColumns
            main={
              <>
                <ProductLikeSection title="Informacje podstawowe">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {cartId ? (
                      <div>
                        <label className={productLikeFieldLabelClass}>Identyfikator</label>
                        <p className="font-mono text-sm tabular-nums text-slate-700">{cartId}</p>
                      </div>
                    ) : null}
                    <div className={cartId ? "" : "sm:col-span-2"}>
                      <label className={productLikeFieldLabelClass} htmlFor="bulk-cart-code">
                        Kod{cartId ? "" : " (opcjonalnie)"}
                      </label>
                      <input
                        id="bulk-cart-code"
                        className={`${productLikeInputClass} font-mono`}
                        value={cartCode}
                        onChange={(e) => setCartCode(e.target.value)}
                        placeholder={cartId ? "" : "Puste = wygeneruj CART-0001"}
                      />
                    </div>
                    {cartId && cartScanCode ? (
                      <div className="sm:col-span-2">
                        <label className={productLikeFieldLabelClass}>Kod skanowania WMS</label>
                        <p className="font-mono text-sm text-slate-700">{formatScanCodeLabel(cartScanCode)}</p>
                      </div>
                    ) : null}
                    <div className="sm:col-span-2">
                      <label className={productLikeFieldLabelClass}>{t.name}</label>
                      <input
                        className={productLikeInputClass}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      />
                    </div>
                  </div>
                </ProductLikeSection>

                <ProductLikeSection title="Wymiary">
                  <div className="grid gap-4 sm:grid-cols-3">
                    {(
                      [
                        ["width", t.width],
                        ["length", t.length],
                        ["height", t.height],
                      ] as const
                    ).map(([field, label]) => (
                      <div key={field}>
                        <label className={productLikeFieldLabelClass}>{label} (cm)</label>
                        <input
                          type="number"
                          className={`${productLikeInputClass} tabular-nums`}
                          value={formData[field] || ""}
                          onChange={(e) =>
                            setFormData({ ...formData, [field]: Number(e.target.value) })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    Obliczona pojemność:{" "}
                    <span className="font-semibold tabular-nums text-slate-900">
                      {computedVolume.toFixed(1)} dm³
                    </span>
                  </p>
                </ProductLikeSection>
              </>
            }
            side={
              <>
                <ProductLikeSection title="Zdjęcie">
                  <CartImageUrlField value={imageUrl} onChange={setImageUrl} />
                </ProductLikeSection>
                <ProductLikeSection title="Grupa">
                  <label className={productLikeFieldLabelClass}>Przypisanie do grupy</label>
                  <select
                    className={productLikeInputClass}
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
                </ProductLikeSection>
                {cartId ? (
                  <ProductLikeSection title="Status">
                    <p className="text-sm font-medium text-slate-800">{(status || "—").toString()}</p>
                    <p className="mt-1 text-xs text-slate-500">Grupa: {groupName}</p>
                  </ProductLikeSection>
                ) : null}
              </>
            }
          />
        );

      case "capacity":
        return (
          <ProductLikeSection title="Konfiguracja pojemności">
            <CapacityModeFields
              mode={capacityMode}
              onModeChange={setCapacityMode}
              maxVolumeDm3={maxVolumeDm3}
              onMaxVolumeChange={setMaxVolumeDm3}
              maxOrders={maxOrders}
              onMaxOrdersChange={setMaxOrders}
              volumePlaceholder={computedVolume.toFixed(1)}
              namePrefix="bulkCapacityMode"
            />
          </ProductLikeSection>
        );

      case "operations":
        return cartId ? (
          <ProductLikeSection title="Aktualne użycie">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500">Tryb pojemności</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{capacityModeLabel(capacityMode)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500">Zajęta objętość</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                  {usedVolume.toFixed(1)} / {(totalVolumeDm3 || computedVolume).toFixed(1)} dm³
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500">Wykorzystanie</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{fillPercent}%</p>
              </div>
            </div>
            <div className="mt-6 max-w-xl">
              <ProgressBar percent={fillPercent} />
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Szczegóły operacji magazynowych (historia ruchów, logi) będą rozszerzane w kolejnych wersjach modułu.
            </p>
          </ProductLikeSection>
        ) : (
          <p className="py-12 text-center text-sm text-slate-500">
            Zapisz wózek, aby zobaczyć bieżące użycie i operacje.
          </p>
        );

      case "relations":
        return (
          <ProductLikeSection title="Powiązane zamówienia">
            <p className="text-sm text-slate-600">
              Przypisane zamówienia i powiązania operacyjne są widoczne na liście wózków po zapisie. Otwórz podgląd
              zamówienia z poziomu karty wózka na liście.
            </p>
          </ProductLikeSection>
        );

      default:
        return null;
    }
  })();

  return (
    <ProductLikePageLayout
      variant="page"
      modeLabel={cartId ? "Wózek standardowy" : "Nowy wózek standardowy"}
      title={title}
      imageUrl={imageUrl}
      imageAlt={formData.name}
      metaChips={[
        ...(cartCode ? [{ label: "Kod", value: cartCode }] : []),
        ...(cartId
          ? [
              { label: "Pojemność", value: `${(totalVolumeDm3 || computedVolume).toFixed(1)} dm³`, variant: "blue" as const },
              { label: "Tryb", value: capacityModeLabel(capacityMode) },
            ]
          : []),
      ]}
      headerActions={
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {t.close}
        </button>
      }
      tabs={BULK_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onSubmit={handleSave}
      saving={loading}
      saveLabel={loading ? t.savingBulk : t.confirm}
    >
      {tabContent}
    </ProductLikePageLayout>
  );
}
