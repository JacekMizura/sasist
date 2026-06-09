import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Grid3X3, Layers, Link2, Package } from "lucide-react";

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
import { CartSectionGrid, basketVolume } from "./CartSectionGrid";

type Basket = {
  name: string;
  length: number;
  width: number;
  height: number;
};

type Row = { baskets: Basket[] };

type CartGroup = { id: number; name: string };

type MultiCartTab = "basic" | "sections" | "capacity" | "relations";

const MULTI_TABS = [
  { id: "basic" as const, label: "Podstawowe", icon: Package },
  { id: "sections" as const, label: "Sekcje", icon: Grid3X3 },
  { id: "capacity" as const, label: "Pojemność", icon: Layers },
  { id: "relations" as const, label: "Powiązania", icon: Link2 },
];

function totalVolume(rows: Row[]): number {
  return rows.reduce((acc, r) => acc + r.baskets.reduce((s, b) => s + basketVolume(b), 0), 0);
}

export default function CartEditor({ cartId, onClose }: { cartId: number | null; onClose: () => void }) {
  const t = useTranslation();
  const { warehouse, setWarehouse } = useWarehouse();

  const [activeTab, setActiveTab] = useState<MultiCartTab>("basic");
  const [cartName, setCartName] = useState("");
  const [cartCode, setCartCode] = useState("");
  const [cartScanCode, setCartScanCode] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([{ baskets: [] }]);
  const [availableGroups, setAvailableGroups] = useState<CartGroup[]>([]);
  const [selectedBasket, setSelectedBasket] = useState<{ r: number; b: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(Boolean(cartId));

  const [addRowRow, setAddRowRow] = useState(1);
  const [addRowCount, setAddRowCount] = useState(2);
  const [addRowLength, setAddRowLength] = useState(40);
  const [addRowWidth, setAddRowWidth] = useState(40);
  const [addRowHeight, setAddRowHeight] = useState(40);

  const [capacityMode, setCapacityMode] = useState<CapacityMode>("volume");
  const [maxOrders, setMaxOrders] = useState<number | "">("");
  const [maxVolumeDm3, setMaxVolumeDm3] = useState<number | "">("");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setInitLoading(Boolean(cartId));
      try {
        const [resWarehouses, resGroups] = await Promise.all([
          api.get("/tenants/1/warehouses/"),
          api.get("/carts/groups/?tenant_id=1&cart_type=MULTI"),
        ]);
        if (cancelled) return;

        const groups: CartGroup[] = (Array.isArray(resGroups.data) ? resGroups.data : []).map(
          (g: { id: number; name?: string }) => ({ id: Number(g.id), name: String(g.name ?? "") })
        );
        setAvailableGroups(groups);

        if (cartId) {
          const resCart = await api.get(`/carts/${cartId}/`);
          if (cancelled) return;

          const data = resCart.data;
          setCartName(data.name ?? "");
          setCartCode(String(data.code ?? data.barcode ?? "").trim());
          const sc =
            data.scan_code != null && String(data.scan_code).trim() !== ""
              ? String(data.scan_code).trim()
              : null;
          setCartScanCode(sc);
          setImageUrl(data.image_url ?? "");

          const rawGroupId = data.group_id;
          setGroupId(
            rawGroupId != null && rawGroupId !== "" && !Number.isNaN(Number(rawGroupId))
              ? Number(rawGroupId)
              : null
          );

          const baskets = data.baskets ?? [];
          const maxRow = baskets.length > 0 ? Math.max(...baskets.map((b: { row: number }) => b.row)) : 1;
          const newRows: Row[] = Array.from({ length: maxRow }, () => ({ baskets: [] }));
          baskets.forEach(
            (b: { row: number; name?: string; length?: number; width?: number; height?: number }) => {
              const rowIndex = b.row - 1;
              if (rowIndex >= 0 && rowIndex < newRows.length) {
                newRows[rowIndex].baskets.push({
                  name: b.name ?? "",
                  length: Number(b.length) || 0,
                  width: Number(b.width) || 0,
                  height: Number(b.height) || 0,
                });
              }
            }
          );
          setRows(newRows);
          setCapacityMode((data.capacity_mode ?? "volume") as CapacityMode);
          setMaxOrders(data.max_orders != null ? data.max_orders : "");
          setMaxVolumeDm3(data.max_volume_dm3 != null ? data.max_volume_dm3 : "");

          if (data.warehouse_id && resWarehouses.data) {
            const wh = resWarehouses.data.find((w: { id: number }) => w.id === data.warehouse_id);
            if (wh) setWarehouse(wh);
          }
        } else {
          setCartScanCode(null);
        }
      } catch (err) {
        if (!cancelled) console.error("CartEditor init error:", err);
      } finally {
        if (!cancelled) setInitLoading(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [cartId, setWarehouse]);

  const isFormValid = useCallback(() => {
    if (!cartName.trim() || !warehouse) return false;
    if (!rows.some((r) => r.baskets.length > 0)) return false;
    return rows.every((row) =>
      row.baskets.every(
        (b) => b.name.trim() !== "" && Number(b.length) > 0 && Number(b.width) > 0 && Number(b.height) > 0
      )
    );
  }, [cartName, warehouse, rows]);

  const handleAddBasket = (rIdx: number) => {
    const next = [...rows];
    next[rIdx].baskets.push({ name: "", length: 0, width: 0, height: 0 });
    setRows(next);
    setSelectedBasket({ r: rIdx, b: next[rIdx].baskets.length - 1 });
  };

  const handleAddLevel = () => {
    const next = [...rows, { baskets: [{ name: "", length: 0, width: 0, height: 0 }] }];
    setRows(next);
    setSelectedBasket({ r: next.length - 1, b: 0 });
  };

  const handleAddRow = () => {
    const rowIdx = Math.max(0, addRowRow - 1);
    const count = Math.max(1, Math.min(20, addRowCount));
    const len = Math.max(1, addRowLength);
    const wid = Math.max(1, addRowWidth);
    const h = Math.max(1, addRowHeight);

    const next = [...rows];
    while (next.length < rowIdx + 1) next.push({ baskets: [] });
    const newBaskets: Basket[] = Array.from({ length: count }, (_, colIdx) => ({
      name: `S-${rowIdx + 1}-${colIdx + 1}`,
      length: len,
      width: wid,
      height: h,
    }));
    next[rowIdx].baskets.push(...newBaskets);
    setRows(next);
    setSelectedBasket({ r: rowIdx, b: next[rowIdx].baskets.length - 1 });
  };

  const updateBasket = (r: number, b: number, patch: Partial<Basket>) => {
    setRows((prev) =>
      prev.map((row, ri) =>
        ri === r
          ? { ...row, baskets: row.baskets.map((bk, bi) => (bi === b ? { ...bk, ...patch } : bk)) }
          : row
      )
    );
  };

  const removeBasket = (r: number, b: number) => {
    setRows((prev) =>
      prev.map((row, ri) =>
        ri === r ? { ...row, baskets: row.baskets.filter((_, bi) => bi !== b) } : row
      )
    );
    setSelectedBasket(null);
  };

  const handleSave = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!isFormValid()) return;
    const trimmedCode = cartCode.trim();
    if (cartId && !trimmedCode) {
      alert("Podaj kod wózka.");
      return;
    }
    setLoading(true);
    try {
      const basketsPayload = rows.flatMap((r, rIdx) =>
        r.baskets.map((b, bIdx) => ({
          name: b.name,
          length: b.length,
          width: b.width,
          height: b.height,
          row: rIdx + 1,
          column: bIdx + 1,
        }))
      );

      const vol = Number(totalVolume(rows).toFixed(2));
      const payload: Record<string, unknown> = {
        name: cartName.trim(),
        warehouse_id: warehouse!.id,
        group_id: groupId,
        image_url: imageUrl.trim() || null,
        baskets: basketsPayload,
        total_volume_dm3: vol,
        capacity_mode: capacityMode,
      };
      if (cartId) payload.code = trimmedCode;
      else if (trimmedCode) payload.code = trimmedCode;

      if (capacityMode === "orders" || capacityMode === "mixed") {
        payload.max_orders = maxOrders === "" ? null : Number(maxOrders);
      }
      if (capacityMode === "volume" || capacityMode === "mixed") {
        payload.max_volume_dm3 = maxVolumeDm3 === "" ? vol : Number(maxVolumeDm3);
      }

      if (cartId) await api.put(`/carts/${cartId}/`, payload);
      else await api.post("/carts/multi/", { ...payload, tenant_id: 1 });

      log("[CartEditor] Save success");
      onClose();
    } catch (err: unknown) {
      console.error("[CartEditor] save error:", err);
      const ax = err as { response?: { status?: number; data?: { detail?: string } } };
      if (ax.response?.status === 409 || ax.response?.status === 422) {
        const d = ax.response.data?.detail;
        alert(typeof d === "string" ? d : t.saveError);
      } else {
        alert(t.saveError);
      }
    } finally {
      setLoading(false);
    }
  };

  const vol = totalVolume(rows);
  const sectionCount = rows.reduce((n, r) => n + r.baskets.length, 0);
  const title = cartName.trim() || (cartId ? t.editMultiCart ?? "Edycja wózka" : t.newMultiCart ?? "Nowy wózek");

  const tabContent = (() => {
    if (initLoading) return <p className="py-12 text-center text-slate-500">Ładowanie wózka…</p>;

    switch (activeTab) {
      case "basic":
        return (
          <WarehouseEntityColumns
            main={
              <ProductLikeSection title="Informacje podstawowe">
                <div className="grid gap-4 sm:grid-cols-2">
                  {cartId ? (
                    <div>
                      <label className={productLikeFieldLabelClass}>Identyfikator</label>
                      <p className="font-mono text-sm tabular-nums text-slate-700">{cartId}</p>
                    </div>
                  ) : null}
                  <div className={cartId ? "sm:col-span-2" : "sm:col-span-2"}>
                    <label className={productLikeFieldLabelClass} htmlFor="multi-cart-code">
                      Kod{cartId ? "" : " (opcjonalnie)"}
                    </label>
                    <input
                      id="multi-cart-code"
                      className={`${productLikeInputClass} font-mono`}
                      value={cartCode}
                      onChange={(e) => setCartCode(e.target.value)}
                      placeholder={cartId ? "" : "Puste = wygeneruj kod"}
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
                      className={`${productLikeInputClass} ${!cartName.trim() ? "border-red-300" : ""}`}
                      value={cartName}
                      onChange={(e) => setCartName(e.target.value)}
                      placeholder={t.cartNamePlaceholder}
                    />
                  </div>
                </div>
              </ProductLikeSection>
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
                <ProductLikeSection title="Podsumowanie">
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Sekcje</dt>
                      <dd className="font-semibold tabular-nums">{sectionCount}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Pojemność</dt>
                      <dd className="font-semibold tabular-nums">{vol.toFixed(1)} dm³</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Tryb</dt>
                      <dd className="font-semibold">{capacityModeLabel(capacityMode)}</dd>
                    </div>
                  </dl>
                </ProductLikeSection>
              </>
            }
          />
        );

      case "sections":
        return (
          <div className="space-y-8">
            <ProductLikeSection title="Tworzenie całego rzędu">
              <div className="grid gap-4 sm:grid-cols-5">
                <div>
                  <label className={productLikeFieldLabelClass}>{t.rowNumber}</label>
                  <input
                    type="number"
                    min={1}
                    className={productLikeInputClass}
                    value={addRowRow}
                    onChange={(e) => setAddRowRow(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <div>
                  <label className={productLikeFieldLabelClass}>{t.basketsInRow}</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    className={productLikeInputClass}
                    value={addRowCount}
                    onChange={(e) => setAddRowCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  />
                </div>
                <div>
                  <label className={productLikeFieldLabelClass}>{t.length} (cm)</label>
                  <input
                    type="number"
                    min={1}
                    className={productLikeInputClass}
                    value={addRowLength}
                    onChange={(e) => setAddRowLength(Math.max(1, Number(e.target.value) || 0))}
                  />
                </div>
                <div>
                  <label className={productLikeFieldLabelClass}>{t.width} (cm)</label>
                  <input
                    type="number"
                    min={1}
                    className={productLikeInputClass}
                    value={addRowWidth}
                    onChange={(e) => setAddRowWidth(Math.max(1, Number(e.target.value) || 0))}
                  />
                </div>
                <div>
                  <label className={productLikeFieldLabelClass}>{t.height} (cm)</label>
                  <input
                    type="number"
                    min={1}
                    className={productLikeInputClass}
                    value={addRowHeight}
                    onChange={(e) => setAddRowHeight(Math.max(1, Number(e.target.value) || 0))}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddRow}
                className="mt-4 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                {t.addRowFullButton}
              </button>
            </ProductLikeSection>

            <CartSectionGrid
              rows={rows}
              selectedBasket={selectedBasket}
              onSelectBasket={setSelectedBasket}
              onAddBasket={handleAddBasket}
              onAddLevel={handleAddLevel}
              onUpdateBasket={updateBasket}
              onRemoveBasket={removeBasket}
              levelLabel={(n) => `${t.level} ${n}`}
              noNameLabel={t.noName}
              sectionNameLabel={t.sectionName}
              sectionNamePlaceholder={t.sectionNamePlaceholder}
              widthLabel={t.widthX?.replace(" (X)", "") ?? t.width}
              lengthLabel={t.lengthY?.replace(" (Y)", "") ?? t.length}
              heightLabel={t.heightZ?.replace(" (Z)", "") ?? t.height}
              removeSectionLabel={t.removeSection}
              selectHint={t.selectElementToEdit}
              addLevelLabel={t.addNewLevel}
            />
          </div>
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
              volumePlaceholder={vol.toFixed(1)}
              namePrefix="multiCapacityMode"
            />
          </ProductLikeSection>
        );

      case "relations":
        return (
          <ProductLikeSection title="Powiązane zamówienia">
            <p className="text-sm text-slate-600">
              Przypisania zamówień do sekcji są widoczne na liście wózków — użyj „Pokaż zawartość”, aby zobaczyć
              bieżące obciążenie i przejść do szczegółów zamówienia.
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
      modeLabel={cartId ? "Wózek sekcyjny" : "Nowy wózek sekcyjny"}
      title={title}
      imageUrl={imageUrl}
      imageAlt={cartName}
      metaChips={[
        ...(cartCode ? [{ label: "Kod", value: cartCode }] : []),
        { label: "Sekcje", value: String(sectionCount), variant: "blue" as const },
        { label: "Pojemność", value: `${vol.toFixed(1)} dm³`, variant: "emerald" as const },
        { label: "Tryb", value: capacityModeLabel(capacityMode) },
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
      tabs={MULTI_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onSubmit={handleSave}
      saving={loading}
      saveDisabled={!isFormValid()}
      saveLabel={
        loading ? t.saving : !isFormValid() ? t.completeData : t.saveProject
      }
    >
      {tabContent}
    </ProductLikePageLayout>
  );
}
