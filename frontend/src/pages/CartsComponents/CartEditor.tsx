import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Grid3X3 } from "lucide-react";

import { ProductLikePageLayout } from "../../components/catalog/ProductLikePageLayout";
import ActivityLogPanel from "../../components/activityLog/ActivityLogPanel";
import { log } from "../../utils/logger";
import api from "../../api/axios";
import { useWarehouse } from "../../context/WarehouseContext";
import { useTranslation } from "../../locales";
import { CapacityStrategy } from "../../types/cartCapacity";
import { CartEditorMetaBar } from "./CartEditorMetaBar";
import { CartRowAddToolbar } from "./CartRowAddToolbar";
import { CartSectionGrid, basketVolume } from "./CartSectionGrid";

type Basket = {
  name: string;
  length: number;
  width: number;
  height: number;
};

type Row = { baskets: Basket[] };

type CartGroup = { id: number; name: string };

const SECTIONS_TAB = [{ id: "sections" as const, label: "Sekcje", icon: Grid3X3 }];

function totalVolume(rows: Row[]): number {
  return rows.reduce((acc, r) => acc + r.baskets.reduce((s, b) => s + basketVolume(b), 0), 0);
}

export default function CartEditor({ cartId, onClose }: { cartId: number | null; onClose: () => void }) {
  const t = useTranslation();
  const { warehouse, setWarehouse } = useWarehouse();

  const [cartName, setCartName] = useState("");
  const [cartCode, setCartCode] = useState("");
  const [cartScanCode, setCartScanCode] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([{ baskets: [] }]);
  const [availableGroups, setAvailableGroups] = useState<CartGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(Boolean(cartId));

  const [addRowRow, setAddRowRow] = useState(1);
  const [addRowCount, setAddRowCount] = useState(2);
  const [addRowLength, setAddRowLength] = useState(40);
  const [addRowWidth, setAddRowWidth] = useState(40);
  const [addRowHeight, setAddRowHeight] = useState(40);

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
  };

  const handleAddLevel = () => {
    setRows([...rows, { baskets: [{ name: "", length: 0, width: 0, height: 0 }] }]);
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
        capacity_strategy: CapacityStrategy.BASKETS,
      };
      if (cartId) payload.code = trimmedCode;
      else if (trimmedCode) payload.code = trimmedCode;

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

  return (
    <ProductLikePageLayout
      variant="page"
      hideTabs
      hideModeLabel
      modeLabel=""
      title={title}
      imageUrl={imageUrl}
      imageAlt={cartName}
      metaChips={[
        ...(cartCode ? [{ label: "Kod", value: cartCode }] : []),
        { label: "Sekcje", value: String(sectionCount), variant: "blue" as const },
        { label: "Pojemność", value: `${vol.toFixed(1)} dm³`, variant: "emerald" as const },
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
      headerPrefix={
        <CartEditorMetaBar
          cartId={cartId}
          cartName={cartName}
          cartCode={cartCode}
          cartScanCode={cartScanCode}
          imageUrl={imageUrl}
          groupId={groupId}
          availableGroups={availableGroups}
          sectionCount={sectionCount}
          totalVolumeDm3={vol}
          onNameChange={setCartName}
          onCodeChange={setCartCode}
          onImageChange={setImageUrl}
          onGroupChange={setGroupId}
          nameLabel={t.name}
          namePlaceholder={t.cartNamePlaceholder}
          unassignedLabel={t.unassigned}
        />
      }
      tabs={SECTIONS_TAB}
      activeTab="sections"
      onTabChange={() => {}}
      onSubmit={handleSave}
      saving={loading}
      saveDisabled={!isFormValid()}
      saveLabel={loading ? t.saving : !isFormValid() ? t.completeData : t.saveProject}
    >
      {initLoading ? (
        <p className="py-12 text-center text-slate-500">Ładowanie wózka…</p>
      ) : (
        <div className="space-y-6">
          <CartRowAddToolbar
            rowNumber={addRowRow}
            basketCount={addRowCount}
            length={addRowLength}
            width={addRowWidth}
            height={addRowHeight}
            onRowNumberChange={setAddRowRow}
            onBasketCountChange={setAddRowCount}
            onLengthChange={setAddRowLength}
            onWidthChange={setAddRowWidth}
            onHeightChange={setAddRowHeight}
            onAddRow={handleAddRow}
            rowNumberLabel={t.rowNumber}
            basketsInRowLabel={t.basketsInRow}
            lengthLabel={t.length}
            widthLabel={t.width}
            heightLabel={t.height}
            addRowButtonLabel={t.addRowFullButton}
          />

          <CartSectionGrid
            rows={rows}
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
            addLevelLabel={t.addNewLevel}
          />

          {cartId ? <ActivityLogPanel objectType="cart" objectId={cartId} /> : null}
        </div>
      )}
    </ProductLikePageLayout>
  );
}
