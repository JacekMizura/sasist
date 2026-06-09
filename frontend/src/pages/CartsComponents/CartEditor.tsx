import { useEffect, useLayoutEffect, useState, useCallback, useRef } from "react";
import { log } from "../../utils/logger";
import api from "../../api/axios";
import { useWarehouse } from "../../context/WarehouseContext";
import { useTranslation } from "../../locales";
import CartImageUrlField from "./ui/CartImageUrlField";
import {
  cartsAppInputClass,
  cartsBtnApply,
  cartsBtnGhost,
  cartsBtnSecondary,
  cartsDangerBtnClass,
  cartsEditorBasketBaseClass,
  cartsEditorBasketDefaultClass,
  cartsEditorBasketInvalidClass,
  cartsEditorBasketSelectedClass,
  cartsEditorGridClass,
  cartsEditorLevelRowClass,
  cartsFieldLabelClass,
  cartsPageShellClass,
  cartsSectionClass,
  cartsSectionTitleClass,
  cartsSelectClass,
} from "../../modules/carts/cartsModuleTokens";

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
    <div className={`${cartsPageShellClass} grid grid-cols-12 items-start gap-4 pb-8`}>
      <div className="col-span-12 space-y-4 lg:col-span-9">
        <div className={`${cartsSectionClass} grid grid-cols-1 gap-3 sm:grid-cols-2`}>
          {cartId ? (
            <div className="sm:col-span-2">
              <span className={cartsFieldLabelClass}>ID</span>
              <p className="font-mono text-[13px] font-medium tabular-nums text-slate-700">{cartId}</p>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <label className={cartsFieldLabelClass} htmlFor="cart-editor-code">
              Kod{cartId ? "" : " (opcjonalnie)"}
            </label>
            <input
              id="cart-editor-code"
              className={`${cartsAppInputClass} font-mono`}
              value={cartCode}
              onChange={(e) => setCartCode(e.target.value)}
              placeholder={cartId ? "" : "Puste = wygeneruj CART-0001"}
              autoComplete="off"
            />
          </div>
          {cartId && cartScanCode ? (
            <div className="sm:col-span-2">
              <span className={cartsFieldLabelClass}>Kod skanowania WMS</span>
              <p className="font-mono text-[13px] font-medium text-slate-700">{cartScanCode}</p>
            </div>
          ) : null}
        </div>

        <div className={`${cartsSectionClass} flex flex-wrap items-center justify-between gap-3`}>
          <button type="button" onClick={onClose} className={cartsBtnGhost}>
            ← {t.back}
          </button>
          <div className="min-w-0 flex-1 px-2">
            <label className={cartsFieldLabelClass}>{t.name}</label>
            <input
              className={`${cartsAppInputClass} text-center font-semibold uppercase ${!cartName.trim() ? "border-red-300" : ""}`}
              value={cartName}
              onChange={(e) => setCartName(e.target.value)}
              placeholder={t.cartNamePlaceholder}
            />
          </div>
          <div className="text-right">
            <span className={cartsFieldLabelClass}>{t.capacity}</span>
            <div className="text-lg font-bold tabular-nums text-slate-900">
              {totalVolume(rows).toFixed(1)} <span className="text-[11px] font-medium text-slate-500">dm³</span>
            </div>
          </div>
        </div>

        <div className={cartsSectionClass}>
          <h3 className={cartsSectionTitleClass}>Capacity mode</h3>
          <div className="mt-2 flex flex-wrap gap-4">
            {(["volume", "orders", "mixed"] as const).map((mode) => (
              <label key={mode} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="capacityMode"
                  checked={capacityMode === mode}
                  onChange={() => setCapacityMode(mode)}
                  className="h-3.5 w-3.5 text-slate-800"
                />
                <span className="text-[13px] font-medium capitalize text-slate-800">{mode}</span>
              </label>
            ))}
          </div>
          {(capacityMode === "volume" || capacityMode === "mixed") && (
            <div className="mt-3 max-w-xs">
              <label className={cartsFieldLabelClass}>max_volume_dm3</label>
              <input
                type="number"
                min={0}
                step={0.1}
                className={cartsAppInputClass}
                value={maxVolumeDm3 === "" ? "" : maxVolumeDm3}
                onChange={(e) => setMaxVolumeDm3(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder={String(totalVolume(rows).toFixed(1))}
              />
            </div>
          )}
          {(capacityMode === "orders" || capacityMode === "mixed") && (
            <div className="mt-3 max-w-xs">
              <label className={cartsFieldLabelClass}>max_orders</label>
              <input
                type="number"
                min={1}
                className={cartsAppInputClass}
                value={maxOrders === "" ? "" : maxOrders}
                onChange={(e) => setMaxOrders(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="np. 10"
              />
            </div>
          )}
        </div>

        <div className={cartsSectionClass}>
          <h3 className={cartsSectionTitleClass}>{t.bulkRowSectionTitle}</h3>
          <div className="mt-2 grid grid-cols-2 items-end gap-3 sm:grid-cols-5">
            <div>
              <label className={cartsFieldLabelClass}>{t.rowNumber}</label>
              <input
                type="number"
                min={1}
                className={`${cartsAppInputClass} no-number-spinner`}
                value={addRowRow}
                onChange={(e) => setAddRowRow(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div>
              <label className={cartsFieldLabelClass}>{t.basketsInRow}</label>
              <input
                type="number"
                min={1}
                max={20}
                className={`${cartsAppInputClass} no-number-spinner`}
                value={addRowCount}
                onChange={(e) => setAddRowCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              />
            </div>
            <div>
              <label className={cartsFieldLabelClass}>{t.length}</label>
              <input
                type="number"
                min={1}
                className={`${cartsAppInputClass} no-number-spinner`}
                value={addRowLength}
                onChange={(e) => setAddRowLength(Math.max(1, Number(e.target.value) || 0))}
              />
            </div>
            <div>
              <label className={cartsFieldLabelClass}>{t.width}</label>
              <input
                type="number"
                min={1}
                className={`${cartsAppInputClass} no-number-spinner`}
                value={addRowWidth}
                onChange={(e) => setAddRowWidth(Math.max(1, Number(e.target.value) || 0))}
              />
            </div>
            <div>
              <label className={cartsFieldLabelClass}>{t.height}</label>
              <input
                type="number"
                min={1}
                className={`${cartsAppInputClass} no-number-spinner`}
                value={addRowHeight}
                onChange={(e) => setAddRowHeight(Math.max(1, Number(e.target.value) || 0))}
              />
            </div>
          </div>
          <button type="button" onClick={handleAddRow} className={`${cartsBtnSecondary} mt-3 w-full`}>
            {t.addRowFullButton}
          </button>
        </div>

        <div ref={rowContainerRef} className={cartsEditorGridClass}>
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
              className={`${cartsEditorLevelRowClass} relative min-w-max`}
            >
              <div className="absolute -left-2 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
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
                      className={`${cartsEditorBasketBaseClass} ${
                        isSelected
                          ? cartsEditorBasketSelectedClass
                          : isInvalid
                            ? cartsEditorBasketInvalidClass
                            : cartsEditorBasketDefaultClass
                      }`}
                      style={{
                        width: `${finalWidth}px`,
                        height: `${BASKET_HEIGHT}px`,
                      }}
                    >
                      <span className="max-w-full truncate rounded px-1.5 py-0.5 text-[12px] font-semibold">
                        {b.name || t.noName}
                      </span>
                      <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-700">
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
                type="button"
                onClick={() => handleAddBasket(rIdx)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-lg font-medium text-slate-500 hover:border-slate-400 hover:text-slate-800"
              >
                +
              </button>
            </div>
            );
          });
          })()}
          <button
            type="button"
            onClick={handleAddLevel}
            className="rounded-md border border-dashed border-slate-300 py-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500 transition hover:border-slate-400 hover:bg-white"
          >
            + {t.addNewLevel}
          </button>
        </div>
      </div>

      <div className="col-span-12 space-y-3 lg:col-span-3 lg:sticky lg:top-4">
        <div className={cartsSectionClass}>
          <h3 className={`${cartsSectionTitleClass} text-center`}>{t.membership}</h3>
          <div className="mt-2">
            <label className={cartsFieldLabelClass}>{t.group}</label>
            <select className={cartsSelectClass} value={groupSelectValue} onChange={onGroupChange}>
              <option value="">{t.unassigned}</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={String(g.id)}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={cartsSectionClass}>
          <h3 className={`${cartsSectionTitleClass} text-center`}>{t.photo}</h3>
          <div className="mt-2">
            <CartImageUrlField value={imageUrl} onChange={setImageUrl} />
          </div>
        </div>

        <div className={cartsSectionClass}>
          <h3 className={`${cartsSectionTitleClass} text-center`}>{t.editSection}</h3>
          {selectedBasket ? (
            <div className="mt-2 space-y-3">
              <div>
                <label className={cartsFieldLabelClass}>{t.sectionName}</label>
                <input
                  className={`${cartsAppInputClass} uppercase ${!rows[selectedBasket.r].baskets[selectedBasket.b].name ? "border-red-300" : ""}`}
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
                  placeholder={t.sectionNamePlaceholder}
                />
              </div>
              {(["width", "length", "height"] as const).map((f) => (
                <div key={f}>
                  <label className={cartsFieldLabelClass}>
                    {f === "width" ? t.widthX : f === "length" ? t.lengthY : t.heightZ}
                  </label>
                  <input
                    type="number"
                    className={`${cartsAppInputClass} no-number-spinner ${Number(rows[selectedBasket.r].baskets[selectedBasket.b][f]) <= 0 ? "border-red-300" : ""}`}
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
                </div>
              ))}
              <button
                type="button"
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
                className={`${cartsDangerBtnClass} w-full`}
              >
                {t.removeSection}
              </button>
            </div>
          ) : (
            <div className="py-8 text-center text-[12px] font-medium text-slate-400">{t.selectElementToEdit}</div>
          )}
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || !isFormValid()}
            className={`${cartsBtnApply} w-full disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {loading ? t.saving : !isFormValid() ? t.completeData : t.saveProject}
          </button>
          <button type="button" onClick={onClose} className={`${cartsBtnGhost} w-full`}>
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
