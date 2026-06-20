import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createCarton,
  deleteCarton,
  duplicateCarton,
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
import {
  productLikeFieldLabelClass,
  productLikeInputClass,
  type ProductLikeStatCard,
} from "../../components/catalog";
import type { MagazynInvRowDisplay } from "../../components/products/MagazynInventoryLine";
import {
  ProductWarehouseStockPanel,
  productWarehouseFieldLabel,
  productWarehouseInputClass,
} from "../../components/products/ProductWarehouseStockPanel";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { useWarehouse } from "../../context/WarehouseContext";
import { WmFormSectionCard } from "../../modules/warehouseMaterials/components/WmFormSectionCard";
import { WarehouseMaterialEditLayout } from "../../modules/warehouseMaterials/components/WarehouseMaterialEditLayout";
import { CARTON_EDIT_TABS, type CartonEditTabId } from "../../modules/warehouseMaterials/warehouseMaterialEditTabs";
import { wmApiErrorDetailMessage, wmFmtQty } from "../../modules/warehouseMaterials/warehouseMaterialFormUtils";
import {
  normalizeWmMoneyInputString,
  numberToEditableMoneyString,
  parseMoneyToOptionalRounded,
  parseOptionalPositiveQuantity,
  formatWmMoneyZloty,
} from "../../modules/warehouseMaterials/warehouseMaterialsMoney";
import { ShippingMethodLogo } from "../../components/shipping/ShippingMethodLogo";
import PriceTiersPanel, { tiersFromDto, tiersToPayload, type TierDraft } from "./PriceTiersPanel";

