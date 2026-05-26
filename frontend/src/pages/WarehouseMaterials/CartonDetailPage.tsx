import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createCarton,
  deleteCarton,
  getCarton,
  updateCarton,
  type CartonDto,
  type CartonWritePayload,
  type PriceTierDto,
} from "../../api/cartonsApi";
import api from "../../api/axios";
import { listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import { listManufacturers, type ManufacturerRead } from "../../api/manufacturersApi";
import { getShippingMethods, type ShippingMethodDto } from "../../api/shippingMethodsApi";
import type { MagazynInvRowDisplay } from "../../components/products/MagazynInventoryLine";
import {
  ProductWarehouseStockPanel,
  productWarehouseFieldLabel,
  productWarehouseInputClass,
} from "../../components/products/ProductWarehouseStockPanel";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  normalizeWmMoneyInputString,
  numberToEditableMoneyString,
  parseMoneyToOptionalRounded,
  parseOptionalPositiveQuantity,
} from "../../modules/warehouseMaterials/warehouseMaterialsMoney";
import { ShippingMethodLogo } from "../../components/shipping/ShippingMethodLogo";
import PriceTiersPanel, { tiersFromDto, tiersToPayload, type TierDraft } from "./PriceTiersPanel";

const PAGE_BG = "#f4f7f9";

