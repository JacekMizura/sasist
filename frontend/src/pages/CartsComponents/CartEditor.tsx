import { useEffect, useLayoutEffect, useState, useCallback, useRef } from "react";
import { log } from "../../utils/logger";
import api from "../../api/axios";
import { useWarehouse } from "../../context/WarehouseContext";
import { useTranslation } from "../../locales";
import CartImageUrlField from "./ui/CartImageUrlField";

// ---------------------------------------------------------------------------
// Typy: koszyk (sekcja), rząd poziomów, grupa, props edytora
// ---------------------------------------------------------------------------

type Basket = {
  name: string;
  length: number;
  width: number;
  height: number;
};

type Row = { baskets: Basket[] };

type CartGroup = { id: number; name: string };

type CartEditorProps = {
  cartId: number | null;
  onClose: () => void;
};

// ---------------------------------------------------------------------------
// Pomocnicze: objętość pojedynczego koszyka i suma po wszystkich poziomach
// ---------------------------------------------------------------------------

function basketVolume(b: Basket): number {
  return (Number(b.length) * Number(b.width) * Number(b.height)) / 1000;
}

function totalVolume(rows: Row[]): number {
  return rows.reduce(
    (acc, r) => acc + r.baskets.reduce((s, b) => s + basketVolume(b), 0),
    0
  );
}

// ---------------------------------------------------------------------------
// Komponent: edytor wózka sekcyjnego (multi) – nagłówek, tworzenie rzędu, poziomy, panel boczny
// ---------------------------------------------------------------------------

