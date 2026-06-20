import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/axios";
import {
  createPackagingMaterial,
  deletePackagingMaterial,
  duplicatePackagingMaterial,
  getPackagingMaterial,
  updatePackagingMaterial,
  type PackagingMaterialDto,
} from "../../api/packagingMaterialsApi";
import type { PriceTierDto } from "../../api/cartonsApi";
import { listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import { listManufacturers, type ManufacturerRead } from "../../api/manufacturersApi";
import {
  productLikeFieldLabelClass,
  productLikeInputClass,
  type ProductLikeStatCard,
} from "../../components/catalog";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { useWarehouse } from "../../context/WarehouseContext";
import { WmFormSectionCard } from "../../modules/warehouseMaterials/components/WmFormSectionCard";
import { WarehouseMaterialEditLayout } from "../../modules/warehouseMaterials/components/WarehouseMaterialEditLayout";
import {
  PACKAGING_EDIT_TABS,
  type PackagingEditTabId,
} from "../../modules/warehouseMaterials/warehouseMaterialEditTabs";
import { wmApiErrorDetailMessage, wmFmtQty } from "../../modules/warehouseMaterials/warehouseMaterialFormUtils";
import {
  formatWmMoneyZloty,
  normalizeWmMoneyInputString,
  numberToEditableMoneyString,
  parseMoneyToOptionalRounded,
  parseOptionalPositiveQuantity,
} from "../../modules/warehouseMaterials/warehouseMaterialsMoney";
import PriceTiersPanel, { tiersFromDto, tiersToPayload, type TierDraft } from "./PriceTiersPanel";

const MATERIAL_OPTIONS: { value: string; label: string }[] = [
  { value: "stretch_foil", label: "Folia stretch" },
  { value: "packing_tape", label: "Taśma pakowa" },
  { value: "paper_filler", label: "Wypełniacz papierowy" },
  { value: "bubble_wrap", label: "Folia bąbelkowa" },
  { value: "courier_envelope", label: "Koperta kurierska" },
  { value: "label_roll", label: "Rolka etykiet" },
  { value: "other", label: "Inne" },
  { value: "tape", label: "Taśma (legacy)" },
  { value: "foil", label: "Folia (legacy)" },
  { value: "filler", label: "Wypełniacz (legacy)" },
];

const UNIT_DISPLAY: Record<string, string> = {
  roll: "rol.",
  pcs: "szt.",
  kg: "kg",
};

export default function PackagingMaterialDetailPage() {
  const { materialId } = useParams<{ materialId: string }>();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const isNew = materialId === "new";

  const [activeTab, setActiveTab] = useState<PackagingEditTabId>("basic");
  const headerGalleryInputRef = useRef<HTMLInputElement>(null);
  const [dupBusy, setDupBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierRead[]>([]);
  const [manufacturers, setManufacturers] = useState<ManufacturerRead[]>([]);

  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [sku, setSku] = useState("");
  const [mtype, setMtype] = useState("stretch_foil");
  const [unit, setUnit] = useState("roll");
  const [isActive, setIsActive] = useState(true);
  const [supplierId, setSupplierId] = useState("");
  const [producerId, setProducerId] = useState("");
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
  const [notes, setNotes] = useState("");
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
  const [paperKg, setPaperKg] = useState("0");
  const [woodKg, setWoodKg] = useState("0");
  const [glassKg, setGlassKg] = useState("0");
  const [metalKg, setMetalKg] = useState("0");
  const [packagingTypeBdo, setPackagingTypeBdo] = useState("");

  const [widthMm, setWidthMm] = useState("");
  const [lengthM, setLengthM] = useState("");
  const [thick, setThick] = useState("");
  const [color, setColor] = useState("");
  const [netFoil, setNetFoil] = useState("");
  const [tubeKg, setTubeKg] = useState("");
  const [stretchPct, setStretchPct] = useState("");
  const [tubeDia, setTubeDia] = useState("");
  const [adhesive, setAdhesive] = useState("");
  const [tapeW, setTapeW] = useState("");
  const [corePaper, setCorePaper] = useState("");
  const [rollDia, setRollDia] = useState("");
  const [grammage, setGrammage] = useState("");
  const [paperType, setPaperType] = useState("");
  const [rollWt, setRollWt] = useState("");
  const [bubbleWcm, setBubbleWcm] = useState("");
  const [bubbleDia, setBubbleDia] = useState("");
  const [tolerance, setTolerance] = useState("");
  const [bubbleWt, setBubbleWt] = useState("");

  const applyDto = useCallback((r: PackagingMaterialDto) => {
    setName(r.name);
    setImageUrl(r.image_url ?? null);
    setSku(r.sku ?? "");
    setMtype(r.material_type || "other");
    setUnit(r.unit || "roll");
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
    setNotes(r.notes ?? "");
    setVatRatePct(String(r.vat_rate_pct ?? 23));
    setPackageQty(r.package_qty != null ? numberToEditableMoneyString(Number(r.package_qty)) : "");
    setPackageNet(r.package_net_total != null ? numberToEditableMoneyString(Number(r.package_net_total)) : "");
    setPackageGross(r.package_gross_total != null ? numberToEditableMoneyString(Number(r.package_gross_total)) : "");
    setTierDrafts(tiersFromDto(r.price_tiers));
    setTierSummary((r.price_tiers as PriceTierDto[]) ?? []);
    setLowStockThr(r.low_stock_threshold != null ? String(r.low_stock_threshold) : "");
    setReorderQty(r.reorder_qty != null ? String(r.reorder_qty) : "");
    setIncludeInBdo(!!r.include_in_bdo);
    setPlasticKg(String(r.plastic_kg_per_unit ?? 0));
    setPaperKg(String(r.paper_kg_per_unit ?? 0));
    setWoodKg(String(r.wood_kg_per_unit ?? 0));
    setGlassKg(String(r.glass_kg_per_unit ?? 0));
    setMetalKg(String(r.metal_kg_per_unit ?? 0));
    setPackagingTypeBdo(r.packaging_type ?? "");
    setWidthMm(r.width_mm != null ? String(r.width_mm) : "");
    setLengthM(r.length_m != null ? String(r.length_m) : "");
    setThick(r.thickness_micron != null ? String(r.thickness_micron) : "");
    setColor(r.color ?? "");
    setNetFoil(r.net_weight_foil_kg != null ? String(r.net_weight_foil_kg) : "");
    setTubeKg(r.tube_weight_kg != null ? String(r.tube_weight_kg) : "");
    setStretchPct(r.stretch_percent != null ? String(r.stretch_percent) : "");
    setTubeDia(r.tube_diameter_mm != null ? String(r.tube_diameter_mm) : "");
    setAdhesive(r.adhesive_type ?? "");
    setTapeW(r.tape_weight_kg != null ? String(r.tape_weight_kg) : "");
    setCorePaper(r.core_paper_weight_kg != null ? String(r.core_paper_weight_kg) : "");
    setRollDia(r.roll_diameter_mm != null ? String(r.roll_diameter_mm) : "");
    setGrammage(r.grammage_gsm != null ? String(r.grammage_gsm) : "");
    setPaperType(r.paper_type ?? "");
    setRollWt(r.roll_weight_kg != null ? String(r.roll_weight_kg) : "");
    setBubbleWcm(r.bubble_width_cm != null ? String(r.bubble_width_cm) : "");
    setBubbleDia(r.bubble_diameter_mm != null ? String(r.bubble_diameter_mm) : "");
    setTolerance(r.tolerance_percent != null ? String(r.tolerance_percent) : "");
    setBubbleWt(r.bubble_weight_kg != null ? String(r.bubble_weight_kg) : "");
  }, []);

  useEffect(() => {
    void Promise.all([
      listSuppliers(DAMAGE_TENANT_ID, { status: "all" }),
      listManufacturers({ tenantId: DAMAGE_TENANT_ID, status: "all" }),
    ])
      .then(([sup, mfg]) => {
        setSuppliers(sup);
        setManufacturers(mfg);
      })
      .catch(() => {
        setSuppliers([]);
        setManufacturers([]);
      });
  }, []);

  useEffect(() => {
    if (warehouseId == null || isNew || !materialId) return;
    let c = false;
    setLoadErr(null);
    void getPackagingMaterial(materialId, { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId })
      .then((r) => {
        if (!c) applyDto(r);
      })
      .catch(() => {
        if (!c) setLoadErr("Nie udało się wczytać materiału.");
      });
    return () => {
      c = true;
    };
  }, [warehouseId, materialId, isNew, applyDto]);

  const { unitNetPreview, unitGrossPreview } = useMemo(() => {
    const vat = parseFloat(String(vatRatePct).replace(",", "."));
    const v = Number.isFinite(vat) && vat >= 0 && vat <= 100 ? vat : 23;
    const m = 1 + v / 100;
    const pq = parseFloat(String(packageQty).replace(",", "."));
    const pnRaw = packageNet.trim() ? parseFloat(packageNet.replace(",", ".")) : NaN;
    const pgRaw = packageGross.trim() ? parseFloat(packageGross.replace(",", ".")) : NaN;
    let net = Number.isFinite(pnRaw) && pnRaw >= 0 ? pnRaw : null;
    let gross = Number.isFinite(pgRaw) && pgRaw >= 0 ? pgRaw : null;
    if (net != null && gross == null) gross = net * m;
    if (gross != null && net == null) net = gross / m;
    const un = pq > 0 && net != null && Number.isFinite(net) ? net / pq : null;
    const ug = pq > 0 && gross != null && Number.isFinite(gross) ? gross / pq : null;
    return { unitNetPreview: un, unitGrossPreview: ug };
  }, [vatRatePct, packageQty, packageNet, packageGross]);

  const stockNum = useMemo(() => {
    const n = parseFloat(stock.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [stock]);

  const parseOpt = (s: string): number | null => {
    const t = s.trim();
    if (!t) return null;
    const n = parseFloat(t.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  const buildPayload = () => {
    const nm = name.trim();
    if (!nm) return { err: "Podaj nazwę." } as const;
    const st = parseFloat(stock.replace(",", "."));
    const stockOk = Number.isFinite(st) && st >= 0 ? st : 0;
    const rq = parseFloat(reservedQty.replace(",", "."));
    const reservedOk = Number.isFinite(rq) && rq >= 0 ? rq : 0;
    if (reservedOk > stockOk) return { err: "Zarezerwowana ilość nie może przekraczać stanu." } as const;
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
    return {
      err: null as null,
      payload: {
        name: nm,
        material_type: mtype,
        unit,
        image_url: imageUrl?.trim() || null,
        sku: sku.trim() || null,
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
        notes: notes.trim() || null,
        vat_rate_pct: vatOk,
        package_qty: parseOptionalPositiveQuantity(packageQty),
        package_net_total: parseMoneyToOptionalRounded(packageNet),
        package_gross_total: parseMoneyToOptionalRounded(packageGross),
        low_stock_threshold: parseOpt(lowStockThr),
        reorder_qty: parseOpt(reorderQty),
        price_tiers: tiersToPayload(tierDrafts),
        include_in_bdo: includeInBdo,
        plastic_kg_per_unit: parseOpt(plasticKg) ?? 0,
        paper_kg_per_unit: parseOpt(paperKg) ?? 0,
        wood_kg_per_unit: parseOpt(woodKg) ?? 0,
        glass_kg_per_unit: parseOpt(glassKg) ?? 0,
        metal_kg_per_unit: parseOpt(metalKg) ?? 0,
        packaging_type: packagingTypeBdo.trim() || null,
        width_mm: parseOpt(widthMm),
        length_m: parseOpt(lengthM),
        thickness_micron: parseOpt(thick),
        color: color.trim() || null,
        net_weight_foil_kg: parseOpt(netFoil),
        tube_weight_kg: parseOpt(tubeKg),
        stretch_percent: parseOpt(stretchPct),
        tube_diameter_mm: parseOpt(tubeDia),
        adhesive_type: adhesive.trim() || null,
        tape_weight_kg: parseOpt(tapeW),
        core_paper_weight_kg: parseOpt(corePaper),
        roll_diameter_mm: parseOpt(rollDia),
        grammage_gsm: parseOpt(grammage),
        paper_type: paperType.trim() || null,
        roll_weight_kg: parseOpt(rollWt),
        bubble_width_cm: parseOpt(bubbleWcm),
        bubble_diameter_mm: parseOpt(bubbleDia),
        tolerance_percent: parseOpt(tolerance),
        bubble_weight_kg: parseOpt(bubbleWt),
      },
    };
  };

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
    const built = buildPayload();
    if (built.err) {
      setLoadErr(built.err);
      setActiveTab("basic");
      return;
    }
    setSaving(true);
    setLoadErr(null);
    try {
      if (isNew) {
        const created = await createPackagingMaterial({
          tenant_id: DAMAGE_TENANT_ID,
          warehouse_id: warehouseId,
          ...built.payload,
        });
        navigate(`/warehouse-materials/packaging/${created.id}`, { replace: true });
      } else if (materialId) {
        await updatePackagingMaterial(
          materialId,
          { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId },
          built.payload,
        );
        const r = await getPackagingMaterial(materialId, {
          tenant_id: DAMAGE_TENANT_ID,
          warehouse_id: warehouseId,
        });
        applyDto(r);
      }
    } catch (e) {
      setLoadErr(wmApiErrorDetailMessage(e, "Nie udało się zapisać."));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (warehouseId == null || isNew || !materialId) return;
    if (!window.confirm("Usunąć ten materiał?")) return;
    try {
      await deletePackagingMaterial(materialId, { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId });
      navigate("/warehouse-materials/packaging");
    } catch (e) {
      setLoadErr(wmApiErrorDetailMessage(e, "Nie udało się usunąć."));
    }
  };

  const onDuplicate = async () => {
    if (warehouseId == null || isNew || !materialId) return;
    setDupBusy(true);
    setLoadErr(null);
    try {
      const d = await duplicatePackagingMaterial(materialId, { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId });
      navigate(`/warehouse-materials/packaging/${d.id}`);
    } catch (e) {
      setLoadErr(wmApiErrorDetailMessage(e, "Nie udało się zduplikować."));
    } finally {
      setDupBusy(false);
    }
  };

  const technicalFields = useMemo(() => {
    const t = mtype;
    const isStretch = t === "stretch_foil" || t === "foil";
    const isTape = t === "packing_tape" || t === "tape";
    const isBubble = t === "bubble_wrap";
    const isPaper = t === "paper_filler" || t === "filler";
    return { isStretch, isTape, isBubble, isPaper, isGeneric: !isStretch && !isTape && !isBubble && !isPaper };
  }, [mtype]);

  const title = useMemo(() => {
    if (isNew) return "Nowy materiał pakowy";
    return name.trim() || "Materiał pakowy";
  }, [isNew, name]);

  const materialTypeLabel = useMemo(
    () => MATERIAL_OPTIONS.find((o) => o.value === mtype)?.label ?? mtype,
    [mtype],
  );

  const statCards = useMemo((): ProductLikeStatCard[] => {
    const unitDisplay = UNIT_DISPLAY[unit] ?? unit;
    const cards: ProductLikeStatCard[] = [
      { label: "Stan", value: `${wmFmtQty(stockNum)} ${unitDisplay}`, variant: "blue" },
      { label: "Typ materiału", value: materialTypeLabel, variant: "slate" },
    ];
    if (unitNetPreview != null) {
      cards.push({ label: "Netto / j.u.", value: formatWmMoneyZloty(unitNetPreview), variant: "green" });
    }
    return cards;
  }, [stockNum, unit, materialTypeLabel, unitNetPreview]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleSave();
  };

  const fieldLabel = productLikeFieldLabelClass;
  const inputClass = productLikeInputClass;

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
        { label: "Materiały magazynowe", onClick: () => navigate("/warehouse-materials/packaging") },
        { label: isNew ? "Nowy materiał pakowy" : title },
      ]}
      tabs={PACKAGING_EDIT_TABS}
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
      saveLabel={isNew ? "Utwórz materiał" : "Zapisz zmiany"}
      statCards={statCards}
    >
      <div className="space-y-5">
        {activeTab === "basic" ? (
          <WmFormSectionCard title="Dane podstawowe" description="Nazwa, SKU, typ materiału i jednostka magazynowa.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={fieldLabel}>Nazwa</label>
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className={fieldLabel}>SKU</label>
                <input className={inputClass} value={sku} onChange={(e) => setSku(e.target.value)} />
              </div>
              <div>
                <label className={fieldLabel}>Typ materiału</label>
                <select className={inputClass} value={mtype} onChange={(e) => setMtype(e.target.value)}>
                  {MATERIAL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={fieldLabel}>Jednostka</label>
                <select className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option value="roll">Rolka</option>
                  <option value="pcs">Sztuka</option>
                  <option value="kg">Kilogram</option>
                </select>
              </div>
              <label className="flex items-center gap-2 sm:col-span-2">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                <span className="text-sm font-medium text-slate-800">Aktywny w magazynie</span>
              </label>
              <div className="sm:col-span-2">
                <label className={fieldLabel}>Uwagi</label>
                <textarea className={`${inputClass} min-h-[88px] py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          </WmFormSectionCard>
        ) : null}

        {activeTab === "technical" ? (
          <WmFormSectionCard
            title="Parametry techniczne"
            description="Pola zależne od typu — wypełnij tylko te, które dotyczą wybranego materiału."
          >
            {technicalFields.isGeneric ? (
              <p className="text-sm text-slate-600">Dla tego typu nie zdefiniowano dodatkowych pól technicznych.</p>
            ) : null}
            {technicalFields.isStretch ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={fieldLabel}>Szerokość (mm)</span>
                  <input className={inputClass} value={widthMm} onChange={(e) => setWidthMm(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Grubość (µm)</span>
                  <input className={inputClass} value={thick} onChange={(e) => setThick(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Waga folii netto (kg)</span>
                  <input className={inputClass} value={netFoil} onChange={(e) => setNetFoil(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Waga tubusu / rdzenia (kg)</span>
                  <input className={inputClass} value={tubeKg} onChange={(e) => setTubeKg(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Stretch (%)</span>
                  <input className={inputClass} value={stretchPct} onChange={(e) => setStretchPct(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Średnica rdzenia (mm)</span>
                  <input className={inputClass} value={tubeDia} onChange={(e) => setTubeDia(e.target.value)} inputMode="decimal" />
                </label>
              </div>
            ) : null}
            {technicalFields.isTape ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={fieldLabel}>Szerokość (mm)</span>
                  <input className={inputClass} value={widthMm} onChange={(e) => setWidthMm(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Długość (m)</span>
                  <input className={inputClass} value={lengthM} onChange={(e) => setLengthM(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Rodzaj kleju</span>
                  <input className={inputClass} value={adhesive} onChange={(e) => setAdhesive(e.target.value)} />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Kolor</span>
                  <input className={inputClass} value={color} onChange={(e) => setColor(e.target.value)} />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Waga rdzenia papierowego (kg)</span>
                  <input className={inputClass} value={corePaper} onChange={(e) => setCorePaper(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Waga taśmy (kg, opcjonalnie)</span>
                  <input className={inputClass} value={tapeW} onChange={(e) => setTapeW(e.target.value)} inputMode="decimal" />
                </label>
              </div>
            ) : null}
            {technicalFields.isBubble ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={fieldLabel}>Szerokość (cm)</span>
                  <input className={inputClass} value={bubbleWcm} onChange={(e) => setBubbleWcm(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Długość (m)</span>
                  <input className={inputClass} value={lengthM} onChange={(e) => setLengthM(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Średnica bąbla (mm)</span>
                  <input className={inputClass} value={bubbleDia} onChange={(e) => setBubbleDia(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Grubość (µm)</span>
                  <input className={inputClass} value={thick} onChange={(e) => setThick(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Tolerancja (%)</span>
                  <input className={inputClass} value={tolerance} onChange={(e) => setTolerance(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Waga (kg, opcjonalnie)</span>
                  <input className={inputClass} value={bubbleWt} onChange={(e) => setBubbleWt(e.target.value)} inputMode="decimal" />
                </label>
              </div>
            ) : null}
            {technicalFields.isPaper ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={fieldLabel}>Szerokość (mm)</span>
                  <input className={inputClass} value={widthMm} onChange={(e) => setWidthMm(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Długość rolki (m)</span>
                  <input className={inputClass} value={lengthM} onChange={(e) => setLengthM(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Gramatura (g/m²)</span>
                  <input className={inputClass} value={grammage} onChange={(e) => setGrammage(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Waga rolki (kg)</span>
                  <input className={inputClass} value={rollWt} onChange={(e) => setRollWt(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Średnica rolki (mm)</span>
                  <input className={inputClass} value={rollDia} onChange={(e) => setRollDia(e.target.value)} inputMode="decimal" />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Rodzaj papieru</span>
                  <input className={inputClass} value={paperType} onChange={(e) => setPaperType(e.target.value)} />
                </label>
                <label className="block sm:col-span-2">
                  <span className={fieldLabel}>Kolor</span>
                  <input className={inputClass} value={color} onChange={(e) => setColor(e.target.value)} />
                </label>
              </div>
            ) : null}
          </WmFormSectionCard>
        ) : null}

        {activeTab === "pricing" ? (
          <WmFormSectionCard
            title="Cennik"
            description="VAT, opakowanie bazowe i progi wolumenowe — jak w kartonach. Podgląd jednostkowy przeliczany z pól poniżej."
          >
            <div className="mb-5 grid grid-cols-1 gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-2">
              <div>
                <p className={fieldLabel}>Podgląd netto / j.u.</p>
                <p className="font-mono text-sm font-semibold text-slate-900">{formatWmMoneyZloty(unitNetPreview)}</p>
              </div>
              <div>
                <p className={fieldLabel}>Podgląd brutto / j.u.</p>
                <p className="font-mono text-sm font-semibold text-slate-900">{formatWmMoneyZloty(unitGrossPreview)}</p>
              </div>
            </div>
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
                  placeholder="Opcjonalnie"
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
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Wielopak / zbiorcze</span>
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
          <WmFormSectionCard title="Magazyn" description="Stan, rezerwacje, lokalizacja etykieta oraz progi alertów.">
            <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={fieldLabel}>Stan</span>
                <input className={inputClass} value={stock} onChange={(e) => setStock(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block">
                <span className={fieldLabel}>Zarezerwowano</span>
                <input className={inputClass} value={reservedQty} onChange={(e) => setReservedQty(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block sm:col-span-2">
                <span className={fieldLabel}>Lokalizacja (etykieta)</span>
                <input className={inputClass} value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} />
              </label>
              <label className="block">
                <span className={fieldLabel}>Próg niskiego stanu</span>
                <input className={inputClass} value={lowStockThr} onChange={(e) => setLowStockThr(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block">
                <span className={fieldLabel}>Sugerowane uzupełnienie</span>
                <input className={inputClass} value={reorderQty} onChange={(e) => setReorderQty(e.target.value)} inputMode="decimal" />
              </label>
            </div>
          </WmFormSectionCard>
        ) : null}

        {activeTab === "bdo" ? (
          <WmFormSectionCard title="Mapowanie BDO" description="Masy składowe na jednostkę magazynową — widoczne w Magazyn → BDO.">
            <label className="mb-4 flex items-center gap-2">
              <input type="checkbox" checked={includeInBdo} onChange={(e) => setIncludeInBdo(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              <span className="text-sm font-medium text-slate-800">Uwzględniaj w raportach BDO</span>
            </label>
            <label className="mb-4 block max-w-md">
              <span className={fieldLabel}>Typ opakowania (BDO)</span>
              <input className={inputClass} value={packagingTypeBdo} onChange={(e) => setPackagingTypeBdo(e.target.value)} />
            </label>
            <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={fieldLabel}>Plastik (kg / j.u.)</span>
                <input className={inputClass} value={plasticKg} onChange={(e) => setPlasticKg(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block">
                <span className={fieldLabel}>Papier (kg / j.u.)</span>
                <input className={inputClass} value={paperKg} onChange={(e) => setPaperKg(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block">
                <span className={fieldLabel}>Drewno</span>
                <input className={inputClass} value={woodKg} onChange={(e) => setWoodKg(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block">
                <span className={fieldLabel}>Szkło</span>
                <input className={inputClass} value={glassKg} onChange={(e) => setGlassKg(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block sm:col-span-2">
                <span className={fieldLabel}>Metal</span>
                <input className={inputClass} value={metalKg} onChange={(e) => setMetalKg(e.target.value)} inputMode="decimal" />
              </label>
            </div>
          </WmFormSectionCard>
        ) : null}
      </div>
    </WarehouseMaterialEditLayout>
  );
}