const TABS = [
  { id: "basic", label: "Dane podstawowe" },
  { id: "supplier", label: "Dostawca" },
  { id: "warehouse", label: "Magazyn" },
  { id: "costs", label: "Koszty" },
  { id: "pricing", label: "Cennik progowy" },
  { id: "bdo", label: "BDO" },
  { id: "shipping", label: "Metody dostawy" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function IconBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function fieldCls() {
  return "w-full border-2 border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-slate-800";
}

function apiErrorDetailMessage(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err) || err.response?.data == null || typeof err.response.data !== "object") {
    return fallback;
  }
  const detail = (err.response.data as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const parts = detail
      .map((row) => {
        if (row && typeof row === "object" && "msg" in row && typeof (row as { msg: unknown }).msg === "string") {
          return ((row as { msg: string }).msg || "").trim();
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join(" ");
  }
  return fallback;
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export default function CartonDetailPage() {
  const { cartonId } = useParams<{ cartonId: string }>();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const isNew = cartonId === "new";

  const [tab, setTab] = useState<TabId>("basic");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierRead[]>([]);
  const [manufacturers, setManufacturers] = useState<ManufacturerRead[]>([]);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethodDto[]>([]);

  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [sku, setSku] = useState("");
  const [eanStr, setEanStr] = useState("");
  const [l, setL] = useState("");
  const [w, setW] = useState("");
  const [h, setH] = useState("");
  const [weight, setWeight] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [supplierId, setSupplierId] = useState<string>("");
  const [producerId, setProducerId] = useState<string>("");
  const [supplierNameOverride, setSupplierNameOverride] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [moqStr, setMoqStr] = useState("");
  const [purchasePackQtyStr, setPurchasePackQtyStr] = useState("");
  const [freeShipNetStr, setFreeShipNetStr] = useState("");
  const [lastPurchaseNetStr, setLastPurchaseNetStr] = useState("");
  const [supplierSku, setSupplierSku] = useState("");
  const [stock, setStock] = useState("0");
  const [reservedQty, setReservedQty] = useState("0");
  const [locationLabel, setLocationLabel] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [selectedSm, setSelectedSm] = useState<Set<string>>(() => new Set());
  const [materialType, setMaterialType] = useState("");
  const [vatRatePct, setVatRatePct] = useState("23");
  const [packageQty, setPackageQty] = useState("");
  const [packageNet, setPackageNet] = useState("");
  const [packageGross, setPackageGross] = useState("");
  const [tierDrafts, setTierDrafts] = useState<TierDraft[]>(() => tiersFromDto([]));
  const [tierSummary, setTierSummary] = useState<PriceTierDto[]>([]);
  const [lowStockThr, setLowStockThr] = useState("");
  const [reorderQty, setReorderQty] = useState("");
  const [includeInBdo, setIncludeInBdo] = useState(false);
  const [plasticKg, setPlasticKg] = useState("0");
  const [paperKg, setPaperKg] = useState("");
  const [woodKg, setWoodKg] = useState("0");
  const [glassKg, setGlassKg] = useState("0");
  const [metalKg, setMetalKg] = useState("0");
  const [packagingTypeBdo, setPackagingTypeBdo] = useState("");

  const applyDto = useCallback((r: CartonDto) => {
    setName(r.name);
    setImageUrl(r.image_url ?? null);
    setSku(r.sku ?? "");
    setEanStr(r.ean ?? "");
    setL(String(r.length_cm));
    setW(String(r.width_cm));
    setH(String(r.height_cm));
    setWeight(String(r.weight_kg));
    setIsActive(r.is_active);
    setSupplierId(r.supplier_id != null ? String(r.supplier_id) : "");
    setProducerId(r.producer_id != null ? String(r.producer_id) : "");
    setSupplierNameOverride(r.supplier_name_override ?? "");
    setLeadTimeDays(r.lead_time_days != null ? String(r.lead_time_days) : "");
    setMoqStr(r.moq != null ? numberToEditableMoneyString(Number(r.moq)) : "");
    setPurchasePackQtyStr(
      r.purchase_pack_qty != null ? numberToEditableMoneyString(Number(r.purchase_pack_qty)) : "",
    );
    setFreeShipNetStr(
      r.free_shipping_threshold_net != null ? numberToEditableMoneyString(Number(r.free_shipping_threshold_net)) : "",
    );
    setLastPurchaseNetStr(
      r.last_purchase_price_net != null ? numberToEditableMoneyString(Number(r.last_purchase_price_net)) : "",
    );
    setSupplierSku(r.supplier_sku ?? "");
    setStock(String(r.stock ?? 0));
    setReservedQty(String(r.reserved_qty ?? 0));
    setLocationLabel(r.location_label ?? "");
    setPurchasePrice(r.purchase_price != null ? numberToEditableMoneyString(Number(r.purchase_price)) : "");
    setUnitCost(r.unit_cost != null ? numberToEditableMoneyString(Number(r.unit_cost)) : "");
    setSelectedSm(new Set(r.shipping_method_ids ?? []));
    setMaterialType(r.material_type ?? "");
    setVatRatePct(String(r.vat_rate_pct ?? 23));
    setPackageQty(r.package_qty != null ? numberToEditableMoneyString(Number(r.package_qty)) : "");
    setPackageNet(r.package_net_total != null ? numberToEditableMoneyString(Number(r.package_net_total)) : "");
    setPackageGross(r.package_gross_total != null ? numberToEditableMoneyString(Number(r.package_gross_total)) : "");
    setTierDrafts(tiersFromDto(r.price_tiers));
    setTierSummary(r.price_tiers ?? []);
    setLowStockThr(r.low_stock_threshold != null ? String(r.low_stock_threshold) : "");
    setReorderQty(r.reorder_qty != null ? String(r.reorder_qty) : "");
    setIncludeInBdo(!!r.include_in_bdo);
    setPlasticKg(String(r.plastic_kg_per_unit ?? 0));
    setPaperKg(r.paper_kg_per_unit != null ? String(r.paper_kg_per_unit) : String(r.weight_kg ?? ""));
    setWoodKg(String(r.wood_kg_per_unit ?? 0));
    setGlassKg(String(r.glass_kg_per_unit ?? 0));
    setMetalKg(String(r.metal_kg_per_unit ?? 0));
    setPackagingTypeBdo(r.packaging_type ?? "");
  }, []);

  const loadRefs = useCallback(async () => {
    if (warehouseId == null) return;
    try {
      const [sup, mfg, sms] = await Promise.all([
        listSuppliers(DAMAGE_TENANT_ID, { status: "all" }),
        listManufacturers({ tenantId: DAMAGE_TENANT_ID, status: "all" }),
        getShippingMethods({ tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId, active_only: false }),
      ]);
      setSuppliers(sup);
      setManufacturers(mfg);
      setShippingMethods(sms);
    } catch {
      setSuppliers([]);
      setManufacturers([]);
      setShippingMethods([]);
    }
  }, [warehouseId]);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    if (warehouseId == null || isNew || !cartonId) return;
    let cancelled = false;
    setLoadErr(null);
    void getCarton(cartonId, { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId })
      .then((r) => {
        if (!cancelled) applyDto(r);
      })
      .catch(() => {
        if (!cancelled) setLoadErr("Nie udało się wczytać kartonu.");
      });
    return () => {
      cancelled = true;
    };
  }, [warehouseId, cartonId, isNew, applyDto]);

  const parseDim = (v: string): number | null => {
    const t = v.trim();
    if (!t) return null;
    const n = parseFloat(t.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  /** Empty → null (caller maps to 0 for create); invalid non-empty → error string. */
  const parseWeightKg = (v: string): { value: number | null; err: string | null } => {
    const t = v.trim();
    if (!t) return { value: null, err: null };
    const n = parseFloat(t.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return { value: null, err: "Nieprawidłowa waga (kg)." };
    return { value: n, err: null };
  };

  const stockNum = useMemo(() => {
    const n = parseFloat(stock.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [stock]);

  const reservedNum = useMemo(() => {
    const n = parseFloat(reservedQty.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [reservedQty]);

  const availableNum = useMemo(() => Math.max(0, stockNum - reservedNum), [stockNum, reservedNum]);

  const physicalStockDisplay = useMemo(() => fmtQty(stockNum), [stockNum]);
  const reservedDisplay = useMemo(() => fmtQty(reservedNum), [reservedNum]);
  const availableDisplay = useMemo(() => fmtQty(availableNum), [availableNum]);

  const cartonInventoryRows = useMemo((): MagazynInvRowDisplay[] => {
    const ll = locationLabel.trim();
    if (!ll) return [];
    return [
      {
        location_id: 0,
        location_code: ll,
        location_type: "pick",
        quantity: stockNum,
        batch: null,
        expiry: null,
        warehouse_id: warehouseId ?? undefined,
        location_uuid: null,
      },
    ];
  }, [locationLabel, stockNum, warehouseId]);

  const buildPayload = useCallback(():
    | { err: string }
    | { err: null; payload: CartonWritePayload } => {
    const ln = parseDim(l);
    const wn = parseDim(w);
    const hn = parseDim(h);
    if (ln == null || wn == null || hn == null) return { err: "Podaj dodatnie wymiary (cm)." };
    const wParsed = parseWeightKg(weight);
    if (wParsed.err) return { err: wParsed.err };
    const weight_kg: number = wParsed.value === null ? 0 : wParsed.value;
    const st = parseFloat(stock.replace(",", "."));
    const stockOk = Number.isFinite(st) && st >= 0 ? st : 0;
    const rq = parseFloat(reservedQty.replace(",", "."));
    const reservedOk = Number.isFinite(rq) && rq >= 0 ? rq : 0;
    if (reservedOk > stockOk) return { err: "Zarezerwowana ilość nie może przekraczać stanu." };
    const sid = supplierId.trim() ? parseInt(supplierId, 10) : null;
    const supplier_id = sid != null && Number.isFinite(sid) ? sid : null;
    const prid = producerId.trim() ? parseInt(producerId, 10) : null;
    const producer_id = prid != null && Number.isFinite(prid) ? prid : null;
    const ltdRaw = leadTimeDays.trim() ? parseInt(leadTimeDays, 10) : null;
    const lead_time_days =
      ltdRaw != null && Number.isFinite(ltdRaw) && ltdRaw >= 0 ? ltdRaw : null;
    const moqRaw = moqStr.trim() ? parseFloat(moqStr.replace(",", ".")) : null;
    const moq = moqRaw != null && Number.isFinite(moqRaw) && moqRaw >= 0 ? moqRaw : null;
    const purchase_pack_qty = parseOptionalPositiveQuantity(purchasePackQtyStr);
    const free_shipping_threshold_net = parseMoneyToOptionalRounded(freeShipNetStr);
    const last_purchase_price_net = parseMoneyToOptionalRounded(lastPurchaseNetStr);
    const vatN = parseFloat(String(vatRatePct).replace(",", "."));
    const vatOk = Number.isFinite(vatN) && vatN >= 0 && vatN <= 100 ? vatN : 23;
    const pq = parseOptionalPositiveQuantity(packageQty);
    const pNet = parseMoneyToOptionalRounded(packageNet);
    const pGross = parseMoneyToOptionalRounded(packageGross);
    const low = lowStockThr.trim() ? parseFloat(lowStockThr.replace(",", ".")) : null;
    const reo = reorderQty.trim() ? parseFloat(reorderQty.replace(",", ".")) : null;
    const pl = parseFloat(String(plasticKg).replace(",", "."));
    const pap = paperKg.trim() ? parseFloat(paperKg.replace(",", ".")) : null;
    const wo = parseFloat(String(woodKg).replace(",", "."));
    const gl = parseFloat(String(glassKg).replace(",", "."));
    const me = parseFloat(String(metalKg).replace(",", "."));
    const payload: CartonWritePayload = {
      name: name.trim(),
      image_url: imageUrl?.trim() || null,
      sku: sku.trim() ? sku.trim() : null,
      ean: eanStr.trim() || null,
      material_type: materialType.trim() || null,
      length_cm: Number(ln),
      width_cm: Number(wn),
      height_cm: Number(hn),
      weight_kg: Number(weight_kg),
      is_active: isActive,
      supplier_id,
      producer_id,
      supplier_name_override: supplierNameOverride.trim() || null,
      lead_time_days,
      moq,
      purchase_pack_qty,
      free_shipping_threshold_net,
      last_purchase_price_net,
      supplier_sku: supplierSku.trim() || null,
      stock: stockOk,
      reserved_qty: reservedOk,
      location_label: locationLabel.trim() || null,
      purchase_price: parseMoneyToOptionalRounded(purchasePrice),
      unit_cost: parseMoneyToOptionalRounded(unitCost),
      shipping_method_ids: [...selectedSm],
      vat_rate_pct: vatOk,
      package_qty: pq,
      package_net_total: pNet,
      package_gross_total: pGross,
      low_stock_threshold: low != null && Number.isFinite(low) && low >= 0 ? low : null,
      reorder_qty: reo != null && Number.isFinite(reo) && reo >= 0 ? reo : null,
      price_tiers: tiersToPayload(tierDrafts),
      include_in_bdo: includeInBdo,
      plastic_kg_per_unit: Number.isFinite(pl) && pl >= 0 ? pl : 0,
      paper_kg_per_unit: pap != null && Number.isFinite(pap) && pap >= 0 ? pap : null,
      wood_kg_per_unit: Number.isFinite(wo) && wo >= 0 ? wo : 0,
      glass_kg_per_unit: Number.isFinite(gl) && gl >= 0 ? gl : 0,
      metal_kg_per_unit: Number.isFinite(me) && me >= 0 ? me : 0,
      packaging_type: packagingTypeBdo.trim() || null,
    };
    return { err: null as null, payload };
  }, [
    name,
    imageUrl,
    sku,
    eanStr,
    materialType,
    l,
    w,
    h,
    weight,
    isActive,
    supplierId,
    producerId,
    supplierNameOverride,
    leadTimeDays,
    moqStr,
    purchasePackQtyStr,
    freeShipNetStr,
    lastPurchaseNetStr,
    supplierSku,
    stock,
    reservedQty,
    locationLabel,
    purchasePrice,
    unitCost,
    selectedSm,
    vatRatePct,
    packageQty,
    packageNet,
    packageGross,
    tierDrafts,
    lowStockThr,
    reorderQty,
    includeInBdo,
    plasticKg,
    paperKg,
    woodKg,
    glassKg,
    metalKg,
    packagingTypeBdo,
  ]);

  const onLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || warehouseId == null) return;
    setUploadBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await api.post<{ url: string }>("/uploads", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const url = res.data?.url?.trim();
      if (url) setImageUrl(url);
    } catch {
      setLoadErr("Nie udało się wgrać zdjęcia.");
    } finally {
      setUploadBusy(false);
    }
  };

  const handleSave = async () => {
    if (warehouseId == null) return;
    const nm = name.trim();
    if (!nm) {
      setLoadErr("Podaj nazwę.");
      setTab("basic");
      return;
    }
    const built = buildPayload();
    if (!("payload" in built)) {
      setLoadErr(built.err);
      setTab("basic");
      return;
    }
    const { payload } = built;
    setSaving(true);
    setLoadErr(null);
    try {
      if (isNew) {
        const createBody = {
          tenant_id: DAMAGE_TENANT_ID,
          warehouse_id: warehouseId,
          ...payload,
        };
        const created = await createCarton(createBody);
        navigate(`/warehouse-materials/cartons/${created.id}`, { replace: true });
      } else if (cartonId) {
        const updateBody = payload;
        await updateCarton(cartonId, { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId }, updateBody);
        const r = await getCarton(cartonId, { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId });
        applyDto(r);
      } else {
        setLoadErr("Brak identyfikatora kartonu — odśwież stronę.");
        console.error("[carton save] neither create nor update branch", { isNew, cartonId });
      }
    } catch (e) {
      setLoadErr(apiErrorDetailMessage(e, "Nie udało się zapisać."));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (warehouseId == null || isNew || !cartonId) return;
    if (!window.confirm("Usunąć ten karton?")) return;
    try {
      await deleteCarton(cartonId, { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId });
      navigate("/warehouse-materials/cartons");
    } catch (e) {
      setLoadErr(apiErrorDetailMessage(e, "Nie udało się usunąć."));
    }
  };

  const toggleSm = (id: string) => {
    setSelectedSm((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const title = useMemo(() => {
    if (isNew) return "Nowy karton";
    return name.trim() || "Karton";
  }, [isNew, name]);

  const warehouseEditorSlot = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className={productWarehouseFieldLabel}>Stan (edycja)</label>
        <input
          className={productWarehouseInputClass}
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          inputMode="decimal"
        />
      </div>
      <div>
        <label className={productWarehouseFieldLabel}>Zarezerwowano (edycja)</label>
        <input
          className={productWarehouseInputClass}
          value={reservedQty}
          onChange={(e) => setReservedQty(e.target.value)}
          inputMode="decimal"
        />
      </div>
      <div className="sm:col-span-2">
        <label className={productWarehouseFieldLabel}>Lokalizacja (etykieta)</label>
        <input
          className={productWarehouseInputClass}
          value={locationLabel}
          onChange={(e) => setLocationLabel(e.target.value)}
          placeholder="np. regał B / strefa opakowań"
        />
      </div>
      <div>
        <label className={productWarehouseFieldLabel}>Próg alertu niskiego stanu (opcjonalnie)</label>
        <input
          className={productWarehouseInputClass}
          value={lowStockThr}
          onChange={(e) => setLowStockThr(e.target.value)}
          inputMode="decimal"
          placeholder="np. 50"
        />
      </div>
      <div>
        <label className={productWarehouseFieldLabel}>Sugerowana ilość uzupełnienia (opcjonalnie)</label>
        <input
          className={productWarehouseInputClass}
          value={reorderQty}
          onChange={(e) => setReorderQty(e.target.value)}
          inputMode="decimal"
          placeholder="np. 200"
        />
      </div>
    </div>
  );

  if (warehouseId == null) {
    return (
      <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
        Wybierz magazyn w pasku u góry.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col" style={{ background: PAGE_BG }}>
      <div className="shrink-0 border-b border-slate-300/90 bg-white px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/warehouse-materials/cartons"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center border-2 border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            aria-label="Wstecz do listy"
          >
            <IconBack />
          </Link>
          <h1 className="min-w-0 flex-1 text-lg font-extrabold leading-tight text-[#222] sm:text-xl">{title}</h1>
          <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
            {!isNew ? (
              <button
                type="button"
                onClick={() => void onDelete()}
                className="border-2 border-red-400 bg-white px-3 py-2 text-sm font-bold text-red-900 hover:bg-red-50"
              >
                Usuń
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="border-2 border-slate-800 bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Zapisywanie…" : "Zapisz"}
            </button>
          </div>
        </div>
      </div>

      {loadErr ? (
        <div className="mx-3 mt-3 border-2 border-red-400 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 sm:mx-4">
          {loadErr}
        </div>
      ) : null}

      <div className="shrink-0 border-b border-slate-300/80 bg-white">
        <div className="flex min-w-0 gap-0 overflow-x-auto px-1 sm:px-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                "shrink-0 border-b-4 px-3 py-3 text-left text-xs font-extrabold uppercase tracking-wide sm:px-4 sm:text-sm",
                tab === t.id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4 sm:py-6">
        {tab === "basic" ? (
          <div className="w-full space-y-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <div className="shrink-0 lg:w-[220px]">
                <div className="aspect-square w-full max-w-[220px] overflow-hidden border-2 border-slate-300 bg-slate-50">
                  {imageUrl?.trim() ? (
                    <img src={imageUrl.trim()} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-400">Brak zdjęcia</div>
                  )}
                </div>
                <label className="mt-2 inline-flex cursor-pointer border-2 border-slate-400 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50">
                  {uploadBusy ? "Wgrywanie…" : "Wybierz zdjęcie"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => void onLogoFile(e)} />
                </label>
                {imageUrl?.trim() ? (
                  <button type="button" className="mt-1 text-xs font-bold text-red-800 hover:underline" onClick={() => setImageUrl(null)}>
                    Usuń zdjęcie
                  </button>
                ) : null}
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <label className={productWarehouseFieldLabel}>Nazwa</label>
                  <input className={productWarehouseInputClass} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className={productWarehouseFieldLabel}>SKU</label>
                  <input className={productWarehouseInputClass} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Symbol / SKU" />
                </div>
                <div>
                  <label className={productWarehouseFieldLabel}>Rodzaj materiału (kategoria)</label>
                  <input
                    className={productWarehouseInputClass}
                    value={materialType}
                    onChange={(e) => setMaterialType(e.target.value)}
                    placeholder="np. tektura falista, karton 3w"
                  />
                </div>
                <div>
                  <label className={productWarehouseFieldLabel}>Kod kreskowy (EAN)</label>
                  <input className={productWarehouseInputClass} value={eanStr} onChange={(e) => setEanStr(e.target.value)} placeholder="EAN" />
                </div>
                <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
                  Aktywny
                </label>
              </div>
            </div>
            <div className="border-t border-slate-200 pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Wymiary i waga</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Długość (cm)</span>
                  <input className={`mt-1 ${fieldCls()}`} value={l} onChange={(e) => setL(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Szerokość (cm)</span>
                  <input className={`mt-1 ${fieldCls()}`} value={w} onChange={(e) => setW(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Wysokość (cm)</span>
                  <input className={`mt-1 ${fieldCls()}`} value={h} onChange={(e) => setH(e.target.value)} inputMode="decimal" />
                </label>
              </div>
              <label className="mt-3 block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Waga (kg)</span>
                <input className={`mt-1 ${fieldCls()}`} value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" />
              </label>
            </div>
          </div>
        ) : null}

        {tab === "supplier" ? (
          <div className="w-full space-y-4">
            {!supplierId.trim() ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950">
                Brak dostawcy — materiał nie pojawi się w zamówieniach.
              </div>
            ) : null}
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Główny dostawca</span>
              <select className={`mt-1 ${fieldCls()}`} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— brak —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Producent / marka (opcjonalnie)</span>
              <select className={`mt-1 ${fieldCls()}`} value={producerId} onChange={(e) => setProducerId(e.target.value)}>
                <option value="">— brak —</option>
                {manufacturers.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.name}
                    {!m.active ? " (nieaktywny)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Nazwa u dostawcy (override)</span>
              <input
                className={`mt-1 ${fieldCls()}`}
                value={supplierNameOverride}
                onChange={(e) => setSupplierNameOverride(e.target.value)}
                placeholder="Opcjonalnie — inna nazwa na zamówieniu"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">SKU u dostawcy</span>
              <input className={`mt-1 ${fieldCls()}`} value={supplierSku} onChange={(e) => setSupplierSku(e.target.value)} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">MOQ</span>
                <input className={`mt-1 ${fieldCls()}`} value={moqStr} onChange={(e) => setMoqStr(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Wielopak / karton zbiorczy</span>
                <input
                  className={`mt-1 ${fieldCls()}`}
                  value={purchasePackQtyStr}
                  onChange={(e) => setPurchasePackQtyStr(e.target.value)}
                  onBlur={() => setPurchasePackQtyStr(normalizeWmMoneyInputString(purchasePackQtyStr))}
                  inputMode="decimal"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Darmowa dostawa od kwoty (netto)</span>
                <input
                  className={`mt-1 ${fieldCls()}`}
                  value={freeShipNetStr}
                  onChange={(e) => setFreeShipNetStr(e.target.value)}
                  onBlur={() => setFreeShipNetStr(normalizeWmMoneyInputString(freeShipNetStr))}
                  inputMode="decimal"
                  placeholder="np. 500,00"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Czas realizacji (dni)</span>
                <input className={`mt-1 ${fieldCls()}`} value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} inputMode="numeric" />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Ostatnia cena zakupu netto</span>
                <input
                  className={`mt-1 ${fieldCls()}`}
                  value={lastPurchaseNetStr}
                  onChange={(e) => setLastPurchaseNetStr(e.target.value)}
                  onBlur={() => setLastPurchaseNetStr(normalizeWmMoneyInputString(lastPurchaseNetStr))}
                  inputMode="decimal"
                />
              </label>
            </div>
          </div>
        ) : null}

        {tab === "warehouse" ? (
          <ProductWarehouseStockPanel
            physicalStockDisplay={physicalStockDisplay}
            reservedDisplay={reservedDisplay}
            availableDisplay={availableDisplay}
            inventoryRows={cartonInventoryRows}
            emptyLocationsMessage="Brak przypisanej lokalizacji"
            editorSlot={warehouseEditorSlot}
          />
        ) : null}

        {tab === "costs" ? (
          <div className="w-full space-y-4 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Cena zakupu (netto)</span>
              <input
                className={`mt-1 ${fieldCls()}`}
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                onBlur={() => setPurchasePrice(normalizeWmMoneyInputString(purchasePrice))}
                inputMode="decimal"
                placeholder="np. 12,50"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Koszt jednostkowy</span>
              <input
                className={`mt-1 ${fieldCls()}`}
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                onBlur={() => setUnitCost(normalizeWmMoneyInputString(unitCost))}
                inputMode="decimal"
                placeholder="np. 2,10"
              />
            </label>
          </div>
        ) : null}

        {tab === "pricing" ? (
          <PriceTiersPanel
            vatRatePct={vatRatePct}
            onVatChange={setVatRatePct}
            packageQty={packageQty}
            onPackageQty={setPackageQty}
            packageNet={packageNet}
            onPackageNet={setPackageNet}
            packageGross={packageGross}
            onPackageGross={setPackageGross}
            tiers={tierDrafts}
            onTiersChange={setTierDrafts}
            summaryReadonly={tierSummary}
          />
        ) : null}

        {tab === "bdo" ? (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <input type="checkbox" checked={includeInBdo} onChange={(e) => setIncludeInBdo(e.target.checked)} className="h-4 w-4" />
              Uwzględniaj w module Magazyn → BDO
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Typ opakowania</span>
              <input
                className={`mt-1 ${fieldCls()}`}
                value={packagingTypeBdo}
                onChange={(e) => setPackagingTypeBdo(e.target.value)}
                placeholder="np. karton"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-600">Plastik kg / szt.</span>
                <input className={`mt-1 ${fieldCls()}`} value={plasticKg} onChange={(e) => setPlasticKg(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-600">Papier kg / szt.</span>
                <input
                  className={`mt-1 ${fieldCls()}`}
                  value={paperKg}
                  onChange={(e) => setPaperKg(e.target.value)}
                  inputMode="decimal"
                  placeholder="puste = jak waga kartonu"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-600">Drewno kg / szt.</span>
                <input className={`mt-1 ${fieldCls()}`} value={woodKg} onChange={(e) => setWoodKg(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-600">Szkło kg / szt.</span>
                <input className={`mt-1 ${fieldCls()}`} value={glassKg} onChange={(e) => setGlassKg(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold uppercase text-slate-600">Metal kg / szt.</span>
                <input className={`mt-1 ${fieldCls()}`} value={metalKg} onChange={(e) => setMetalKg(e.target.value)} inputMode="decimal" />
              </label>
            </div>
          </div>
        ) : null}

        {tab === "shipping" ? (
          <div className="w-full">
            <p className="mb-3 text-sm font-semibold text-slate-700">Metody dostawy (wielokrotny wybór)</p>
            <ul className="divide-y divide-slate-200 border-2 border-slate-300 bg-white">
              {shippingMethods.filter((s) => s.is_active).length === 0 ? (
                <li className="px-3 py-4 text-sm text-slate-600">Brak aktywnych metod w magazynie.</li>
              ) : (
                shippingMethods
                  .filter((s) => s.is_active)
                  .map((sm) => {
                    const checked = selectedSm.has(sm.id);
                    return (
                      <li key={sm.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-3 hover:bg-slate-50 sm:px-4 sm:py-3.5">
                          <input type="checkbox" checked={checked} onChange={() => toggleSm(sm.id)} className="h-4 w-4 shrink-0" />
                          <ShippingMethodLogo logoUrl={sm.logo_url} methodName={sm.name} size="md" />
                          <span className="min-w-0 flex-1 font-semibold text-slate-900">{sm.name}</span>
                          <span className="font-mono text-xs text-slate-500">{sm.code}</span>
                        </label>
                      </li>
                    );
                  })
              )}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