export default function CartonDetailPage() {
  const { cartonId } = useParams<{ cartonId: string }>();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const isNew = cartonId === "new";

  const [activeTab, setActiveTab] = useState<CartonEditTabId>("basic");
  const headerGalleryInputRef = useRef<HTMLInputElement>(null);
  const [dupBusy, setDupBusy] = useState(false);
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

  const physicalStockDisplay = useMemo(() => wmFmtQty(stockNum), [stockNum]);
  const reservedDisplay = useMemo(() => wmFmtQty(reservedNum), [reservedNum]);
  const availableDisplay = useMemo(() => wmFmtQty(availableNum), [availableNum]);

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
      setActiveTab("basic");
      return;
    }
    const built = buildPayload();
    if (!("payload" in built)) {
      setLoadErr(built.err);
      setActiveTab("basic");
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
      setLoadErr(wmApiErrorDetailMessage(e, "Nie udało się zapisać."));
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
      setLoadErr(wmApiErrorDetailMessage(e, "Nie udało się usunąć."));
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

  const onDuplicate = async () => {
    if (warehouseId == null || isNew || !cartonId) return;
    setDupBusy(true);
    setLoadErr(null);
    try {
      const created = await duplicateCarton(cartonId, { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId });
      navigate(`/warehouse-materials/cartons/${created.id}`);
    } catch (e) {
      setLoadErr(wmApiErrorDetailMessage(e, "Nie udało się zduplikować."));
    } finally {
      setDupBusy(false);
    }
  };

  const statCards = useMemo((): ProductLikeStatCard[] => {
    const cards: ProductLikeStatCard[] = [
      { label: "Stan", value: `${wmFmtQty(stockNum)} szt.`, variant: "blue" },
      {
        label: "Wymiary",
        value: `${l.trim() || "—"} × ${w.trim() || "—"} × ${h.trim() || "—"} cm`,
        variant: "slate",
      },
    ];
    const tier0 = tierSummary[0];
    if (tier0?.unit_net != null) {
      cards.push({ label: "Netto / szt.", value: formatWmMoneyZloty(tier0.unit_net), variant: "green" });
    }
    return cards;
  }, [stockNum, l, w, h, tierSummary]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleSave();
  };

  const fieldLabel = productLikeFieldLabelClass;
  const inputClass = productLikeInputClass;

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
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
        Wybierz magazyn w pasku u góry.
      </div>
    );
  }

  return (
    <WarehouseMaterialEditLayout
      isNew={isNew}
      title={title}
      imageUrl={imageUrl}
      sku={sku}
      breadcrumbs={[
        { label: "Asortyment", onClick: () => navigate("/products/list") },
        { label: "Materiały magazynowe", onClick: () => navigate("/warehouse-materials/cartons") },
        { label: isNew ? "Nowy karton" : title },
      ]}
      tabs={CARTON_EDIT_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      saving={saving}
      loadErr={loadErr}
      uploadBusy={uploadBusy}
      headerInputRef={headerGalleryInputRef}
      onImageFile={(e) => void onLogoFile(e)}
      onSubmit={handleSubmit}
      onDelete={!isNew ? () => void onDelete() : undefined}
      onDuplicate={!isNew ? () => void onDuplicate() : undefined}
      duplicateBusy={dupBusy}
      saveLabel={isNew ? "Utwórz karton" : "Zapisz zmiany"}
      statCards={statCards}
    >
      <div className="space-y-5">
        {activeTab === "basic" ? (
          <div className="space-y-5">
            <WmFormSectionCard title="Dane podstawowe" description="Nazwa, identyfikatory i status kartonu.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={fieldLabel}>Nazwa</label>
                  <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className={fieldLabel}>SKU</label>
                  <input className={inputClass} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Symbol / SKU" />
                </div>
                <div>
                  <label className={fieldLabel}>Kod kreskowy (EAN)</label>
                  <input className={inputClass} value={eanStr} onChange={(e) => setEanStr(e.target.value)} placeholder="EAN" />
                </div>
                <div className="sm:col-span-2">
                  <label className={fieldLabel}>Rodzaj materiału (kategoria)</label>
                  <input
                    className={inputClass}
                    value={materialType}
                    onChange={(e) => setMaterialType(e.target.value)}
                    placeholder="np. tektura falista, karton 3w"
                  />
                </div>
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  <span className="text-sm font-medium text-slate-800">Aktywny</span>
                </label>
              </div>
            </WmFormSectionCard>
            <WmFormSectionCard title="Parametry logistyczne" description="Wymiary i waga używane przy pakowaniu.">
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className={fieldLabel}>Długość (cm)</span>
                  <input className={inputClass} value={l} onChange={(e) => setL(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Szerokość (cm)</span>
                  <input className={inputClass} value={w} onChange={(e) => setW(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Wysokość (cm)</span>
                  <input className={inputClass} value={h} onChange={(e) => setH(e.target.value)} inputMode="decimal" />
                </label>
              </div>
              <label className="mt-4 block max-w-xs">
                <span className={fieldLabel}>Waga (kg)</span>
                <input className={inputClass} value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" />
              </label>
            </WmFormSectionCard>
          </div>
        ) : null}

        {activeTab === "supplier" ? (
          <WmFormSectionCard title="Dostawca" description="Dane zakupowe — bez dostawcy pozycja nie trafi do zamówień.">
            <div className="w-full space-y-4">
            {!supplierId.trim() ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950">
                Brak dostawcy — materiał nie pojawi się w zamówieniach.
              </div>
            ) : null}
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Główny dostawca</span>
              <select className={inputClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
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
              <select className={inputClass} value={producerId} onChange={(e) => setProducerId(e.target.value)}>
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
                className={inputClass}
                value={supplierNameOverride}
                onChange={(e) => setSupplierNameOverride(e.target.value)}
                placeholder="Opcjonalnie — inna nazwa na zamówieniu"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">SKU u dostawcy</span>
              <input className={inputClass} value={supplierSku} onChange={(e) => setSupplierSku(e.target.value)} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">MOQ</span>
                <input className={inputClass} value={moqStr} onChange={(e) => setMoqStr(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Wielopak / karton zbiorczy</span>
                <input
                  className={inputClass}
                  value={purchasePackQtyStr}
                  onChange={(e) => setPurchasePackQtyStr(e.target.value)}
                  onBlur={() => setPurchasePackQtyStr(normalizeWmMoneyInputString(purchasePackQtyStr))}
                  inputMode="decimal"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Darmowa dostawa od kwoty (netto)</span>
                <input
                  className={inputClass}
                  value={freeShipNetStr}
                  onChange={(e) => setFreeShipNetStr(e.target.value)}
                  onBlur={() => setFreeShipNetStr(normalizeWmMoneyInputString(freeShipNetStr))}
                  inputMode="decimal"
                  placeholder="np. 500,00"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Czas realizacji (dni)</span>
                <input className={inputClass} value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} inputMode="numeric" />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Ostatnia cena zakupu netto</span>
                <input
                  className={inputClass}
                  value={lastPurchaseNetStr}
                  onChange={(e) => setLastPurchaseNetStr(e.target.value)}
                  onBlur={() => setLastPurchaseNetStr(normalizeWmMoneyInputString(lastPurchaseNetStr))}
                  inputMode="decimal"
                />
              </label>
            </div>
            </div>
          </WmFormSectionCard>
        ) : null}

        {activeTab === "warehouse" ? (
          <ProductWarehouseStockPanel
            physicalStockDisplay={physicalStockDisplay}
            reservedDisplay={reservedDisplay}
            availableDisplay={availableDisplay}
            inventoryRows={cartonInventoryRows}
            emptyLocationsMessage="Brak przypisanej lokalizacji"
            editorSlot={warehouseEditorSlot}
          />
        ) : null}

        {activeTab === "costs" ? (
          <WmFormSectionCard title="Koszty" description="Ceny zakupu i koszt jednostkowy.">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={fieldLabel}>Cena zakupu (netto)</span>
              <input
                className={inputClass}
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                onBlur={() => setPurchasePrice(normalizeWmMoneyInputString(purchasePrice))}
                inputMode="decimal"
                placeholder="np. 12,50"
              />
            </label>
            <label className="block">
                <span className={fieldLabel}>Koszt jednostkowy</span>
              <input
                className={inputClass}
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                onBlur={() => setUnitCost(normalizeWmMoneyInputString(unitCost))}
                inputMode="decimal"
                placeholder="np. 2,10"
              />
            </label>
            </div>
          </WmFormSectionCard>
        ) : null}

        {activeTab === "pricing" ? (
          <WmFormSectionCard title="Cennik progowy" description="VAT, opakowanie bazowe i progi wolumenowe.">
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
          </WmFormSectionCard>
        ) : null}

        {activeTab === "bdo" ? (
          <WmFormSectionCard title="BDO" description="Mapowanie mas opakowaniowych na jednostkę magazynową.">
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input type="checkbox" checked={includeInBdo} onChange={(e) => setIncludeInBdo(e.target.checked)} className="h-4 w-4" />
              Uwzględniaj w module Magazyn → BDO
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Typ opakowania</span>
              <input
                className={inputClass}
                value={packagingTypeBdo}
                onChange={(e) => setPackagingTypeBdo(e.target.value)}
                placeholder="np. karton"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-600">Plastik kg / szt.</span>
                <input className={inputClass} value={plasticKg} onChange={(e) => setPlasticKg(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-600">Papier kg / szt.</span>
                <input
                  className={inputClass}
                  value={paperKg}
                  onChange={(e) => setPaperKg(e.target.value)}
                  inputMode="decimal"
                  placeholder="puste = jak waga kartonu"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-600">Drewno kg / szt.</span>
                <input className={inputClass} value={woodKg} onChange={(e) => setWoodKg(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-600">Szkło kg / szt.</span>
                <input className={inputClass} value={glassKg} onChange={(e) => setGlassKg(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold uppercase text-slate-600">Metal kg / szt.</span>
                <input className={inputClass} value={metalKg} onChange={(e) => setMetalKg(e.target.value)} inputMode="decimal" />
              </label>
            </div>
          </div>
          </WmFormSectionCard>
        ) : null}

        {activeTab === "shipping" ? (
          <WmFormSectionCard title="Metody dostawy" description="Wielokrotny wybór metod wysyłki powiązanych z kartonem.">
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
          </WmFormSectionCard>
        ) : null}
      </div>
    </WarehouseMaterialEditLayout>
  );
}