export default function CartEditor({ cartId, onClose }: CartEditorProps) {
  const t = useTranslation();
  const { warehouse, setWarehouse } = useWarehouse();

  // Stan formularza: nazwa, zdjęcie, grupa, poziomy z koszykami
  const [cartName, setCartName] = useState("");
  const [cartCode, setCartCode] = useState("");
  /** Wewnętrzny kod WMS (tylko odczyt), np. ESP:brck:7 */
  const [cartScanCode, setCartScanCode] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([{ baskets: [] }]);
  const [availableGroups, setAvailableGroups] = useState<CartGroup[]>([]);
  const [selectedBasket, setSelectedBasket] = useState<{ r: number; b: number } | null>(null);
  const [loading, setLoading] = useState(false);

  // Stan sekcji „Tworzenie całego rzędu”: numer rzędu (1-based), liczba koszyków, wymiary L×W×H
  const [addRowRow, setAddRowRow] = useState(1);
  const [addRowCount, setAddRowCount] = useState(2);
  const [addRowLength, setAddRowLength] = useState(40);
  const [addRowWidth, setAddRowWidth] = useState(40);
  const [addRowHeight, setAddRowHeight] = useState(40);

  const [capacityMode, setCapacityMode] = useState<"volume" | "orders" | "mixed">("volume");
  const [maxOrders, setMaxOrders] = useState<number | "">("");
  const [maxVolumeDm3, setMaxVolumeDm3] = useState<number | "">("");

  const rowContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidthPx, setContainerWidthPx] = useState(900);

  useLayoutEffect(() => {
    const el = rowContainerRef.current;
    if (!el) return;
    const update = () => setContainerWidthPx(el.offsetWidth ?? 900);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // -------------------------------------------------------------------------
  // Initialization: cart details + groups; set groupId from API (cast to Number)
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const [resWarehouses, resGroups] = await Promise.all([
          api.get("/tenants/1/warehouses/"),
          api.get("/carts/groups/?tenant_id=1&cart_type=MULTI"),
        ]);

        if (cancelled) return;

        const groupsRaw = Array.isArray(resGroups.data) ? resGroups.data : [];
        const groups: CartGroup[] = groupsRaw
          .map((g: { id: number; name?: string }) => ({ id: Number(g.id), name: String(g.name ?? "") }));
        setAvailableGroups(groups);

        if (cartId) {
          const resCart = await api.get(`/carts/${cartId}/`);
          if (cancelled) return;

          const data = resCart.data;
          setCartName(data.name ?? "");
          setCartCode(String(data.code ?? data.barcode ?? "").trim());
          const sc = data.scan_code != null && String(data.scan_code).trim() !== "" ? String(data.scan_code).trim() : null;
          setCartScanCode(sc);
          setImageUrl(data.image_url ?? "");

          const rawGroupId = data.group_id;
          const initialGroupId: number | null =
            rawGroupId != null && rawGroupId !== "" && !Number.isNaN(Number(rawGroupId))
              ? Number(rawGroupId)
              : null;
          setGroupId(initialGroupId);

          const baskets = data.baskets ?? [];
          const maxRow =
            baskets.length > 0 ? Math.max(...baskets.map((b: { row: number }) => b.row)) : 1;
          const newRows: Row[] = Array.from({ length: maxRow }, () => ({ baskets: [] }));
          baskets.forEach((b: { row: number; name?: string; length?: number; width?: number; height?: number }) => {
            const rowIndex = b.row - 1;
            if (rowIndex >= 0 && rowIndex < newRows.length) {
              newRows[rowIndex].baskets.push({
                name: b.name ?? "",
                length: Number(b.length) || 0,
                width: Number(b.width) || 0,
                height: Number(b.height) || 0,
              });
            }
          });
          setRows(newRows);

          const capMode = (data.capacity_mode ?? "volume") as "volume" | "orders" | "mixed";
          setCapacityMode(capMode);
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
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [cartId]);

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------
  const isFormValid = useCallback(() => {
    if (!cartName.trim() || !warehouse) return false;
    if (!rows.some((r) => r.baskets.length > 0)) return false;
    return rows.every((row) =>
      row.baskets.every(
        (b) =>
          b.name.trim() !== "" &&
          Number(b.length) > 0 &&
          Number(b.width) > 0 &&
          Number(b.height) > 0
      )
    );
  }, [cartName, warehouse, rows]);

  // -------------------------------------------------------------------------
  // Row/basket actions
  // -------------------------------------------------------------------------
  const handleAddBasket = (rIdx: number) => {
    const next = [...rows];
    const newBasket: Basket = { name: "", length: 0, width: 0, height: 0 };
    next[rIdx].baskets.push(newBasket);
    setRows(next);
    setSelectedBasket({ r: rIdx, b: next[rIdx].baskets.length - 1 });
  };

  const handleAddLevel = () => {
    const next = [...rows, { baskets: [{ name: "", length: 0, width: 0, height: 0 }] }];
    setRows(next);
    setSelectedBasket({ r: next.length - 1, b: 0 });
  };

  /** Add a full row of identical baskets at the given row number (1-based). */
  const handleAddRow = () => {
    const rowIdx = Math.max(0, addRowRow - 1);
    const count = Math.max(1, Math.min(20, addRowCount));
    const len = Math.max(1, addRowLength);
    const wid = Math.max(1, addRowWidth);
    const h = Math.max(1, addRowHeight);

    const next = [...rows];
    while (next.length < rowIdx + 1) {
      next.push({ baskets: [] });
    }
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

  // -------------------------------------------------------------------------
  // Save: flat JSON payload, snake_case group_id
  // -------------------------------------------------------------------------
  const handleSave = async () => {
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
      if (cartId) {
        payload.code = trimmedCode;
      } else if (trimmedCode) {
        payload.code = trimmedCode;
      }
      if (capacityMode === "orders" || capacityMode === "mixed") {
        payload.max_orders = maxOrders === "" ? null : Number(maxOrders);
      }
      if (capacityMode === "volume" || capacityMode === "mixed") {
        payload.max_volume_dm3 = maxVolumeDm3 === "" ? vol : Number(maxVolumeDm3);
      }

      let res;
      if (cartId) {
        res = await api.put(`/carts/${cartId}/`, payload);
      } else {
        res = await api.post("/carts/multi/", { ...payload, tenant_id: 1 });
      }
      log("[CartEditor] Save success", res?.status, res?.data);
      try {
        onClose();
      } catch (e) {
        console.error("[CartEditor] onClose failed:", e);
      }
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

  // -------------------------------------------------------------------------
  // Group dropdown: value is number (as string) or "" for NIEPRZYPISANE; onChange sets Number | null
  // -------------------------------------------------------------------------
  const groupSelectValue = groupId === null ? "" : String(groupId);
  const onGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "") {
      setGroupId(null);
      return;
    }
    const num = Number(val);
    setGroupId(Number.isNaN(num) ? null : num);
  };

  return (
    <div className="grid grid-cols-12 gap-6 items-start pb-20">
      <div className="col-span-12 lg:col-span-9 space-y-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cartId ? (
            <div className="space-y-1 sm:col-span-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ID</span>
              <p className="font-mono text-sm font-bold text-slate-600 tabular-nums">{cartId}</p>
            </div>
          ) : null}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1" htmlFor="cart-editor-code">
              Kod{cartId ? "" : " (opcjonalnie)"}
            </label>
            <input
              id="cart-editor-code"
              className="w-full bg-slate-50 rounded-xl px-4 py-3 font-mono text-sm font-bold text-slate-800 border border-slate-200 outline-none focus:border-blue-500"
              value={cartCode}
              onChange={(e) => setCartCode(e.target.value)}
              placeholder={cartId ? "" : "Puste = wygeneruj CART-0001"}
              autoComplete="off"
            />
          </div>
          {cartId && cartScanCode ? (
            <div className="space-y-1 sm:col-span-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                Kod skanowania WMS
              </span>
              <p className="font-mono text-sm font-semibold text-slate-700">{cartScanCode}</p>
            </div>
          ) : null}
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex justify-between items-center">
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-800 font-black text-xs uppercase flex items-center gap-2"
          >
            ← {t.back.toUpperCase()}
          </button>
          <div className="flex-1 max-w-md mx-4">
            <input
              className={`text-2xl font-black bg-transparent border-b-4 outline-none w-full uppercase text-center transition-all ${!cartName.trim() ? "border-red-200 focus:border-red-500" : "border-slate-50 focus:border-blue-600"}`}
              value={cartName}
              onChange={(e) => setCartName(e.target.value)}
              placeholder={t.cartNamePlaceholder}
            />
          </div>
          <div className="text-right">
            <span className="text-[10px] font-black text-slate-400 uppercase block leading-none mb-1">
              {t.capacity}
            </span>
            <div className="text-3xl font-black text-blue-600 leading-none">
              {totalVolume(rows).toFixed(1)} <span className="text-sm uppercase text-blue-400">dm³</span>
            </div>
          </div>
        </div>

        {/* CAPACITY MODE */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-xs font-black uppercase mb-4 text-slate-400 border-b pb-3 tracking-widest">
            CAPACITY MODE
          </h3>
          <div className="flex flex-wrap gap-4 p-1">
            {(["volume", "orders", "mixed"] as const).map((mode) => (
              <label key={mode} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="capacityMode"
                  checked={capacityMode === mode}
                  onChange={() => setCapacityMode(mode)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm font-bold capitalize">{mode}</span>
              </label>
            ))}
          </div>
          {(capacityMode === "volume" || capacityMode === "mixed") && (
            <div className="mt-4">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block mb-1">max_volume_dm3</label>
              <input
                type="number"
                min={0}
                step={0.1}
                className="w-full max-w-xs bg-slate-50 rounded-xl px-4 py-2 font-bold outline-none border border-slate-200"
                value={maxVolumeDm3 === "" ? "" : maxVolumeDm3}
                onChange={(e) => setMaxVolumeDm3(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder={String(totalVolume(rows).toFixed(1))}
              />
            </div>
          )}
          {(capacityMode === "orders" || capacityMode === "mixed") && (
            <div className="mt-4">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block mb-1">max_orders</label>
              <input
                type="number"
                min={1}
                className="w-full max-w-xs bg-slate-50 rounded-xl px-4 py-2 font-bold outline-none border border-slate-200"
                value={maxOrders === "" ? "" : maxOrders}
                onChange={(e) => setMaxOrders(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="e.g. 10"
              />
            </div>
          )}
        </div>

        {/* Sekcja: Tworzenie całego rzędu – numer rzędu, liczba koszyków, wymiary; przycisk dodaje cały rząd naraz. */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-xs font-black uppercase mb-4 text-slate-400 border-b pb-3 tracking-widest">
            {t.bulkRowSectionTitle}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t.rowNumber}</label>
              <input
                type="number"
                min={1}
                className="w-full bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 font-black text-slate-700 outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={addRowRow}
                onChange={(e) => setAddRowRow(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t.basketsInRow}</label>
              <input
                type="number"
                min={1}
                max={20}
                className="w-full bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 font-black text-slate-700 outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={addRowCount}
                onChange={(e) => setAddRowCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t.length}</label>
              <input
                type="number"
                min={1}
                className="w-full bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 font-black text-slate-700 outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={addRowLength}
                onChange={(e) => setAddRowLength(Math.max(1, Number(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t.width}</label>
              <input
                type="number"
                min={1}
                className="w-full bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 font-black text-slate-700 outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={addRowWidth}
                onChange={(e) => setAddRowWidth(Math.max(1, Number(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t.height}</label>
              <input
                type="number"
                min={1}
                className="w-full bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 font-black text-slate-700 outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={addRowHeight}
                onChange={(e) => setAddRowHeight(Math.max(1, Number(e.target.value) || 0))}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddRow}
            className="mt-4 w-full py-3 rounded-xl font-black text-[11px] uppercase tracking-widest bg-slate-100 text-slate-600 hover:bg-blue-600 hover:text-white border border-slate-200 hover:border-blue-600 transition-all shadow-sm"
          >
            {t.addRowFullButton}
          </button>
        </div>

        {/* Lista poziomów (rzędów) z koszykami – każdy poziom ma etykietę i przycisk + do pojedynczego koszyka. */}
        <div
          ref={rowContainerRef}
          className="bg-slate-200 rounded-[3rem] p-10 flex flex-col-reverse gap-6 border-4 border-slate-300 overflow-auto max-h-[70vh] shadow-inner relative custom-scrollbar"
        >
          {(() => {
            const gapPx = 16;
            const rowPaddingPx = 32;
            const buttonAreaPx = 64;
            const MIN_WIDTH = 90;
            const BASKET_HEIGHT = 90;
            const containerPx = containerWidthPx ?? 900;
            return rows.map((row, rIdx) => {
              const rowTotalWidthCm = row.baskets.reduce((sum, b) => sum + (Number(b.width) || 0), 0);
              const availableWidthPx = Math.max(100, containerPx - rowPaddingPx - (row.baskets.length > 0 ? (row.baskets.length - 1) * gapPx + buttonAreaPx : 0));
              const scale = rowTotalWidthCm > 0 ? availableWidthPx / rowTotalWidthCm : 1;
              return (
            <div
              key={rIdx}
              className="flex gap-4 items-end bg-white/30 p-4 rounded-2xl border border-slate-300/50 relative min-w-max transition-all"
            >
              <div className="absolute -left-12 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-black text-slate-500 uppercase tracking-tighter">
                {t.level} {rIdx + 1}
              </div>
              {row.baskets.map((b, bIdx) => {
                const isSelected = selectedBasket?.r === rIdx && selectedBasket?.b === bIdx;
                const isInvalid =
                  !b.name || b.length <= 0 || b.width <= 0 || b.height <= 0;
                const widthPx = (Number(b.width) || 0) * scale;
                const finalWidth = Math.max(widthPx, MIN_WIDTH);
                const dimensionsText = `${b.width ?? "?"} × ${b.length ?? "?"} × ${b.height ?? "?"}`;
                return (
                  <div key={bIdx} className="flex flex-col items-center shrink-0">
                    <div
                      onClick={() => setSelectedBasket({ r: rIdx, b: bIdx })}
                      className={`cursor-pointer rounded-2xl border-4 flex flex-col items-center justify-center gap-1.5 p-3 transition-all relative shadow-lg shrink-0 text-center ${
                        isSelected
                          ? "bg-orange-500 border-white scale-105 shadow-2xl z-20"
                          : isInvalid
                            ? "bg-red-500 border-red-700 animate-pulse"
                            : "border-white hover:opacity-95"
                      }`}
                      style={{
                        width: `${finalWidth}px`,
                        height: `${BASKET_HEIGHT}px`,
                        ...(!isSelected && !isInvalid && { background: "linear-gradient(180deg, #3568e2 0%, #2c5cd1 100%)" }),
                      }}
                    >
                      <span
                        className="text-sm font-semibold text-white uppercase truncate max-w-full text-center rounded-[10px] py-1 px-2.5 min-w-[48px] inline-block"
                        style={{ background: "rgba(0,0,0,0.15)" }}
                      >
                        {b.name || t.noName}
                      </span>
                      <span
                        className="rounded-full text-xs font-medium text-white py-1 px-2.5 whitespace-nowrap"
                        style={{ background: "rgba(0,0,0,0.2)", fontSize: "12px" }}
                      >
                        {basketVolume(b).toFixed(1)} dm³
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-600 mt-1.5 whitespace-nowrap text-center">
                      {dimensionsText}
                    </span>
                  </div>
                );
              })}
              <button
                onClick={() => handleAddBasket(rIdx)}
                className="w-12 h-12 rounded-2xl bg-white border-2 border-slate-300 text-slate-400 font-black text-2xl hover:text-blue-600 hover:border-blue-600 transition-all shadow-sm flex items-center justify-center shrink-0"
              >
                +
              </button>
            </div>
            );
          });
          })()}
          <button
            onClick={handleAddLevel}
            className="py-6 border-4 border-dashed border-slate-400 rounded-[2rem] text-slate-500 font-black text-xs uppercase hover:bg-slate-300 transition-all tracking-[0.2em] shadow-sm"
          >
            + {t.addNewLevel.toUpperCase()}
          </button>
        </div>
      </div>

      <div className="col-span-12 lg:col-span-3 space-y-4 sticky top-4">
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200">
          <h3 className="text-xs font-black uppercase mb-6 text-slate-400 border-b pb-4 tracking-widest text-center">
            {t.membership}
          </h3>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-2">{t.group}</label>
            <select
              className="w-full bg-slate-50 rounded-2xl px-5 py-4 border border-slate-100 font-black text-slate-700 outline-none transition-all focus:border-blue-500"
              value={groupSelectValue}
              onChange={onGroupChange}
            >
              <option value="">{t.unassigned.toUpperCase()}</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={String(g.id)}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200">
          <h3 className="text-xs font-black uppercase mb-6 text-slate-400 border-b pb-4 tracking-widest text-center">
            {t.photo}
          </h3>
          <CartImageUrlField value={imageUrl} onChange={setImageUrl} />
        </div>

        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200">
          <h3 className="text-xs font-black uppercase mb-6 text-slate-400 border-b pb-4 tracking-widest text-center">
            {t.editSection}
          </h3>
          {selectedBasket ? (
            <div className="space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                  {t.sectionName}
                </label>
                <input
                  className={`w-full bg-slate-50 rounded-2xl px-5 py-4 border font-black text-slate-700 outline-none transition-all uppercase ${!rows[selectedBasket.r].baskets[selectedBasket.b].name ? "border-red-400 bg-red-50" : "border-slate-100 focus:border-blue-500"}`}
                  value={rows[selectedBasket.r].baskets[selectedBasket.b].name}
                  onChange={(e) => {
                    const u = rows.map((row, ri) =>
                      ri === selectedBasket.r
                        ? {
                            ...row,
                            baskets: row.baskets.map((basket, bi) =>
                              bi === selectedBasket.b ? { ...basket, name: e.target.value } : basket
                            ),
                          }
                        : row
                    );
                    setRows(u);
                  }}
                  placeholder={t.sectionNamePlaceholder.toUpperCase()}
                />
              </div>
              {(["width", "length", "height"] as const).map((f) => (
                <div key={f} className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">
                    {f === "width" ? t.widthX : f === "length" ? t.lengthY : t.heightZ}
                  </label>
                  <div
                    className={`flex items-center bg-slate-50 rounded-2xl px-5 py-4 border transition-all ${Number(rows[selectedBasket.r].baskets[selectedBasket.b][f]) <= 0 ? "border-red-400 bg-red-50" : "border-slate-100 focus-within:border-blue-500"}`}
                  >
                    <input
                      type="number"
                      className="bg-transparent font-black text-slate-700 outline-none w-full"
                      value={rows[selectedBasket.r].baskets[selectedBasket.b][f] || ""}
                      onChange={(e) => {
                        const num = Number(e.target.value);
                        const u = rows.map((row, ri) =>
                          ri === selectedBasket.r
                            ? {
                                ...row,
                                baskets: row.baskets.map((basket, bi) =>
                                  bi === selectedBasket.b ? { ...basket, [f]: num } : basket
                                ),
                              }
                            : row
                        );
                        setRows(u);
                      }}
                    />
                    <span className="text-[10px] font-black text-slate-300">CM</span>
                  </div>
                </div>
              ))}
              <div className="pt-2">
                <button
                  onClick={() => {
                    const u = rows.map((row, ri) =>
                      ri === selectedBasket.r
                        ? {
                            ...row,
                            baskets: row.baskets.filter((_, bi) => bi !== selectedBasket.b),
                          }
                        : row
                    );
                    setRows(u);
                    setSelectedBasket(null);
                  }}
                  className="w-full py-3 text-red-500 font-black text-[9px] uppercase hover:bg-red-50 rounded-xl transition-colors"
                >
                  {t.removeSection}
                </button>
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-slate-300 text-[10px] font-black uppercase tracking-widest leading-loose">
              {t.selectElementToEdit}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={handleSave}
            disabled={loading || !isFormValid()}
            className={`w-full py-6 rounded-[2rem] font-black uppercase text-xs tracking-[0.2em] shadow-xl transition-all ${isFormValid() ? "bg-slate-900 text-white hover:bg-blue-600" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
          >
            {loading ? t.saving.toUpperCase() : !isFormValid() ? t.completeData.toUpperCase() : t.saveProject.toUpperCase()}
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 text-slate-400 font-black text-[10px] uppercase hover:text-slate-800 text-center tracking-widest"
          >
            {t.cancel.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
}
