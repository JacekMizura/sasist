import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { duplicateProduct } from "../../api/productsApi";
import { extractApiErrorMessage } from "../../api/authApi";
import {
  Building2,
  ClipboardList,
  Copy,
  Factory,
  Image as ImageIcon,
  ImageUp,
  LayoutList,
  Layers,
  MoreHorizontal,
  Printer,
  Tag,
  Truck,
  Warehouse,
  Wrench,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { error as logError, log } from "../../utils/logger";
import api from "../../api/axios";
import { listManufacturers, type ManufacturerRead } from "../../api/manufacturersApi";
import { listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import {
  createSupplierProductLink,
  deleteSupplierProductLink,
  listSupplierProductLinks,
  patchSupplierProductLink,
} from "../../api/supplierProductLinksApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { productCreatedInWms } from "../../utils/wmsProductMeta";
import type { AssignedLocation } from "../../types/warehouse";
import { ProductWarehouseMovementsPanel } from "./ProductWarehouseMovementsPanel";
import { ProductLogisticsPackagingMatchingSection } from "../../components/products/ProductLogisticsPackagingMatchingSection";
import { RetailLabel } from "../../components/products/RetailLabel";
import { WarehouseFormCard as Card } from "../../components/products/WarehouseFormCard";
import { ProductWarehouseStockPanel } from "../../components/products/ProductWarehouseStockPanel";
import ProductMultiWarehouseStockSection from "../../components/products/ProductMultiWarehouseStockSection";
import ProductMultiWarehouseSlottingSection from "../../components/products/ProductMultiWarehouseSlottingSection";
import { ProductStockCorrectionModal } from "../../components/products/ProductStockCorrectionModal";
import { getInventoryManagementSettings } from "../../api/inventoryManagementPolicyApi";
import { ProductManufacturingPanel } from "../Production/ProductManufacturingPanel";
import { ProductSalesOffersSection } from "./ProductSalesOffersSection";
import { listCompositionsForProduct } from "../../api/compositionApi";
import type { MagazynInvRowDisplay } from "../../components/products/MagazynInventoryLine";
import { EditInventoryTraceabilityModal } from "../../components/products/EditInventoryTraceabilityModal";
import { ProductReceivingRequirementsSection } from "../../components/wms/receiving/ProductReceivingRequirementsSection";
import { SUPPLIER_COUNTRIES } from "../../constants/supplierTaxonomy";
import type { ProductImageEntry, ProductLabelData } from "../../types/productLabel";
import {
  ProductLikePageLayout,
  productLikeFieldLabelClass,
  productLikeInputClass,
  type ProductLikeStatCard,
} from "../../components/catalog";
import {
  buildProductMetadataJson,
  ensureSingleMainImage,
  manufacturerLabelBlock,
  parseLabelData,
  parseProductImages,
  pickMainImageUrl,
} from "../../utils/productLabelMetadata";
import { formatMoneyZlDisplay, resolveProductPricingDisplay } from "./productPricingDisplay";

export type ProductForm = {
  id?: number;
  tenant_id?: number;
  name: string;
  ean: string;
  symbol: string;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  volume?: number;
  image_url?: string;
  assignedLocations?: AssignedLocation[];
  label_template_id?: number | null;
  purchase_price?: number | null;
  extra_cost_packaging_net?: number | null;
  extra_cost_commission_percent?: number | null;
  extra_cost_other_net?: number | null;
  previous_purchase_price?: number | null;
  purchase_price_original?: number | null;
  purchase_currency?: string | null;
  last_purchase_date?: string | null;
  last_supplier_id?: number | null;
  last_supplier_brief?: { id: number; name: string } | null;
  last_purchase_currency?: string | null;
  current_cost?: {
    purchase_net?: number | null;
    purchase_gross?: number | null;
    extra_cost_net?: number | null;
    landed_cost_net?: number | null;
    vat_percent?: number | null;
    sale_net?: number | null;
    sale_gross?: number | null;
    margin_value?: number | null;
    margin_percent?: number | null;
    updated_at?: string | null;
    source?: string | null;
  } | null;
  sale_price?: number | null;
  manufacturer?: string | null;
  manufacturer_id?: number | null;
  manufacturer_brief?: { id: number; name: string; logo_url?: string | null } | null;
  default_supplier_id?: number | null;
  default_supplier_brief?: { id: number; name: string } | null;
  supplier_catalog_links?: {
    id: number;
    supplier_id: number;
    supplier_name: string;
    purchase_price: number | null;
    lead_time_days?: number | null;
    min_order_qty?: number | null;
    is_default: boolean;
  }[];
  gpsr_responsible_name?: string | null;
  gpsr_responsible_email?: string | null;
  unit?: string | null;
  stock_quantity?: number;
  location_allocated_quantity?: number;
  unallocated_quantity?: number;
  reserved_quantity?: number;
  available_quantity?: number;
  disposition_stock?: import("../../types/productDispositionStock").ProductDispositionStock;
  commercially_sellable_qty?: number;
  network_commercially_sellable_qty?: number;
  sales_blocked_qty?: number;
  orientation_type?: "any" | "upright" | "no_stack";
  shape_type?: "box" | "cylinder";
  stack_compressible?: boolean;
  compressed_height_cm?: number | null;
  max_stack_weight?: number | null;
  stack_behavior?: "stackable" | "no_stack";
  product_orientation_type?: "any" | "upright" | "no_stack";
  product_shape_type?: "box" | "cylinder";
  product_stack_compressible?: boolean;
  product_compressed_height_cm?: number | null;
  product_max_stack_weight?: number | null;
  product_stack_behavior?: "stackable" | "no_stack";
  carton_orientation_type?: "any" | "upright" | "no_stack" | null;
  carton_shape_type?: "box" | "cylinder" | null;
  carton_stack_compressible?: boolean | null;
  carton_compressed_height_cm?: number | null;
  carton_max_stack_weight?: number | null;
  carton_stack_behavior?: "stackable" | "no_stack" | null;
  min_pick_quantity?: number | null;
  max_pick_quantity?: number | null;
  min_reserve_quantity?: number | null;
  max_reserve_quantity?: number | null;
  enable_stock_alert?: boolean;
  min_total_stock?: number | null;
  metadata_json?: Record<string, unknown> | null;
  locations?: {
    id?: number;
    code?: string;
    name: string;
    quantity: number;
    warehouse_id?: number;
    storage_type?: string;
    location_uuid?: string | null;
  }[];
  locations_load_incomplete?: boolean;
  detail_degraded?: boolean;
  inventory?: {
    inventory_id?: number | null;
    inventory_serial_ids?: number[];
    location_id: number;
    location_code: string;
    location_type: string;
    quantity: number;
    batch?: string | null;
    expiry?: string | null;
    serial_range_label?: string | null;
    serial_numbers?: string[];
    warehouse_id?: number;
    location_uuid?: string | null;
    stock_disposition?: string | null;
    disposition_badge?: string | null;
    warehouse_carrier_id?: number | null;
    carrier_code?: string | null;
    carrier_barcode?: string | null;
    carrier_is_mixed?: boolean;
  }[];
  track_batch?: boolean;
  track_expiry?: boolean;
  track_serial?: boolean;
  require_recv_height?: boolean;
  require_recv_width?: boolean;
  require_recv_length?: boolean;
  require_recv_weight?: boolean;
  require_recv_master_carton?: boolean;
  require_recv_master_carton_ean?: boolean;
  require_recv_master_carton_qty?: boolean;
  require_recv_master_carton_dims?: boolean;
  require_recv_master_carton_weight?: boolean;
  bulk_ean?: string | null;
  units_per_carton?: number | null;
  carton_length_cm?: number | null;
  carton_width_cm?: number | null;
  carton_height_cm?: number | null;
  carton_weight_kg?: number | null;
  carton_volume_dm3?: number | null;
};

type Tenant = { id: number; name: string };

export type ProductEditTabId =
  | "basic"
  | "suppliers"
  | "labelSheet"
  | "images"
  | "prices"
  | "warehouse"
  | "warehouseOps"
  | "logistics"
  | "offers"
  | "settings"
  | "production";

type TabId = ProductEditTabId;

function parseOrient(v: unknown): "any" | "upright" | "no_stack" {
  return ["any", "upright", "no_stack"].includes(String(v)) ? (String(v) as "any" | "upright" | "no_stack") : "any";
}
function parseShape(v: unknown): "box" | "cylinder" {
  return ["box", "cylinder"].includes(String(v)) ? (String(v) as "box" | "cylinder") : "box";
}
function parseStackBehavior(v: unknown): "stackable" | "no_stack" {
  return ["stackable", "no_stack"].includes(String(v)) ? (String(v) as "stackable" | "no_stack") : "stackable";
}

function parseProductUi(meta: unknown): {
  responsible_person: string;
  responsible_person_email: string;
  vat_rate: string;
  promotion: string;
} {
  const empty = { responsible_person: "", responsible_person_email: "", vat_rate: "", promotion: "" };
  if (meta == null || typeof meta !== "object" || Array.isArray(meta)) return empty;
  const ui = (meta as Record<string, unknown>).product_ui;
  if (ui == null || typeof ui !== "object" || Array.isArray(ui)) return empty;
  const u = ui as Record<string, unknown>;
  return {
    responsible_person: String(u.responsible_person ?? ""),
    responsible_person_email: String(u.responsible_person_email ?? ""),
    vat_rate: String(u.vat_rate ?? ""),
    promotion: String(u.promotion ?? ""),
  };
}

function isStockQuantityWriteBlockedError(data: unknown): boolean {
  if (data == null || typeof data !== "object") return false;
  const root = data as { detail?: unknown };
  const d = root.detail;
  if (d != null && typeof d === "object" && "flag" in d) {
    return (d as { flag?: string }).flag === "DISABLE_STOCK_QUANTITY_INVENTORY_WRITE";
  }
  if (typeof d === "string") {
    return /stock_quantity|inventory api/i.test(d);
  }
  if (d != null && typeof d === "object" && "detail" in d) {
    const inner = (d as { detail?: unknown }).detail;
    if (typeof inner === "string") {
      return /stock_quantity|not accepted on product update/i.test(inner);
    }
  }
  return false;
}

function formatMoneyZl(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toFixed(2)} zł`;
}

function formatDateTimePl(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

function marginToneClass(marginPercent: number | null | undefined): string {
  if (marginPercent == null || Number.isNaN(Number(marginPercent))) return "text-slate-700";
  if (Number(marginPercent) > 30) return "text-emerald-600 font-semibold";
  if (Number(marginPercent) >= 10) return "text-amber-600 font-semibold";
  return "text-rose-600 font-semibold";
}

function parseLocationsFromApi(raw: unknown): ProductForm["locations"] {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((loc) => {
    const l = loc as Record<string, unknown>;
    return {
      name: String(l.name ?? "").trim() || "—",
      quantity: Number(l.quantity) || 0,
      warehouse_id: l.warehouse_id != null ? Number(l.warehouse_id) : undefined,
      storage_type: typeof l.storage_type === "string" ? l.storage_type : undefined,
      location_uuid: typeof l.location_uuid === "string" && l.location_uuid.trim() !== "" ? l.location_uuid.trim() : null,
    };
  });
}

function parseInventoryFromApi(raw: unknown): ProductForm["inventory"] {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    const sdRaw = r.stock_disposition != null ? String(r.stock_disposition).trim() : "";
    const dbRaw = r.disposition_badge != null ? String(r.disposition_badge).trim() : "";
    return {
      inventory_id: r.inventory_id != null && Number(r.inventory_id) > 0 ? Number(r.inventory_id) : null,
      inventory_serial_ids: Array.isArray(r.inventory_serial_ids)
        ? r.inventory_serial_ids.map((x) => Number(x)).filter((x) => x > 0)
        : [],
      location_id: Number(r.location_id) || 0,
      location_code: String(r.location_code ?? "").trim() || "—",
      location_type: String(r.location_type ?? "UNKNOWN"),
      quantity: Number(r.quantity) || 0,
      batch: r.batch != null && String(r.batch).trim() !== "" ? String(r.batch) : null,
      expiry: r.expiry != null && String(r.expiry).trim() !== "" ? String(r.expiry) : null,
      warehouse_id: r.warehouse_id != null ? Number(r.warehouse_id) : undefined,
      location_uuid: typeof r.location_uuid === "string" && r.location_uuid.trim() !== "" ? r.location_uuid.trim() : null,
      stock_disposition: sdRaw !== "" ? sdRaw : null,
      disposition_badge: dbRaw !== "" ? dbRaw : null,
      warehouse_carrier_id:
        r.warehouse_carrier_id != null && Number(r.warehouse_carrier_id) > 0 ? Number(r.warehouse_carrier_id) : null,
      carrier_code: r.carrier_code != null && String(r.carrier_code).trim() !== "" ? String(r.carrier_code).trim() : null,
      carrier_barcode:
        r.carrier_barcode != null && String(r.carrier_barcode).trim() !== "" ? String(r.carrier_barcode).trim() : null,
      carrier_is_mixed: Boolean(r.carrier_is_mixed),
      serial_range_label:
        r.serial_range_label != null && String(r.serial_range_label).trim() !== ""
          ? String(r.serial_range_label).trim()
          : null,
      serial_numbers: Array.isArray(r.serial_numbers)
        ? r.serial_numbers.map((s) => String(s).trim()).filter(Boolean)
        : undefined,
    };
  });
}

type ProductEditModalProps = {
  product: ProductForm | null;
  tenants: Tenant[];
  onSave: (p: ProductForm) => void;
  onClose: () => void;
  variant?: "modal" | "page";
  initialTab?: TabId;
  scrollToWmsValidation?: boolean;
  /** Stock from list view — used to detect cross-view inventory divergence. */
  listStockHint?: number;
};

export function ProductEditModal({
  product,
  tenants,
  onSave,
  onClose,
  variant = "modal",
  initialTab,
  scrollToWmsValidation = false,
  listStockHint,
}: ProductEditModalProps) {
  const navigate = useNavigate();
  const isPage = variant === "page";
  const isNew = product == null;
  const [dupBusy, setDupBusy] = useState(false);
  const { warehouse } = useWarehouse();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? "basic");
  const [productionTabVisible, setProductionTabVisible] = useState(initialTab === "production");
  const [saving, setSaving] = useState(false);
  const [canManualAdjustStock, setCanManualAdjustStock] = useState(false);
  const [stockCorrectionOpen, setStockCorrectionOpen] = useState(false);

  const [tenantId, setTenantId] = useState<number | null>(product?.tenant_id ?? null);
  const [name, setName] = useState(product?.name ?? "");
  const [ean, setEan] = useState(product?.ean ?? "");
  const [symbol, setSymbol] = useState(product?.symbol ?? "");
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  const [length, setLength] = useState<number | "">(product?.length ?? "");
  const [width, setWidth] = useState<number | "">(product?.width ?? "");
  const [height, setHeight] = useState<number | "">(product?.height ?? "");
  const [weight, setWeight] = useState<number | "">(product?.weight ?? "");
  const [volume, setVolume] = useState<number | "">(product?.volume ?? "");

  const parseDecimal = useCallback((s: string | number | undefined | null): number | undefined => {
    if (s === "" || s === undefined || s === null) return undefined;
    const str = String(s).trim().replace(",", ".");
    if (str === "") return undefined;
    const n = parseFloat(str);
    return Number.isFinite(n) ? n : undefined;
   }, []);

  const parseNumber = useCallback((value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    const s = String(value).trim().replace(",", ".");
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }, []);

  const updateDimension = useCallback(
    (which: "length" | "width" | "height", raw: string) => {
      const normalized = raw.trim().replace(",", ".");
      const num = normalized === "" ? "" : parseDecimal(normalized);
      const val = num === undefined ? "" : num;
      if (which === "length") setLength(val);
      if (which === "width") setWidth(val);
      if (which === "height") setHeight(val);
      const l = which === "length" ? val : length;
      const w = which === "width" ? val : width;
      const h = which === "height" ? val : height;
      if (l !== "" && w !== "" && h !== "" && typeof l === "number" && typeof w === "number" && typeof h === "number") {
        setVolume(round2((l * w * h) / 1000));
      }
    },
    [length, width, height, parseDecimal],
  );

  const [image_url, setImageUrl] = useState(product?.image_url ?? "");
  const headerGalleryInputRef = useRef<HTMLInputElement>(null);
  const [labelTemplateId, setLabelTemplateId] = useState<number | null>(product?.label_template_id ?? null);
  const [purchasePrice, setPurchasePrice] = useState<number | "">(product?.purchase_price ?? "");
  const [extraCostPackagingNet, setExtraCostPackagingNet] = useState<number | "">(product?.extra_cost_packaging_net ?? 0);
  const [extraCostCommissionPercent, setExtraCostCommissionPercent] = useState<number | "">(
    product?.extra_cost_commission_percent ?? 0,
  );
  const [extraCostOtherNet, setExtraCostOtherNet] = useState<number | "">(product?.extra_cost_other_net ?? 0);
  const [previousPurchasePrice, setPreviousPurchasePrice] = useState<number | "">(product?.previous_purchase_price ?? "");
  const [purchasePriceOriginal, setPurchasePriceOriginal] = useState<number | "">(product?.purchase_price_original ?? "");
  const [purchaseCurrency, setPurchaseCurrency] = useState<string | null>(product?.purchase_currency ?? null);
  const [lastPurchaseDate, setLastPurchaseDate] = useState<string | null>(product?.last_purchase_date ?? null);
  const [lastPurchaseCurrency, setLastPurchaseCurrency] = useState<string | null>(product?.last_purchase_currency ?? null);
  const [lastSupplierName, setLastSupplierName] = useState<string | null>(product?.last_supplier_brief?.name ?? null);
  const [currentCost, setCurrentCost] = useState<ProductForm["current_cost"]>(product?.current_cost ?? null);
  const [salePrice, setSalePrice] = useState<number | "">(
    product?.sale_price != null && !Number.isNaN(Number(product.sale_price)) ? Number(product.sale_price) : "",
  );
  const [manufacturer, setManufacturer] = useState(product?.manufacturer ?? "");
  const [manufacturerId, setManufacturerId] = useState<number | null>(product?.manufacturer_id ?? null);
  const [manufacturersCatalog, setManufacturersCatalog] = useState<ManufacturerRead[]>([]);
  const [defaultSupplierId, setDefaultSupplierId] = useState<number | null>(product?.default_supplier_id ?? null);
  const [suppliersCatalog, setSuppliersCatalog] = useState<SupplierRead[]>([]);
  const [supplierLinkRows, setSupplierLinkRows] = useState<
    {
      id: number;
      supplier_id: number;
      supplier_name: string;
      purchase_price: number | null;
      is_default: boolean;
    }[]
  >([]);
  const [supplierLinksBusy, setSupplierLinksBusy] = useState(false);
  const [addSupplierPick, setAddSupplierPick] = useState<string>("");
  const [labelData, setLabelData] = useState<ProductLabelData>({});
  const [productImages, setProductImages] = useState<ProductImageEntry[]>([]);
  const [newGalleryUrl, setNewGalleryUrl] = useState("");
  const [galleryUploadBusy, setGalleryUploadBusy] = useState(false);
  const [unit, setUnit] = useState(product?.unit ?? "");
  const [responsiblePerson, setResponsiblePerson] = useState("");
  const [responsiblePersonEmail, setResponsiblePersonEmail] = useState("");
  const [vatRate, setVatRate] = useState("");
  const [promotion, setPromotion] = useState("");

  const [bulkEan, setBulkEan] = useState("");
  const [unitsPerCarton, setUnitsPerCarton] = useState<number | "">("");
  const [cartonLength, setCartonLength] = useState<number | "">("");
  const [cartonWidth, setCartonWidth] = useState<number | "">("");
  const [cartonHeight, setCartonHeight] = useState<number | "">("");
  const [cartonWeight, setCartonWeight] = useState<number | "">("");
  const [cartonVolume, setCartonVolume] = useState<number | "">("");

  const [orientationType, setOrientationType] = useState<"any" | "upright" | "no_stack">(() =>
    parseOrient(product?.product_orientation_type ?? product?.orientation_type),
  );
  const [shapeType, setShapeType] = useState<"box" | "cylinder">(() =>
    parseShape(product?.product_shape_type ?? product?.shape_type),
  );
  const [stackBehavior, setStackBehavior] = useState<"stackable" | "no_stack">(() =>
    parseStackBehavior(product?.product_stack_behavior ?? product?.stack_behavior),
  );
  const [stackCompressible, setStackCompressible] = useState<boolean>(product?.product_stack_compressible ?? product?.stack_compressible ?? false);
  const [compressedHeightCm, setCompressedHeightCm] = useState<number | "">(() => {
    const ch = product?.product_compressed_height_cm ?? product?.compressed_height_cm;
    return ch != null && ch > 0 ? ch : "";
  });
  const [maxStackWeight, setMaxStackWeight] = useState<number | "">(() => {
    const mw = product?.product_max_stack_weight ?? product?.max_stack_weight;
    return mw != null && mw > 0 ? mw : "";
  });
  const [cartonOrientationType, setCartonOrientationType] = useState<"any" | "upright" | "no_stack">(() =>
    parseOrient(product?.carton_orientation_type),
  );
  const [cartonShapeType, setCartonShapeType] = useState<"box" | "cylinder">(() => parseShape(product?.carton_shape_type));
  const [cartonStackBehavior, setCartonStackBehavior] = useState<"stackable" | "no_stack">(() =>
    parseStackBehavior(product?.carton_stack_behavior),
  );
  const [cartonStackCompressible, setCartonStackCompressible] = useState<boolean>(product?.carton_stack_compressible ?? false);
  const [cartonCompressedHeightCm, setCartonCompressedHeightCm] = useState<number | "">(() => {
    const ch = product?.carton_compressed_height_cm;
    return ch != null && ch > 0 ? ch : "";
  });
  const [cartonMaxStackWeight, setCartonMaxStackWeight] = useState<number | "">(() => {
    const mw = product?.carton_max_stack_weight;
    return mw != null && mw > 0 ? mw : "";
  });
  const [minPickQuantity, setMinPickQuantity] = useState<number | "">(
    product?.min_pick_quantity != null && !Number.isNaN(Number(product.min_pick_quantity)) ? Number(product.min_pick_quantity) : "",
  );
  const [maxPickQuantity, setMaxPickQuantity] = useState<number | "">(
    product?.max_pick_quantity != null && !Number.isNaN(Number(product.max_pick_quantity)) ? Number(product.max_pick_quantity) : "",
  );
  const [minReserveQuantity, setMinReserveQuantity] = useState<number | "">(
    product?.min_reserve_quantity != null && !Number.isNaN(Number(product.min_reserve_quantity))
      ? Number(product.min_reserve_quantity)
      : "",
  );
  const [maxReserveQuantity, setMaxReserveQuantity] = useState<number | "">(
    product?.max_reserve_quantity != null && !Number.isNaN(Number(product.max_reserve_quantity))
      ? Number(product.max_reserve_quantity)
      : "",
  );
  const [enableStockAlert, setEnableStockAlert] = useState<boolean>(Boolean(product?.enable_stock_alert));
  const [minTotalStock, setMinTotalStock] = useState<number | "">(
    product?.min_total_stock != null && !Number.isNaN(Number(product.min_total_stock)) ? Number(product.min_total_stock) : "",
  );
  const [trackBatch, setTrackBatch] = useState<boolean>(Boolean(product?.track_batch));
  const [trackExpiry, setTrackExpiry] = useState<boolean>(Boolean(product?.track_expiry));
  const [trackSerial, setTrackSerial] = useState<boolean>(Boolean(product?.track_serial));
  const [requireRecvHeight, setRequireRecvHeight] = useState(Boolean(product?.require_recv_height));
  const [requireRecvWidth, setRequireRecvWidth] = useState(Boolean(product?.require_recv_width));
  const [requireRecvLength, setRequireRecvLength] = useState(Boolean(product?.require_recv_length));
  const [requireRecvWeight, setRequireRecvWeight] = useState(Boolean(product?.require_recv_weight));
  const [requireRecvMasterCarton, setRequireRecvMasterCarton] = useState(Boolean(product?.require_recv_master_carton));
  const [requireRecvMasterCartonEan, setRequireRecvMasterCartonEan] = useState(Boolean(product?.require_recv_master_carton_ean));
  const [requireRecvMasterCartonQty, setRequireRecvMasterCartonQty] = useState(Boolean(product?.require_recv_master_carton_qty));
  const [requireRecvMasterCartonDims, setRequireRecvMasterCartonDims] = useState(Boolean(product?.require_recv_master_carton_dims));
  const [requireRecvMasterCartonWeight, setRequireRecvMasterCartonWeight] = useState(Boolean(product?.require_recv_master_carton_weight));

  const requireRecvDimensions =
    requireRecvHeight && requireRecvWidth && requireRecvLength;

  const applyRequireRecvPatch = (patch: Partial<Record<string, boolean>>) => {
    if (patch.requireDimensions !== undefined) {
      const v = patch.requireDimensions;
      setRequireRecvHeight(v);
      setRequireRecvWidth(v);
      setRequireRecvLength(v);
    }
    if (patch.requireWeight !== undefined) setRequireRecvWeight(patch.requireWeight);
    if (patch.requireBatch !== undefined) setTrackBatch(patch.requireBatch);
    if (patch.requireExpiry !== undefined) setTrackExpiry(patch.requireExpiry);
    if (patch.requireSerial !== undefined) setTrackSerial(patch.requireSerial);
    if (patch.requireMasterCarton !== undefined) setRequireRecvMasterCarton(patch.requireMasterCarton);
    if (patch.requireMasterCartonEan !== undefined) setRequireRecvMasterCartonEan(patch.requireMasterCartonEan);
    if (patch.requireMasterCartonQty !== undefined) setRequireRecvMasterCartonQty(patch.requireMasterCartonQty);
    if (patch.requireMasterCartonDims !== undefined) setRequireRecvMasterCartonDims(patch.requireMasterCartonDims);
    if (patch.requireMasterCartonWeight !== undefined) setRequireRecvMasterCartonWeight(patch.requireMasterCartonWeight);
  };

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!scrollToWmsValidation || activeTab !== "settings") return;
    const timer = window.setTimeout(() => {
      document.getElementById("wms-validation")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [scrollToWmsValidation, activeTab]);
  const [traceEditRow, setTraceEditRow] = useState<MagazynInvRowDisplay | null>(null);
  const [inventoryOverride, setInventoryOverride] = useState<ProductForm["inventory"] | null>(null);
  const [productTemplates, setProductTemplates] = useState<{ id: number; name: string }[]>([]);
  const [templatePreviewSvg, setTemplatePreviewSvg] = useState<string | null>(null);
  const [templatePreviewLoading, setTemplatePreviewLoading] = useState(false);

  const producerDisplayNameForGpsrHint = useMemo(() => {
    if (manufacturerId != null) {
      const row = manufacturersCatalog.find((x) => x.id === manufacturerId);
      const n = (row?.name ?? "").trim();
      if (n) return n;
    }
    return (manufacturer ?? "").trim();
  }, [manufacturerId, manufacturer, manufacturersCatalog]);

  const cheapestSupplierInsight = useMemo(() => {
    const priced = supplierLinkRows.filter(
      (r) => r.purchase_price != null && typeof r.purchase_price === "number" && Number.isFinite(r.purchase_price),
    );
    if (priced.length === 0) return null;
    return priced.reduce((a, b) => (b.purchase_price! < a.purchase_price! ? b : a));
  }, [supplierLinkRows]);

  const updateCartonDimension = useCallback(
    (which: "cartonLength" | "cartonWidth" | "cartonHeight", raw: string) => {
      const normalized = raw.trim().replace(",", ".");
      const num = normalized === "" ? "" : parseDecimal(normalized);
      const val = num === undefined ? "" : num;
      const L = which === "cartonLength" ? val : cartonLength;
      const W = which === "cartonWidth" ? val : cartonWidth;
      const H = which === "cartonHeight" ? val : cartonHeight;
      if (which === "cartonLength") setCartonLength(val);
      if (which === "cartonWidth") setCartonWidth(val);
      if (which === "cartonHeight") setCartonHeight(val);
      if (L !== "" && W !== "" && H !== "" && typeof L === "number" && typeof W === "number" && typeof H === "number") {
        setCartonVolume(round2((L * W * H) / 1000));
      } else {
        setCartonVolume("");
      }
    },
    [cartonLength, cartonWidth, cartonHeight, parseDecimal],
  );

  const physicalStockDisplay = useMemo(() => {
    if (isNew) return null;
    const q = product?.stock_quantity;
    if (q == null || Number.isNaN(Number(q))) return "—";
    return String(Math.round(Number(q)));
  }, [isNew, product?.stock_quantity]);

  useEffect(() => {
    setInventoryOverride(null);
  }, [product?.id]);

  const magazynInventoryRows = useMemo(() => {
    const inv = inventoryOverride ?? product?.inventory;
    if (!Array.isArray(inv) || inv.length === 0) return [];
    const rows = inv.map((row) => ({
      inventory_id: row.inventory_id ?? null,
      inventory_serial_ids: row.inventory_serial_ids ?? [],
      location_id: row.location_id,
      location_code: (row.location_code ?? "").trim() || "—",
      location_type: row.location_type ?? "UNKNOWN",
      quantity: Number(row.quantity) || 0,
      batch: row.batch ?? null,
      expiry: row.expiry ?? null,
      serial_range_label: row.serial_range_label ?? null,
      serial_numbers: row.serial_numbers ?? undefined,
      warehouse_id: row.warehouse_id,
      location_uuid: row.location_uuid ?? null,
      stock_disposition: row.stock_disposition ?? null,
      disposition_badge: row.disposition_badge ?? null,
      warehouse_carrier_id: row.warehouse_carrier_id ?? null,
      carrier_code: row.carrier_code ?? null,
      carrier_barcode: row.carrier_barcode ?? null,
      carrier_is_mixed: row.carrier_is_mixed ?? false,
    }));
    const dispRank = (d: string) => {
      const u = d.trim().toUpperCase();
      if (u === "SALEABLE" || u === "") return 0;
      if (u === "OUTLET_B") return 1;
      if (u === "SERVICE_C") return 2;
      if (u === "REJECTED_STOCK") return 3;
      return 9;
    };
    rows.sort((a, b) => {
      const loc = a.location_code.localeCompare(b.location_code, "pl");
      if (loc !== 0) return loc;
      const da = (a.stock_disposition ?? "SALEABLE").toUpperCase();
      const dispB = (b.stock_disposition ?? "SALEABLE").toUpperCase();
      const dr = dispRank(da) - dispRank(dispB);
      if (dr !== 0) return dr;
      return String(a.batch ?? "").localeCompare(String(b.batch ?? ""), "pl");
    });
    return rows;
  }, [inventoryOverride, product?.inventory]);

  const inventoryCrossViewMismatch = useMemo(() => {
    if (isNew || listStockHint == null || !Number.isFinite(listStockHint)) return false;
    const detailStock = product?.stock_quantity ?? 0;
    if (listStockHint > 0 && detailStock === 0) return true;
    if (listStockHint > 0 && magazynInventoryRows.length === 0 && !product?.locations_load_incomplete) {
      const unalloc = product?.unallocated_quantity ?? 0;
      if (unalloc < listStockHint) return true;
    }
    return false;
  }, [isNew, listStockHint, product?.stock_quantity, product?.locations_load_incomplete, product?.unallocated_quantity, magazynInventoryRows.length]);

  const magazynEmptyLocationsMessage = useMemo(() => {
    if (inventoryCrossViewMismatch) {
      return "Rozbieżność danych magazynowych między widokami";
    }
    if (magazynInventoryRows.length > 0) return "Brak stanu magazynowego";
    if (product?.locations_load_incomplete) {
      return "Dane lokalizacji nie zostały załadowane";
    }
    const unalloc = product?.unallocated_quantity;
    if (typeof unalloc === "number" && unalloc > 0) {
      return `Brak wierszy lokalizacji — ${unalloc} szt. nieprzypisanych (np. bufor / przyjęcie)`;
    }
    return "Brak stanu magazynowego";
  }, [inventoryCrossViewMismatch, magazynInventoryRows.length, product?.locations_load_incomplete, product?.unallocated_quantity]);

  const pricingDisplay = useMemo(
    () =>
      resolveProductPricingDisplay({
        currentCost,
        salePrice,
        purchasePrice,
        metadataVatRate: vatRate,
        extraCostPackagingNet,
        extraCostCommissionPercent,
        extraCostOtherNet,
      }),
    [
      currentCost,
      salePrice,
      purchasePrice,
      vatRate,
      extraCostPackagingNet,
      extraCostCommissionPercent,
      extraCostOtherNet,
    ],
  );

  const inventoryBreakdown = useMemo(() => {
    if (isNew) return null;
    const total = product?.stock_quantity;
    if (total == null || !Number.isFinite(Number(total))) return null;
    const allocated =
      product?.location_allocated_quantity ??
      magazynInventoryRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const unallocated =
      product?.unallocated_quantity ?? Math.max(0, Math.round(Number(total)) - Math.round(Number(allocated)));
    return {
      total: String(Math.round(Number(total))),
      allocated: String(Math.round(Number(allocated))),
      unallocated: String(Math.round(Number(unallocated))),
      reserved:
        product?.reserved_quantity != null && Number.isFinite(product.reserved_quantity)
          ? String(Math.round(product.reserved_quantity))
          : null,
      available:
        product?.available_quantity != null && Number.isFinite(product.available_quantity)
          ? String(Math.round(product.available_quantity))
          : null,
    };
  }, [isNew, product, magazynInventoryRows]);

  const productDimensions =
    typeof length === "number" && typeof width === "number" && typeof height === "number" && length > 0 && width > 0 && height > 0
      ? { depthCm: length, widthCm: width, heightCm: height }
      : undefined;

  useEffect(() => {
    if (product != null) {
      setTenantId(product.tenant_id ?? null);
      setName(product.name ?? "");
      setEan(product.ean ?? "");
      setSymbol(product.symbol ?? "");
      setLength(product.length ?? "");
      setWidth(product.width ?? "");
      setHeight(product.height ?? "");
      setWeight(product.weight ?? "");
      setVolume(product.volume != null ? round2(Number(product.volume)) : "");
      setImageUrl(product.image_url ?? "");
      setLabelTemplateId(product.label_template_id ?? null);
      setPurchasePrice(product.purchase_price ?? "");
      setExtraCostPackagingNet(product.extra_cost_packaging_net ?? 0);
      setExtraCostCommissionPercent(product.extra_cost_commission_percent ?? 0);
      setExtraCostOtherNet(product.extra_cost_other_net ?? 0);
      setPreviousPurchasePrice(product.previous_purchase_price ?? "");
      setPurchasePriceOriginal(product.purchase_price_original ?? "");
      setPurchaseCurrency(product.purchase_currency ?? null);
      setLastPurchaseDate(product.last_purchase_date ?? null);
      setLastPurchaseCurrency(product.last_purchase_currency ?? null);
      setLastSupplierName(product.last_supplier_brief?.name ?? null);
      setCurrentCost(product.current_cost ?? null);
      setSalePrice(product.sale_price != null && !Number.isNaN(Number(product.sale_price)) ? Number(product.sale_price) : "");
      setManufacturer(product.manufacturer ?? "");
      setManufacturerId(product.manufacturer_id ?? null);
      setDefaultSupplierId(product.default_supplier_id ?? null);
      setUnit(product.unit ?? "");
      const ui = parseProductUi(product.metadata_json ?? null);
      setResponsiblePerson(ui.responsible_person);
      setResponsiblePersonEmail(ui.responsible_person_email);
      setVatRate(ui.vat_rate);
      setPromotion(ui.promotion);
      setBulkEan((product.bulk_ean ?? "").trim());
      setUnitsPerCarton(
        product.units_per_carton != null && !Number.isNaN(Number(product.units_per_carton))
          ? Number(product.units_per_carton)
          : "",
      );
      setCartonLength(product.carton_length_cm != null && !Number.isNaN(Number(product.carton_length_cm)) ? Number(product.carton_length_cm) : "");
      setCartonWidth(product.carton_width_cm != null && !Number.isNaN(Number(product.carton_width_cm)) ? Number(product.carton_width_cm) : "");
      setCartonHeight(product.carton_height_cm != null && !Number.isNaN(Number(product.carton_height_cm)) ? Number(product.carton_height_cm) : "");
      setCartonWeight(product.carton_weight_kg != null && !Number.isNaN(Number(product.carton_weight_kg)) ? Number(product.carton_weight_kg) : "");
      setCartonVolume(
        product.carton_volume_dm3 != null && !Number.isNaN(Number(product.carton_volume_dm3)) ? round2(Number(product.carton_volume_dm3)) : "",
      );
      setOrientationType(parseOrient(product.product_orientation_type ?? product.orientation_type));
      setShapeType(parseShape(product.product_shape_type ?? product.shape_type));
      setStackBehavior(parseStackBehavior(product.product_stack_behavior ?? product.stack_behavior));
      setStackCompressible(product.product_stack_compressible ?? product.stack_compressible ?? false);
      setCompressedHeightCm(
        (() => {
          const ch = product.product_compressed_height_cm ?? product.compressed_height_cm;
          return ch != null && ch > 0 ? ch : "";
        })(),
      );
      setMaxStackWeight(
        (() => {
          const mw = product.product_max_stack_weight ?? product.max_stack_weight;
          return mw != null && mw > 0 ? mw : "";
        })(),
      );
      setCartonOrientationType(parseOrient(product.carton_orientation_type));
      setCartonShapeType(parseShape(product.carton_shape_type));
      setCartonStackBehavior(parseStackBehavior(product.carton_stack_behavior));
      setCartonStackCompressible(product.carton_stack_compressible ?? false);
      setCartonCompressedHeightCm(
        product.carton_compressed_height_cm != null && product.carton_compressed_height_cm > 0 ? product.carton_compressed_height_cm : "",
      );
      setCartonMaxStackWeight(
        product.carton_max_stack_weight != null && product.carton_max_stack_weight > 0 ? product.carton_max_stack_weight : "",
      );
      setMinPickQuantity(
        product.min_pick_quantity != null && !Number.isNaN(Number(product.min_pick_quantity)) ? Number(product.min_pick_quantity) : "",
      );
      setMaxPickQuantity(
        product.max_pick_quantity != null && !Number.isNaN(Number(product.max_pick_quantity)) ? Number(product.max_pick_quantity) : "",
      );
      setMinReserveQuantity(
        product.min_reserve_quantity != null && !Number.isNaN(Number(product.min_reserve_quantity))
          ? Number(product.min_reserve_quantity)
          : "",
      );
      setMaxReserveQuantity(
        product.max_reserve_quantity != null && !Number.isNaN(Number(product.max_reserve_quantity))
          ? Number(product.max_reserve_quantity)
          : "",
      );
      setEnableStockAlert(Boolean(product.enable_stock_alert));
      setMinTotalStock(
        product.min_total_stock != null && !Number.isNaN(Number(product.min_total_stock)) ? Number(product.min_total_stock) : "",
      );
      setTrackBatch(Boolean(product.track_batch));
      setTrackExpiry(Boolean(product.track_expiry));
      setTrackSerial(Boolean(product.track_serial));
      setRequireRecvHeight(Boolean(product.require_recv_height));
      setRequireRecvWidth(Boolean(product.require_recv_width));
      setRequireRecvLength(Boolean(product.require_recv_length));
      setRequireRecvWeight(Boolean(product.require_recv_weight));
      setRequireRecvMasterCarton(Boolean(product.require_recv_master_carton));
      setRequireRecvMasterCartonEan(Boolean(product.require_recv_master_carton_ean));
      setRequireRecvMasterCartonQty(Boolean(product.require_recv_master_carton_qty));
      setRequireRecvMasterCartonDims(Boolean(product.require_recv_master_carton_dims));
      setRequireRecvMasterCartonWeight(Boolean(product.require_recv_master_carton_weight));
    } else {
      setPurchasePrice("");
      setExtraCostPackagingNet(0);
      setExtraCostCommissionPercent(0);
      setExtraCostOtherNet(0);
      setPreviousPurchasePrice("");
      setPurchasePriceOriginal("");
      setPurchaseCurrency(null);
      setLastPurchaseDate(null);
      setLastPurchaseCurrency(null);
      setLastSupplierName(null);
      setCurrentCost(null);
      setSalePrice("");
      setManufacturer("");
      setManufacturerId(null);
      setDefaultSupplierId(null);
      setResponsiblePerson("");
      setResponsiblePersonEmail("");
      setVatRate("");
      setPromotion("");
      setBulkEan("");
      setUnitsPerCarton("");
      setCartonLength("");
      setCartonWidth("");
      setCartonHeight("");
      setCartonWeight("");
      setCartonVolume("");
      setMinPickQuantity("");
      setMaxPickQuantity("");
      setMinReserveQuantity("");
      setMaxReserveQuantity("");
      setEnableStockAlert(false);
      setMinTotalStock("");
      setTrackBatch(false);
      setTrackExpiry(false);
      setOrientationType("any");
      setShapeType("box");
      setStackBehavior("stackable");
      setStackCompressible(false);
      setCompressedHeightCm("");
      setMaxStackWeight("");
      setCartonOrientationType("any");
      setCartonShapeType("box");
      setCartonStackBehavior("stackable");
      setCartonStackCompressible(false);
      setCartonCompressedHeightCm("");
      setCartonMaxStackWeight("");
    }
  }, [
    product?.id,
    product?.purchase_price,
    product?.extra_cost_packaging_net,
    product?.extra_cost_commission_percent,
    product?.extra_cost_other_net,
    product?.previous_purchase_price,
    product?.purchase_price_original,
    product?.purchase_currency,
    product?.last_purchase_date,
    product?.last_purchase_currency,
    product?.last_supplier_brief,
    product?.current_cost,
  ]);

  useEffect(() => {
    if (tenantId == null || tenantId < 1) {
      setManufacturersCatalog([]);
      setSuppliersCatalog([]);
      return;
    }
    void listManufacturers({ tenantId, status: "all" })
      .then(setManufacturersCatalog)
      .catch(() => setManufacturersCatalog([]));
    void listSuppliers(tenantId, { status: "all" })
      .then(setSuppliersCatalog)
      .catch(() => setSuppliersCatalog([]));
  }, [tenantId]);

  useEffect(() => {
    api
      .get<{ id: number; name: string }[]>("/labels/templates/by-type/product", {
        params: { tenant_id: 1 },
      })
      .then((res) => setProductTemplates(Array.isArray(res.data) ? res.data : []))
      .catch(() => setProductTemplates([]));
  }, []);

  useEffect(() => {
    if (labelTemplateId == null) {
      setTemplatePreviewSvg(null);
      setTemplatePreviewLoading(false);
      return;
    }
    setTemplatePreviewLoading(true);
    setTemplatePreviewSvg(null);
    api
      .get<{ svg: string }>(`/label-templates/${labelTemplateId}/preview`, { params: { tenant_id: 1 } })
      .then((res) => setTemplatePreviewSvg(res.data?.svg ?? null))
      .catch(() => setTemplatePreviewSvg(null))
      .finally(() => setTemplatePreviewLoading(false));
  }, [labelTemplateId]);

  const reloadProductSupplierLinks = useCallback(async () => {
    const tid = tenantId;
    const pid = product?.id;
    if (isNew || tid == null || tid < 1 || pid == null) {
      setSupplierLinkRows([]);
      return;
    }
    setSupplierLinksBusy(true);
    try {
      const rows = await listSupplierProductLinks(tid, { product_id: pid });
      setSupplierLinkRows(
        rows.map((r) => ({
          id: r.id,
          supplier_id: r.supplier_id,
          supplier_name: r.supplier_name,
          purchase_price: r.purchase_price ?? null,
          is_default: r.is_default_supplier,
        })),
      );
    } catch {
      setSupplierLinkRows([]);
    } finally {
      setSupplierLinksBusy(false);
    }
  }, [isNew, tenantId, product?.id]);

  useEffect(() => {
    void reloadProductSupplierLinks();
  }, [reloadProductSupplierLinks]);

  useEffect(() => {
    if (product == null) {
      setLabelData({});
      setProductImages([]);
      return;
    }
    const meta = product.metadata_json;
    setLabelData(parseLabelData(meta));
    let imgs = parseProductImages(meta);
    if (imgs.length === 0 && (product.image_url ?? "").trim()) {
      imgs = [
        {
          id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `img-${Date.now()}`,
          image_url: (product.image_url ?? "").trim(),
          is_main: true,
          sort_order: 0,
        },
      ];
    } else {
      imgs = ensureSingleMainImage(imgs);
    }
    setProductImages(imgs);
  }, [isNew, product?.id, product?.image_url, product?.metadata_json]);

  const manufacturerForLabel = useMemo(
    () => (manufacturerId != null ? manufacturersCatalog.find((x) => x.id === manufacturerId) : undefined),
    [manufacturerId, manufacturersCatalog],
  );
  const manufacturerReadonly = useMemo(() => manufacturerLabelBlock(manufacturerForLabel), [manufacturerForLabel]);

  const sidebarPreviewUrl = useMemo(
    () => pickMainImageUrl(ensureSingleMainImage(productImages), image_url) ?? "",
    [productImages, image_url],
  );

  const addGalleryFromUrl = useCallback(() => {
    const u = newGalleryUrl.trim();
    if (!u) return;
    setProductImages((prev) => {
      const sorted = ensureSingleMainImage(prev);
      const next: ProductImageEntry[] = [
        ...sorted,
        {
          id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `img-${Date.now()}-${Math.random()}`,
          image_url: u,
          is_main: sorted.length === 0,
          sort_order: sorted.length,
        },
      ];
      return ensureSingleMainImage(next);
    });
    setNewGalleryUrl("");
  }, [newGalleryUrl]);

  const onGalleryFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    setGalleryUploadBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await api.post<{ url: string }>("/uploads", fd);
      const url = (res.data?.url ?? "").trim();
      if (!url) return;
      setProductImages((prev) => {
        const sorted = ensureSingleMainImage(prev);
        const next: ProductImageEntry[] = [
          ...sorted,
          {
            id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `img-${Date.now()}`,
            image_url: url,
            is_main: sorted.length === 0,
            sort_order: sorted.length,
          },
        ];
        return ensureSingleMainImage(next);
      });
    } catch {
      window.alert("Nie udało się wgrać zdjęcia (POST /api/uploads).");
    } finally {
      setGalleryUploadBusy(false);
    }
  }, []);

  const setGalleryMain = useCallback((id: string) => {
    setProductImages((prev) => ensureSingleMainImage(prev.map((x) => ({ ...x, is_main: x.id === id }))));
  }, []);

  const removeGalleryImage = useCallback((id: string) => {
    setProductImages((prev) => ensureSingleMainImage(prev.filter((x) => x.id !== id)));
  }, []);

  const moveGalleryImage = useCallback((id: string, dir: -1 | 1) => {
    setProductImages((prev) => {
      const s = [...prev].sort((a, b) => a.sort_order - b.sort_order);
      const i = s.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.length) return prev;
      const t = s[i];
      s[i] = s[j];
      s[j] = t;
      return ensureSingleMainImage(s.map((img, idx) => ({ ...img, sort_order: idx })));
    });
  }, []);

  useEffect(() => {
    if (isNew || tenantId == null || warehouse?.id == null) {
      setCanManualAdjustStock(false);
      return;
    }
    let cancelled = false;
    void getInventoryManagementSettings({ tenantId, warehouseId: warehouse.id })
      .then((s) => {
        if (!cancelled) setCanManualAdjustStock(Boolean(s.can_manual_adjust_stock));
      })
      .catch(() => {
        if (!cancelled) setCanManualAdjustStock(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isNew, tenantId, warehouse?.id]);

  const reloadProductAfterStockCorrection = useCallback(async () => {
    if (!product?.id || tenantId == null) return;
    try {
      const params: Record<string, number> = { tenant_id: tenantId };
      if (warehouse?.id) params.warehouse_id = warehouse.id;
      const res = await api.get<ProductForm>(`/products/${product.id}/`, { params });
      onSave(res.data);
    } catch {
      /* parent list may refresh on next navigation */
    }
  }, [onSave, product?.id, tenantId, warehouse?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNew && (tenantId == null || tenantId < 1)) {
      alert("Wybierz tenant przy tworzeniu produktu.");
      return;
    }
    const minPickVal = minPickQuantity === "" ? null : parseNumber(minPickQuantity);
    const maxPickVal = maxPickQuantity === "" ? null : parseNumber(maxPickQuantity);
    if (minPickVal != null && minPickVal < 0) {
      alert("Minimalna ilość musi być ≥ 0.");
      return;
    }
    if (maxPickVal != null && maxPickVal < 0) {
      alert("Maksymalna ilość musi być ≥ 0.");
      return;
    }
    if (minPickVal != null && maxPickVal != null && minPickVal > maxPickVal) {
      alert("Minimalna ilość nie może być większa od maksymalnej.");
      return;
    }
    const minReserveVal = minReserveQuantity === "" ? null : parseNumber(minReserveQuantity);
    const maxReserveVal = maxReserveQuantity === "" ? null : parseNumber(maxReserveQuantity);
    if (minReserveVal != null && minReserveVal < 0) {
      alert("Minimalna rezerwa musi być ≥ 0.");
      return;
    }
    if (maxReserveVal != null && maxReserveVal < 0) {
      alert("Maksymalna rezerwa musi być ≥ 0.");
      return;
    }
    if (minReserveVal != null && maxReserveVal != null && minReserveVal > maxReserveVal) {
      alert("Minimalna rezerwa nie może być większa od maksymalnej.");
      return;
    }
    const minTotalVal = minTotalStock === "" ? null : parseNumber(minTotalStock);
    if (minTotalVal != null && minTotalVal < 0) {
      alert("Próg alarmu (łączny stan) musi być ≥ 0.");
      return;
    }
    if (enableStockAlert && minTotalVal == null) {
      alert("Włączając alarm, podaj minimalny łączny stan produktu.");
      return;
    }
    setSaving(true);
    try {
      const len = parseDecimal(length);
      const wid = parseDecimal(width);
      const hei = parseDecimal(height);
      const wgt = parseDecimal(weight);
      const vol = parseDecimal(volume);
      const purchasePriceVal = purchasePrice === "" ? undefined : typeof purchasePrice === "number" ? purchasePrice : parseDecimal(String(purchasePrice));
      const salePriceVal = salePrice === "" ? undefined : typeof salePrice === "number" ? salePrice : parseDecimal(String(salePrice));

      const imagesForMeta = ensureSingleMainImage(productImages);
      const metaStr = buildProductMetadataJson(product?.metadata_json ?? null, {
        productUi: {
          responsible_person: responsiblePerson,
          responsible_person_email: responsiblePersonEmail,
          vat_rate: vatRate,
          promotion,
        },
        labelData,
        productImages: imagesForMeta,
      });
      const mainImgResolved = pickMainImageUrl(imagesForMeta, image_url);

      const payload: ProductForm = {
        name: name.trim(),
        ean: ean.trim(),
        symbol: symbol.trim(),
        length: len != null ? round2(len) : undefined,
        width: wid != null ? round2(wid) : undefined,
        height: hei != null ? round2(hei) : undefined,
        weight: wgt != null ? round3(wgt) : undefined,
        volume: vol != null ? round2(vol) : undefined,
        image_url: mainImgResolved,
        label_template_id: labelTemplateId ?? undefined,
        purchase_price: purchasePriceVal ?? null,
        extra_cost_packaging_net: parseNumber(extraCostPackagingNet) ?? 0,
        extra_cost_commission_percent: parseNumber(extraCostCommissionPercent) ?? 0,
        extra_cost_other_net: parseNumber(extraCostOtherNet) ?? 0,
        sale_price: salePriceVal ?? null,
        manufacturer_id: manufacturerId,
        default_supplier_id: defaultSupplierId,
        manufacturer: manufacturer.trim() || undefined,
        unit: unit.trim() || undefined,
        product_orientation_type: orientationType,
        product_shape_type: shapeType,
        product_stack_compressible: stackCompressible,
        product_compressed_height_cm:
          compressedHeightCm === "" ? undefined : typeof compressedHeightCm === "number" ? compressedHeightCm : parseDecimal(String(compressedHeightCm)) ?? undefined,
        product_max_stack_weight:
          maxStackWeight === "" ? undefined : typeof maxStackWeight === "number" ? maxStackWeight : parseDecimal(String(maxStackWeight)) ?? undefined,
        product_stack_behavior: stackBehavior,
        orientation_type: orientationType,
        shape_type: shapeType,
        stack_compressible: stackCompressible,
        compressed_height_cm:
          compressedHeightCm === "" ? undefined : typeof compressedHeightCm === "number" ? compressedHeightCm : parseDecimal(String(compressedHeightCm)) ?? undefined,
        max_stack_weight:
          maxStackWeight === "" ? undefined : typeof maxStackWeight === "number" ? maxStackWeight : parseDecimal(String(maxStackWeight)) ?? undefined,
        stack_behavior: stackBehavior,
        carton_orientation_type: cartonOrientationType,
        carton_shape_type: cartonShapeType,
        carton_stack_compressible: cartonStackCompressible,
        carton_compressed_height_cm:
          cartonCompressedHeightCm === ""
            ? undefined
            : typeof cartonCompressedHeightCm === "number"
              ? cartonCompressedHeightCm
              : parseDecimal(String(cartonCompressedHeightCm)) ?? undefined,
        carton_max_stack_weight:
          cartonMaxStackWeight === ""
            ? undefined
            : typeof cartonMaxStackWeight === "number"
              ? cartonMaxStackWeight
              : parseDecimal(String(cartonMaxStackWeight)) ?? undefined,
        carton_stack_behavior: cartonStackBehavior,
        min_pick_quantity: minPickVal ?? undefined,
        max_pick_quantity: maxPickVal ?? undefined,
        min_reserve_quantity: minReserveVal ?? undefined,
        max_reserve_quantity: maxReserveVal ?? undefined,
        enable_stock_alert: enableStockAlert,
        ...(enableStockAlert && minTotalVal != null ? { min_total_stock: minTotalVal } : {}),
        track_batch: trackBatch,
        track_expiry: trackExpiry,
        track_serial: trackSerial,
        require_recv_height: requireRecvHeight,
        require_recv_width: requireRecvWidth,
        require_recv_length: requireRecvLength,
        require_recv_weight: requireRecvWeight,
        require_recv_master_carton: requireRecvMasterCarton,
        require_recv_master_carton_ean: requireRecvMasterCartonEan,
        require_recv_master_carton_qty: requireRecvMasterCartonQty,
        require_recv_master_carton_dims: requireRecvMasterCartonDims,
        require_recv_master_carton_weight: requireRecvMasterCartonWeight,
        bulk_ean: bulkEan.trim() || null,
        units_per_carton: unitsPerCarton === "" ? null : parseNumber(unitsPerCarton),
        carton_length_cm: cartonLength === "" ? undefined : typeof cartonLength === "number" ? round2(cartonLength) : parseDecimal(String(cartonLength)),
        carton_width_cm: cartonWidth === "" ? undefined : typeof cartonWidth === "number" ? round2(cartonWidth) : parseDecimal(String(cartonWidth)),
        carton_height_cm: cartonHeight === "" ? undefined : typeof cartonHeight === "number" ? round2(cartonHeight) : parseDecimal(String(cartonHeight)),
        carton_weight_kg: cartonWeight === "" ? undefined : typeof cartonWeight === "number" ? round3(cartonWeight) : parseDecimal(String(cartonWeight)),
        carton_volume_dm3: cartonVolume === "" ? undefined : typeof cartonVolume === "number" ? round2(cartonVolume) : parseDecimal(String(cartonVolume)),
      };

      const body: Record<string, unknown> = {
        name: payload.name,
        ean: payload.ean ?? "",
        symbol: payload.symbol ?? "",
        length_cm: parseNumber(length) ?? undefined,
        width_cm: parseNumber(width) ?? undefined,
        height_cm: parseNumber(height) ?? undefined,
        weight_kg: parseNumber(weight) ?? undefined,
        volume_dm3: parseNumber(volume) ?? undefined,
        image_url: mainImgResolved,
        tenant_id: tenantId,
        label_template_id: labelTemplateId ?? undefined,
        purchase_price: parseNumber(purchasePrice) ?? undefined,
        extra_cost_packaging_net: parseNumber(extraCostPackagingNet) ?? 0,
        extra_cost_commission_percent: parseNumber(extraCostCommissionPercent) ?? 0,
        extra_cost_other_net: parseNumber(extraCostOtherNet) ?? 0,
        sale_price: parseNumber(salePrice) ?? undefined,
        manufacturer_id: manufacturerId,
        default_supplier_id: defaultSupplierId,
        manufacturer: payload.manufacturer ?? null,
        unit: payload.unit ?? null,
        product_orientation_type: orientationType,
        product_shape_type: shapeType,
        product_stack_compressible: stackCompressible,
        product_compressed_height_cm: compressedHeightCm === "" ? undefined : parseNumber(compressedHeightCm) ?? undefined,
        product_max_stack_weight: maxStackWeight === "" ? undefined : parseNumber(maxStackWeight) ?? undefined,
        product_stack_behavior: stackBehavior,
        carton_orientation_type: cartonOrientationType,
        carton_shape_type: cartonShapeType,
        carton_stack_compressible: cartonStackCompressible,
        carton_compressed_height_cm: cartonCompressedHeightCm === "" ? undefined : parseNumber(cartonCompressedHeightCm) ?? undefined,
        carton_max_stack_weight: cartonMaxStackWeight === "" ? undefined : parseNumber(cartonMaxStackWeight) ?? undefined,
        carton_stack_behavior: cartonStackBehavior,
        min_pick_quantity: minPickVal ?? undefined,
        max_pick_quantity: maxPickVal ?? undefined,
        min_reserve_quantity: minReserveVal ?? undefined,
        max_reserve_quantity: maxReserveVal ?? undefined,
        enable_stock_alert: enableStockAlert,
        track_batch: trackBatch,
        track_expiry: trackExpiry,
        track_serial: trackSerial,
        require_recv_height: requireRecvHeight,
        require_recv_width: requireRecvWidth,
        require_recv_length: requireRecvLength,
        require_recv_weight: requireRecvWeight,
        require_recv_master_carton: requireRecvMasterCarton,
        require_recv_master_carton_ean: requireRecvMasterCartonEan,
        require_recv_master_carton_qty: requireRecvMasterCartonQty,
        require_recv_master_carton_dims: requireRecvMasterCartonDims,
        require_recv_master_carton_weight: requireRecvMasterCartonWeight,
      };
      if (enableStockAlert) {
        body.min_total_stock = minTotalVal;
      }
      body.bulk_ean = bulkEan.trim() || null;
      body.units_per_carton = unitsPerCarton === "" ? null : parseNumber(unitsPerCarton);
      body.carton_length_cm = cartonLength === "" ? null : parseNumber(cartonLength);
      body.carton_width_cm = cartonWidth === "" ? null : parseNumber(cartonWidth);
      body.carton_height_cm = cartonHeight === "" ? null : parseNumber(cartonHeight);
      body.carton_weight_kg = cartonWeight === "" ? null : parseNumber(cartonWeight);
      body.carton_volume_dm3 = cartonVolume === "" ? null : parseNumber(cartonVolume);
      if (metaStr != null) {
        body.metadata_json = metaStr;
      }

      log("Payload:", payload);

      if (isNew) {
        const res = await api.post("/products/", body, { params: { tenant_id: tenantId } });
        const d = res.data as Record<string, unknown> | undefined;
        onSave({
          ...payload,
          id: res.data?.id ?? undefined,
          manufacturer_id: (res.data as { manufacturer_id?: number | null })?.manufacturer_id ?? payload.manufacturer_id ?? null,
          manufacturer: (res.data as { manufacturer?: string | null })?.manufacturer ?? payload.manufacturer,
          gpsr_responsible_name: (res.data as { gpsr_responsible_name?: string | null })?.gpsr_responsible_name ?? undefined,
          gpsr_responsible_email: (res.data as { gpsr_responsible_email?: string | null })?.gpsr_responsible_email ?? undefined,
          manufacturer_brief: (res.data as { manufacturer_brief?: ProductForm["manufacturer_brief"] })?.manufacturer_brief ?? undefined,
          default_supplier_id: (res.data as { default_supplier_id?: number | null })?.default_supplier_id ?? payload.default_supplier_id ?? null,
          default_supplier_brief: (res.data as { default_supplier_brief?: ProductForm["default_supplier_brief"] })?.default_supplier_brief ?? undefined,
          stock_quantity: res.data?.stock_quantity,
          enable_stock_alert: Boolean(res.data?.enable_stock_alert),
          min_total_stock: res.data?.min_total_stock != null ? Number(res.data.min_total_stock) : null,
          metadata_json: res.data?.metadata_json ?? (metaStr ? (JSON.parse(metaStr) as Record<string, unknown>) : null),
          bulk_ean: d?.bulk_ean != null ? String(d.bulk_ean).trim() || null : payload.bulk_ean,
          units_per_carton: d?.units_per_carton != null ? Number(d.units_per_carton) : payload.units_per_carton,
          carton_length_cm: d?.carton_length_cm != null ? Number(d.carton_length_cm) : payload.carton_length_cm,
          carton_width_cm: d?.carton_width_cm != null ? Number(d.carton_width_cm) : payload.carton_width_cm,
          carton_height_cm: d?.carton_height_cm != null ? Number(d.carton_height_cm) : payload.carton_height_cm,
          carton_weight_kg: d?.carton_weight_kg != null ? Number(d.carton_weight_kg) : payload.carton_weight_kg,
          carton_volume_dm3: d?.carton_volume_dm3 != null ? Number(d.carton_volume_dm3) : payload.carton_volume_dm3,
          track_batch: Boolean(d?.track_batch ?? payload.track_batch),
          track_expiry: Boolean(d?.track_expiry ?? payload.track_expiry),
          product_orientation_type: parseOrient(d?.product_orientation_type ?? d?.orientation_type),
          product_shape_type: parseShape(d?.product_shape_type ?? d?.shape_type),
          product_stack_compressible: Boolean(d?.product_stack_compressible ?? d?.stack_compressible),
          product_compressed_height_cm:
            d?.product_compressed_height_cm != null ? Number(d.product_compressed_height_cm) : payload.product_compressed_height_cm,
          product_max_stack_weight:
            d?.product_max_stack_weight != null ? Number(d.product_max_stack_weight) : payload.product_max_stack_weight,
          product_stack_behavior: parseStackBehavior(d?.product_stack_behavior ?? d?.stack_behavior),
          orientation_type: parseOrient(d?.product_orientation_type ?? d?.orientation_type),
          shape_type: parseShape(d?.product_shape_type ?? d?.shape_type),
          stack_compressible: Boolean(d?.product_stack_compressible ?? d?.stack_compressible),
          compressed_height_cm:
            d?.product_compressed_height_cm != null ? Number(d.product_compressed_height_cm) : payload.compressed_height_cm,
          max_stack_weight: d?.product_max_stack_weight != null ? Number(d.product_max_stack_weight) : payload.max_stack_weight,
          stack_behavior: parseStackBehavior(d?.product_stack_behavior ?? d?.stack_behavior),
          carton_orientation_type: parseOrient(d?.carton_orientation_type),
          carton_shape_type: parseShape(d?.carton_shape_type),
          carton_stack_compressible: Boolean(d?.carton_stack_compressible),
          carton_compressed_height_cm:
            d?.carton_compressed_height_cm != null ? Number(d.carton_compressed_height_cm) : payload.carton_compressed_height_cm,
          carton_max_stack_weight:
            d?.carton_max_stack_weight != null ? Number(d.carton_max_stack_weight) : payload.carton_max_stack_weight,
          carton_stack_behavior: parseStackBehavior(d?.carton_stack_behavior),
          locations: parseLocationsFromApi(d?.locations),
          inventory: parseInventoryFromApi(d?.inventory),
          current_cost:
            d?.current_cost && typeof d.current_cost === "object" ? (d.current_cost as ProductForm["current_cost"]) : payload.current_cost,
        });
      } else {
        const productId = Number(product!.id);
        if (!Number.isInteger(productId) || productId < 1) {
          toast.error("Błąd zapisu produktu");
          return;
        }
        const res = await api.put(`/products/${productId}/`, body, { params: { tenant_id: tenantId } });
        const d = res.data as Record<string, unknown> | undefined;
        onSave({
          ...payload,
          id: product!.id,
          manufacturer_id: (res.data as { manufacturer_id?: number | null })?.manufacturer_id ?? payload.manufacturer_id ?? null,
          manufacturer: (res.data as { manufacturer?: string | null })?.manufacturer ?? payload.manufacturer,
          gpsr_responsible_name: (res.data as { gpsr_responsible_name?: string | null })?.gpsr_responsible_name ?? undefined,
          gpsr_responsible_email: (res.data as { gpsr_responsible_email?: string | null })?.gpsr_responsible_email ?? undefined,
          manufacturer_brief: (res.data as { manufacturer_brief?: ProductForm["manufacturer_brief"] })?.manufacturer_brief ?? undefined,
          default_supplier_id: (res.data as { default_supplier_id?: number | null })?.default_supplier_id ?? payload.default_supplier_id ?? null,
          default_supplier_brief: (res.data as { default_supplier_brief?: ProductForm["default_supplier_brief"] })?.default_supplier_brief ?? undefined,
          stock_quantity: res.data?.stock_quantity ?? (physicalStockDisplay != null ? Number(physicalStockDisplay) : undefined),
          sale_price: res.data?.sale_price != null ? Number(res.data.sale_price) : payload.sale_price,
          enable_stock_alert: Boolean(res.data?.enable_stock_alert),
          min_total_stock: res.data?.min_total_stock != null ? Number(res.data.min_total_stock) : null,
          metadata_json: res.data?.metadata_json ?? (metaStr ? (JSON.parse(metaStr) as Record<string, unknown>) : product?.metadata_json ?? null),
          bulk_ean: d?.bulk_ean != null ? String(d.bulk_ean).trim() || null : payload.bulk_ean,
          units_per_carton: d?.units_per_carton != null ? Number(d.units_per_carton) : payload.units_per_carton,
          carton_length_cm: d?.carton_length_cm != null ? Number(d.carton_length_cm) : payload.carton_length_cm,
          carton_width_cm: d?.carton_width_cm != null ? Number(d.carton_width_cm) : payload.carton_width_cm,
          carton_height_cm: d?.carton_height_cm != null ? Number(d.carton_height_cm) : payload.carton_height_cm,
          carton_weight_kg: d?.carton_weight_kg != null ? Number(d.carton_weight_kg) : payload.carton_weight_kg,
          carton_volume_dm3: d?.carton_volume_dm3 != null ? Number(d.carton_volume_dm3) : payload.carton_volume_dm3,
          track_batch: Boolean(d?.track_batch ?? payload.track_batch),
          track_expiry: Boolean(d?.track_expiry ?? payload.track_expiry),
          product_orientation_type: parseOrient(d?.product_orientation_type ?? d?.orientation_type),
          product_shape_type: parseShape(d?.product_shape_type ?? d?.shape_type),
          current_cost:
            d?.current_cost && typeof d.current_cost === "object" ? (d.current_cost as ProductForm["current_cost"]) : payload.current_cost,
          product_stack_compressible: Boolean(d?.product_stack_compressible ?? d?.stack_compressible),
          product_compressed_height_cm:
            d?.product_compressed_height_cm != null ? Number(d.product_compressed_height_cm) : payload.product_compressed_height_cm,
          product_max_stack_weight:
            d?.product_max_stack_weight != null ? Number(d.product_max_stack_weight) : payload.product_max_stack_weight,
          product_stack_behavior: parseStackBehavior(d?.product_stack_behavior ?? d?.stack_behavior),
          orientation_type: parseOrient(d?.product_orientation_type ?? d?.orientation_type),
          shape_type: parseShape(d?.product_shape_type ?? d?.shape_type),
          stack_compressible: Boolean(d?.product_stack_compressible ?? d?.stack_compressible),
          compressed_height_cm:
            d?.product_compressed_height_cm != null ? Number(d.product_compressed_height_cm) : payload.compressed_height_cm,
          max_stack_weight: d?.product_max_stack_weight != null ? Number(d.product_max_stack_weight) : payload.max_stack_weight,
          stack_behavior: parseStackBehavior(d?.product_stack_behavior ?? d?.stack_behavior),
          carton_orientation_type: parseOrient(d?.carton_orientation_type),
          carton_shape_type: parseShape(d?.carton_shape_type),
          carton_stack_compressible: Boolean(d?.carton_stack_compressible),
          carton_compressed_height_cm:
            d?.carton_compressed_height_cm != null ? Number(d.carton_compressed_height_cm) : payload.carton_compressed_height_cm,
          carton_max_stack_weight:
            d?.carton_max_stack_weight != null ? Number(d.carton_max_stack_weight) : payload.carton_max_stack_weight,
          carton_stack_behavior: parseStackBehavior(d?.carton_stack_behavior),
          locations: parseLocationsFromApi(d?.locations) ?? product?.locations,
          inventory: parseInventoryFromApi(d?.inventory) ?? product?.inventory,
        });
      }
      toast.success("Zapisano produkt");
      onClose();
    } catch (err: unknown) {
      console.error("Product save failed:", err);
      const msg =
        err && typeof err === "object" && "response" in err ? (err as { response?: { status?: number; data?: unknown } }).response?.data : null;
      const status =
        err && typeof err === "object" && "response" in err ? (err as { response?: { status?: number } }).response?.status : null;
      if (status === 400 && isStockQuantityWriteBlockedError(msg)) {
        toast.error("Zapis zablokowany: trwa inwentaryzacja w tej lokalizacji.");
        return;
      }
      toast.error("Wystąpił błąd podczas zapisu produktu.");
    } finally {
      setSaving(false);
    }
  };

  const inputTableMini =
    "w-full min-w-[4rem] rounded border border-slate-200 px-2 py-1 text-right text-sm tabular-nums focus:border-blue-400 focus:ring-1 focus:ring-blue-500";

  const onPatchSupplierLinkPrice = async (linkId: number, raw: string) => {
    const t = raw.trim().replace(",", ".");
    const n: number | null = t === "" ? null : Number(t);
    if (t !== "" && (n === null || !Number.isFinite(n) || n < 0)) return;
    if (tenantId == null) return;
    setSupplierLinksBusy(true);
    try {
      await patchSupplierProductLink(tenantId, linkId, { purchase_price: n });
      await reloadProductSupplierLinks();
    } finally {
      setSupplierLinksBusy(false);
    }
  };

  const onAddSupplierLink = async () => {
    const sid = Number(addSupplierPick);
    if (!Number.isFinite(sid) || sid < 1 || tenantId == null || product?.id == null) return;
    if (supplierLinkRows.some((r) => r.supplier_id === sid)) return;
    const pp = typeof purchasePrice === "number" ? purchasePrice : null;
    setSupplierLinksBusy(true);
    try {
      await createSupplierProductLink({
        tenant_id: tenantId,
        supplier_id: sid,
        product_id: product.id,
        purchase_price: pp,
        lead_time_days: null,
        min_order_qty: null,
      });
      setAddSupplierPick("");
      await reloadProductSupplierLinks();
    } catch (e: unknown) {
      const d =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : null;
      window.alert(d != null ? String(d) : "Nie udało się dodać dostawcy.");
    } finally {
      setSupplierLinksBusy(false);
    }
  };

  const onRemoveSupplierLink = async (linkId: number, supId: number) => {
    if (!window.confirm("Usunąć dostawcę z tego produktu?")) return;
    if (tenantId == null) return;
    setSupplierLinksBusy(true);
    try {
      await deleteSupplierProductLink(tenantId, linkId);
      if (defaultSupplierId === supId) setDefaultSupplierId(null);
      await reloadProductSupplierLinks();
    } finally {
      setSupplierLinksBusy(false);
    }
  };

  useEffect(() => {
    if (isNew || tenantId == null || tenantId < 1 || product?.id == null) {
      setProductionTabVisible(false);
      return;
    }
    let cancelled = false;
    void listCompositionsForProduct(tenantId, Number(product.id))
      .then((rows) => {
        if (!cancelled && rows.length > 0) setProductionTabVisible(true);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [isNew, tenantId, product?.id]);

  const railTabOrder = useMemo((): TabId[] => {
    const base: TabId[] = ["basic", "prices", "warehouse", "images", "offers", "labelSheet"];
    if (!isNew) return [...base.slice(0, 3), "production", ...base.slice(3)];
    return base;
  }, [isNew]);

  const railLabel: Record<TabId, string> = {
    basic: "Podstawowe",
    prices: "Ceny",
    warehouse: "Magazyn",
    images: "Zdjęcia",
    offers: "Oferty",
    labelSheet: "Etykieta",
    // Nieużywane w górnym menu, ale typ wymaga ich obecności:
    suppliers: "Dostawcy",
    warehouseOps: "Operacje magazynowe",
    logistics: "Logistyka",
    settings: "Ustawienia",
    production: "Produkcja",
  };

  // Tego fragmentu zabrakło:
  const railIcon: Record<TabId, LucideIcon> = {
    basic: LayoutList,
    suppliers: Building2,
    labelSheet: Printer,
    images: ImageIcon,
    prices: Tag,
    warehouse: Warehouse,
    warehouseOps: ClipboardList,
    logistics: Truck,
    offers: Layers,
    settings: Wrench,
    production: Factory,
  };

  const tenantDisplay =
    tenantId != null ? (tenants.find((t) => t.id === tenantId)?.name ?? "").trim() || `#${tenantId}` : "—";
  const fieldLabel = productLikeFieldLabelClass;
  const inputClass = productLikeInputClass;

  const productStatCards = useMemo((): ProductLikeStatCard[] => {
    const stockLabel =
      physicalStockDisplay != null && physicalStockDisplay !== "—" ? `${physicalStockDisplay} szt.` : "—";
    return [
      { label: "Stan magazynu", value: stockLabel, variant: "blue" },
      {
        label: "Cena netto",
        value: formatMoneyZlDisplay(pricingDisplay.saleNet, "brak ceny"),
        subValue: `Brutto: ${formatMoneyZlDisplay(pricingDisplay.saleGross, "brak danych")}`,
        variant: "green",
      },
      {
        label: "Marża",
        value: (
          <span className="inline-flex items-center gap-1">
            {pricingDisplay.marginLabel}
            <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </span>
        ),
        variant: "orange",
      },
    ];
  }, [physicalStockDisplay, pricingDisplay]);

  const shell = (
    <>
      <ProductLikePageLayout
        variant={isPage ? "page" : "modal"}
        onModalClose={onClose}
        stickyHeader={!isPage}
        hideVerticalRail={isPage}
        showTabIcons={isPage}
        saveInHeader={isPage}
        saveLabel="Zapisz zmiany"
        hideModeLabel={isPage}
        breadcrumbs={
          isPage
            ? [
                { label: "Katalog produktów", onClick: () => navigate("/products") },
                { label: isNew ? "Nowy produkt" : "Edycja produktu" },
              ]
            : undefined
        }
        headerPrefix={
          <input
            ref={headerGalleryInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={onGalleryFileSelected}
            disabled={galleryUploadBusy}
          />
        }
        modeLabel={isNew ? "Dodawanie produktu" : "Edycja produktu"}
        title={name.trim() || (isNew ? "Nowy produkt" : "—")}
        titleBadge={
          !isNew && productCreatedInWms(product?.metadata_json ?? null) ? (
            <span
              className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900"
              title="Produkt utworzony w WMS — uzupełnij dane w asortymencie"
            >
              Z WMS
            </span>
          ) : undefined
        }
        imageUrl={sidebarPreviewUrl}
        statCards={productStatCards}
        productIdentifiers={{
          tenantLabel: tenantDisplay !== "—" ? tenantDisplay : undefined,
          productId: !isNew && product?.id != null ? product.id : undefined,
          sku: symbol,
          ean,
        }}
        headerActions={
          <>
            <button
              type="button"
              title="Duplikuj produkt"
              disabled={isNew || dupBusy || product?.id == null || tenantId == null}
              onClick={() => {
                if (product?.id == null || tenantId == null) return;
                void (async () => {
                  setDupBusy(true);
                  try {
                    const created = await duplicateProduct(product.id!, tenantId);
                    const newId = Number(created?.id);
                    if (!Number.isFinite(newId) || newId < 1) {
                      toast.error("Kopia mogła powstać, ale API nie zwróciło poprawnego ID produktu.");
                      return;
                    }
                    toast.success(`Utworzono kopię: ${created.name ?? "produkt"}`);
                    navigate(`/products/${newId}/edit`, { state: { tenantId } });
                  } catch (e: unknown) {
                    logError("duplicateProduct failed", e);
                    toast.error(extractApiErrorMessage(e, "Kopiowanie produktu nie powiodło się."));
                  } finally {
                    setDupBusy(false);
                  }
                })();
              }}
              className="flex items-center justify-center rounded border border-slate-300 bg-white p-2 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            >
              <Copy className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              title={galleryUploadBusy ? "Wgrywanie…" : "Wgraj zdjęcie"}
              disabled={galleryUploadBusy}
              onClick={() => headerGalleryInputRef.current?.click()}
              className="flex items-center justify-center rounded border border-slate-300 bg-white p-2 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            >
              <ImageUp className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
            <details className="relative">
              <summary className="list-none cursor-pointer flex items-center justify-center rounded border border-slate-300 bg-white p-2 text-slate-600 shadow-sm transition-colors marker:content-none hover:bg-slate-50 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
                <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
              </summary>
              <div className="absolute right-0 z-50 mt-2 w-48 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-xl">
                <Link to="/products/list" className="block px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600">
                  Wróć do listy
                </Link>
              </div>
            </details>
          </>
        }
        tabs={railTabOrder.map((tabId) => ({ id: tabId, label: railLabel[tabId], icon: railIcon[tabId] }))}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSubmit={handleSubmit}
        saving={saving}
      >
                {activeTab === "basic" && (
                  <div className="flex flex-col 2xl:flex-row items-start gap-10 lg:gap-12">
                    {/* Lewa kolumna: Informacje ogólne, Producent, Walidacja */}
                    <div className="w-full 2xl:w-[420px] shrink-0 space-y-12">
                      <section>
                        <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Informacje ogólne</h3>
                        <div className="space-y-5">
                          <div>
                            <label className={fieldLabel}>Podmiot</label>
                            <select value={tenantId ?? ""} onChange={(e) => setTenantId(e.target.value ? Number(e.target.value) : null)} className={inputClass} required={isNew}>
                              <option value="">— Wybierz podmiot —</option>
                              {tenants.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={fieldLabel}>Nazwa</label>
                            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className={fieldLabel}>Symbol / SKU</label>
                              <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} className={inputClass} />
                            </div>
                            <div>
                              <label className={fieldLabel}>Numer katalogowy</label>
                              <input type="text" defaultValue="" className={inputClass} placeholder="Brak" />
                            </div>
                          </div>
                          <div>
                            <label className={fieldLabel}>EAN</label>
                            <input type="text" value={ean} onChange={(e) => setEan(e.target.value)} className={inputClass} />
                          </div>
                        </div>
                      </section>

                      <section>
                        <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Producent i GPSR</h3>
                        <div className="space-y-5">
                          <div>
                            <label className={fieldLabel}>Producent z katalogu</label>
                            <select
                              value={manufacturerId != null ? String(manufacturerId) : ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (!v) { setManufacturerId(null); return; }
                                const id = Number(v);
                                const row = manufacturersCatalog.find((x) => x.id === id);
                                setManufacturerId(Number.isFinite(id) ? id : null);
                                if (row) setManufacturer(row.name);
                              }}
                              className={inputClass}
                            >
                              <option value="">— Wybierz —</option>
                              {manufacturersCatalog.map((m) => (
                                <option key={m.id} value={m.id}>{m.name} {!m.active ? "(nieaktywny)" : ""}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={fieldLabel}>Nazwa producenta (ręczna)</label>
                            <input
                              type="text"
                              value={manufacturer}
                              onChange={(e) => {
                                const t = e.target.value;
                                setManufacturer(t);
                                if (manufacturerId != null) {
                                  const row = manufacturersCatalog.find((x) => x.id === manufacturerId);
                                  if (row && t.trim() !== (row.name || "").trim()) setManufacturerId(null);
                                }
                              }}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className={fieldLabel}>Osoba odpowiedzialna (GPSR)</label>
                            <input
                              type="text"
                              value={responsiblePerson}
                              onChange={(e) => setResponsiblePerson(e.target.value)}
                              className={inputClass}
                              placeholder="Puste = dziedziczenie z producenta"
                            />
                          </div>
                          <div>
                            <label className={fieldLabel}>E-mail osoby odpowiedzialnej (GPSR)</label>
                            <input
                              type="email"
                              value={responsiblePersonEmail}
                              onChange={(e) => setResponsiblePersonEmail(e.target.value)}
                              className={inputClass}
                              placeholder="Opcjonalnie; puste = z producenta"
                            />
                          </div>
                        </div>
                      </section>

                      <section id="wms-validation">
                        <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Walidacja</h3>
                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6">
                          <ProductReceivingRequirementsSection
                            requireDimensions={requireRecvDimensions}
                            requireWeight={requireRecvWeight}
                            requireBatch={trackBatch}
                            requireExpiry={trackExpiry}
                            requireSerial={trackSerial}
                            requireMasterCarton={requireRecvMasterCarton}
                            requireMasterCartonEan={requireRecvMasterCartonEan}
                            requireMasterCartonQty={requireRecvMasterCartonQty}
                            requireMasterCartonDims={requireRecvMasterCartonDims}
                            requireMasterCartonWeight={requireRecvMasterCartonWeight}
                            disabled={saving}
                            onChange={applyRequireRecvPatch}
                          />
                        </div>
                      </section>
                    </div>

                    {/* Środkowa kolumna: Wymiary i Opakowanie Zbiorcze */}
                    <div className="w-full 2xl:w-[420px] shrink-0 space-y-12">
                      <section>
                        <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Wymiary i waga produktu</h3>
                        <div className="space-y-5">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className={fieldLabel}>Długość (cm)</label>
                              <input type="number" min={0} step={0.01} value={length === "" ? "" : length} onChange={(e) => updateDimension("length", e.target.value)} className={inputClass} />
                            </div>
                            <div>
                              <label className={fieldLabel}>Szerokość (cm)</label>
                              <input type="number" min={0} step={0.01} value={width === "" ? "" : width} onChange={(e) => updateDimension("width", e.target.value)} className={inputClass} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className={fieldLabel}>Wysokość (cm)</label>
                              <input type="number" min={0} step={0.01} value={height === "" ? "" : height} onChange={(e) => updateDimension("height", e.target.value)} className={inputClass} />
                            </div>
                            <div>
                              <label className={fieldLabel}>Waga (kg)</label>
                              <input
                                type="number" min={0} step={0.001}
                                value={weight === "" ? "" : weight}
                                onChange={(e) => {
                                  const s = String(e.target.value).trim().replace(",", ".");
                                  if (s === "") setWeight("");
                                  else { const n = parseFloat(s); if (Number.isFinite(n)) setWeight(n); }
                                }}
                                className={inputClass}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className={fieldLabel}>Objętość (dm³)</label>
                              <input
                                type="number" min={0} step={0.01} readOnly
                                value={volume === "" ? "" : typeof volume === "number" ? round2(volume) : volume}
                                className={`${inputClass} font-semibold text-slate-700 bg-slate-50 cursor-not-allowed`}
                              />
                            </div>
                            <div>
                              <label className={fieldLabel}>Jednostka miary</label>
                              <input type="text" list="unit-list-pem" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="np. szt." className={inputClass} />
                              <datalist id="unit-list-pem">
                                <option value="szt." />
                                <option value="opak." />
                                <option value="para" />
                                <option value="kg" />
                                <option value="m" />
                              </datalist>
                            </div>
                          </div>
                        </div>
                      </section>

                      <section>
                        <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Opakowanie zbiorcze (Karton)</h3>
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-5 space-y-5">
                          <div>
                            <label className={fieldLabel}>EAN kartonu zbiorczego</label>
                            <input type="text" value={bulkEan} onChange={(e) => setBulkEan(e.target.value)} className={inputClass} placeholder="Opcjonalny kod" />
                          </div>
                          <div>
                            <label className={fieldLabel}>Ilość sztuk w kartonie</label>
                            <input
                              type="number" min={0} step={1}
                              value={unitsPerCarton === "" ? "" : unitsPerCarton}
                              onChange={(e) => {
                                const s = String(e.target.value).trim().replace(",", ".");
                                if (s === "") setUnitsPerCarton("");
                                else { const n = parseFloat(s); if (Number.isFinite(n) && n >= 0) setUnitsPerCarton(n); }
                              }}
                              className={inputClass}
                            />
                          </div>
                          
                          <div className="pt-2">
                            <h4 className="mb-3 text-sm font-bold text-slate-700">Zewnętrzne wymiary kartonu</h4>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                              <div>
                                <label className={fieldLabel}>Długość (cm)</label>
                                <input type="number" min={0} step={0.01} value={cartonLength === "" ? "" : cartonLength} onChange={(e) => updateCartonDimension("cartonLength", e.target.value)} className={inputClass} />
                              </div>
                              <div>
                                <label className={fieldLabel}>Szerokość (cm)</label>
                                <input type="number" min={0} step={0.01} value={cartonWidth === "" ? "" : cartonWidth} onChange={(e) => updateCartonDimension("cartonWidth", e.target.value)} className={inputClass} />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className={fieldLabel}>Wysokość (cm)</label>
                                <input type="number" min={0} step={0.01} value={cartonHeight === "" ? "" : cartonHeight} onChange={(e) => updateCartonDimension("cartonHeight", e.target.value)} className={inputClass} />
                              </div>
                              <div>
                                <label className={fieldLabel}>Waga brutto (kg)</label>
                                <input
                                  type="number" min={0} step={0.001}
                                  value={cartonWeight === "" ? "" : cartonWeight}
                                  onChange={(e) => {
                                    const s = String(e.target.value).trim().replace(",", ".");
                                    if (s === "") setCartonWeight("");
                                    else { const n = parseFloat(s); if (Number.isFinite(n)) setCartonWeight(n); }
                                  }}
                                  className={inputClass}
                                />
                              </div>
                            </div>
                            <div className="mt-4">
                              <label className={fieldLabel}>Objętość kartonu (dm³)</label>
                              <input
                                type="number" min={0} step={0.01} readOnly
                                value={cartonVolume === "" ? "" : typeof cartonVolume === "number" ? round2(cartonVolume) : cartonVolume}
                                className={`${inputClass} font-semibold text-slate-700 bg-white/50 cursor-not-allowed`}
                              />
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>

                    {/* Prawa kolumna: Historia magazynowa */}
                    {!isNew && product?.id != null && (
                      <aside className="w-full flex-1 min-w-0">
                        <section>
                          <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Historia magazynowa</h3>
                          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                            <div className="min-w-[600px]">
                              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-2 bg-slate-50/50">
                                <button type="button" className="rounded-md bg-blue-600 px-4 py-1.5 text-[13px] font-medium text-white shadow-sm hover:bg-blue-700">
                                  Operacje magazynowe
                                </button>
                                <button type="button" className="rounded-md px-4 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-200/50 hover:text-slate-900">
                                  Historia dostaw
                                </button>
                                <div className="ml-auto flex items-center text-xs text-slate-500 px-2">
                                  Pokaż na stronie 
                                  <select className="ml-2 rounded border border-slate-300 bg-white py-1 text-slate-700 outline-none">
                                    <option>25</option>
                                    <option>50</option>
                                  </select>
                                </div>
                              </div>
                              <table className="w-full text-sm text-left">
                                <thead className="border-b border-slate-200 text-xs font-semibold text-slate-700 bg-white">
                                  <tr>
                                    <th className="px-5 py-3.5 w-40">Data</th>
                                    <th className="px-5 py-3.5">Akcja</th>
                                    <th className="px-5 py-3.5">Dokument</th>
                                    <th className="px-5 py-3.5">Użytkownik</th>
                                    <th className="px-5 py-3.5">Lokalizacja</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-[13px] text-slate-600">
                                  <tr>
                                    <td className="px-5 py-4 whitespace-nowrap">20.05.2026, 19:12:35</td>
                                    <td className="px-5 py-4"><span className="rounded bg-slate-100 px-2.5 py-1 font-medium text-slate-700">Kompletacja</span></td>
                                    <td className="px-5 py-4 text-slate-900">ORDER-1216</td>
                                    <td className="px-5 py-4">Super Admin</td>
                                    <td className="px-5 py-4">A10-A-1</td>
                                  </tr>
                                  <tr>
                                    <td className="px-5 py-4 whitespace-nowrap">20.05.2026, 19:12:35</td>
                                    <td className="px-5 py-4"><span className="rounded bg-slate-100 px-2.5 py-1 font-medium text-slate-700">Kompletacja</span></td>
                                    <td className="px-5 py-4 text-slate-900">ORDER-1175</td>
                                    <td className="px-5 py-4">Super Admin</td>
                                    <td className="px-5 py-4">A10-A-1</td>
                                  </tr>
                                  <tr>
                                    <td className="px-5 py-4 whitespace-nowrap">20.05.2026, 18:57:30</td>
                                    <td className="px-5 py-4"><span className="rounded bg-indigo-50 text-indigo-700 px-2.5 py-1 font-medium">Rozlokowanie PZ</span></td>
                                    <td className="px-5 py-4 text-slate-900">PZ-3</td>
                                    <td className="px-5 py-4">Super Admin</td>
                                    <td className="px-5 py-4">A10-A-1</td>
                                  </tr>
                                  <tr>
                                    <td className="px-5 py-4 whitespace-nowrap">20.05.2026, 18:51:15</td>
                                    <td className="px-5 py-4"><span className="rounded bg-emerald-50 text-emerald-700 px-2.5 py-1 font-medium">Przyjęcie</span></td>
                                    <td className="px-5 py-4 text-slate-900">PZ-3</td>
                                    <td className="px-5 py-4">Super Admin</td>
                                    <td className="px-5 py-4">A1-A-1</td>
                                  </tr>
                                </tbody>
                              </table>
                              <div className="border-t border-slate-100 p-3 px-5 text-xs text-slate-500 bg-white">
                                1-4 z 4
                              </div>
                            </div>
                          </div>
                        </section>
                      </aside>
                    )}
                  </div>
                )}

                {activeTab === "prices" && (
                  <div className="flex flex-col xl:flex-row items-start gap-10 lg:gap-16">
                    <div className="w-full xl:max-w-2xl space-y-12 shrink-0">
                      <section>
                        <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Kalkulacja cenowa</h3>
                        <div className="space-y-5">
                          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                            <div>
                              <label className={fieldLabel}>Docelowa cena sprzedaży</label>
                              <input
                                type="number" min={0} step={0.01}
                                value={salePrice === "" ? "" : salePrice}
                                onChange={(e) => {
                                  const s = String(e.target.value).trim().replace(",", ".");
                                  if (s === "") setSalePrice("");
                                  else { const n = parseFloat(s); if (Number.isFinite(n)) setSalePrice(n); }
                                }}
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className={fieldLabel}>Ręczna cena zakupu netto</label>
                              <input
                                type="number" min={0} step={0.01}
                                value={purchasePrice === "" ? "" : purchasePrice}
                                onChange={(e) => {
                                  const s = String(e.target.value).trim().replace(",", ".");
                                  if (s === "") setPurchasePrice("");
                                  else { const n = parseFloat(s); if (Number.isFinite(n)) setPurchasePrice(n); }
                                }}
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className={fieldLabel}>Koszty pakowania (netto)</label>
                              <input
                                type="number" min={0} step={0.01}
                                value={extraCostPackagingNet === "" ? "" : extraCostPackagingNet}
                                onChange={(e) => {
                                  const s = String(e.target.value).trim().replace(",", ".");
                                  if (s === "") setExtraCostPackagingNet("");
                                  else { const n = parseFloat(s); if (Number.isFinite(n)) setExtraCostPackagingNet(n); }
                                }}
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className={fieldLabel}>Prowizja marketplace (%)</label>
                              <input
                                type="number" min={0} step={0.01}
                                value={extraCostCommissionPercent === "" ? "" : extraCostCommissionPercent}
                                onChange={(e) => {
                                  const s = String(e.target.value).trim().replace(",", ".");
                                  if (s === "") setExtraCostCommissionPercent("");
                                  else { const n = parseFloat(s); if (Number.isFinite(n)) setExtraCostCommissionPercent(n); }
                                }}
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className={fieldLabel}>Inne koszty operacyjne (netto)</label>
                              <input
                                type="number" min={0} step={0.01}
                                value={extraCostOtherNet === "" ? "" : extraCostOtherNet}
                                onChange={(e) => {
                                  const s = String(e.target.value).trim().replace(",", ".");
                                  if (s === "") setExtraCostOtherNet("");
                                  else { const n = parseFloat(s); if (Number.isFinite(n)) setExtraCostOtherNet(n); }
                                }}
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className={fieldLabel}>Stawka VAT (%)</label>
                              <input type="text" value={vatRate} onChange={(e) => setVatRate(e.target.value)} placeholder="np. 23" className={inputClass} />
                            </div>
                          </div>
                          <div>
                            <label className={fieldLabel}>Notatka promocyjna / cenowa</label>
                            <textarea value={promotion} onChange={(e) => setPromotion(e.target.value)} rows={3} className={`${inputClass} resize-y`} placeholder="Krótki opis promocji, rabatów lub warunków…" />
                          </div>
                        </div>
                      </section>
                    </div>

                    <aside className="w-full xl:max-w-[850px] flex-1 space-y-12">
                      <section>
                        <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Dostawcy i ceny zakupu</h3>
                        {cheapestSupplierInsight ? (
                          <div className="mb-5 rounded border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                            <span className="font-semibold">Najtańszy dostawca:</span> {(cheapestSupplierInsight.supplier_name || "").trim() || `#${cheapestSupplierInsight.supplier_id}`} — {formatMoneyZl(cheapestSupplierInsight.purchase_price)} netto
                          </div>
                        ) : null}

                        {isNew ? (
                          <p className="text-sm text-slate-600">Najpierw zapisz produkt, aby móc powiązać go z dostawcami.</p>
                        ) : (
                          <div className="space-y-6">
                            <div className="overflow-hidden rounded border border-slate-200">
                              <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200 text-left">
                                  <tr>
                                    <th className="px-4 py-3 font-semibold text-slate-700">Dostawca</th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-700 w-36">Cena netto</th>
                                    <th className="px-4 py-3 text-center font-semibold text-slate-700 w-24">Domyślny</th>
                                    <th className="px-4 py-3 w-16"></th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {supplierLinksBusy && supplierLinkRows.length === 0 ? (
                                    <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Wczytywanie…</td></tr>
                                  ) : supplierLinkRows.length === 0 ? (
                                    <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Brak przypisanych dostawców.</td></tr>
                                  ) : (
                                    supplierLinkRows.map((row) => (
                                      <ProductSupplierLinkRowEditor
                                        key={row.id} row={row} busy={supplierLinksBusy} inputTableMini={inputTableMini}
                                        isDefault={defaultSupplierId === row.supplier_id}
                                        onSelectDefault={() => setDefaultSupplierId(row.supplier_id)}
                                        onPatchPrice={(raw) => void onPatchSupplierLinkPrice(row.id, raw)}
                                        onRemove={() => void onRemoveSupplierLink(row.id, row.supplier_id)}
                                      />
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>

                            <div className="flex flex-wrap items-end gap-3 rounded bg-slate-50 p-4 border border-slate-200">
                              <div className="flex-1 min-w-[200px]">
                                <label className="mb-2 block text-sm font-medium text-slate-700">Dodaj nowego dostawcę</label>
                                <select className={inputClass} value={addSupplierPick} onChange={(e) => setAddSupplierPick(e.target.value)} disabled={supplierLinksBusy}>
                                  <option value="">— Wybierz z listy —</option>
                                  {suppliersCatalog.filter((s) => !supplierLinkRows.some((r) => r.supplier_id === s.id)).map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>
                              </div>
                              <button type="button" disabled={supplierLinksBusy || !addSupplierPick} onClick={() => void onAddSupplierLink()} className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                                Dodaj
                              </button>
                            </div>
                          </div>
                        )}
                      </section>

                      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                        <section>
                          <h3 className="mb-4 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Ostatni zakup (z PZ)</h3>
                          <dl className="space-y-3 text-sm text-slate-700 mt-5">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <dt className="font-medium text-slate-500">Aktualna cena zakupu</dt>
                              <dd className="tabular-nums font-semibold text-slate-900">{formatMoneyZl(purchasePrice === "" ? null : purchasePrice)}</dd>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <dt className="font-medium text-slate-500">Poprzednia cena</dt>
                              <dd className="tabular-nums">{formatMoneyZl(previousPurchasePrice === "" ? null : previousPurchasePrice)}</dd>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <dt className="font-medium text-slate-500">Data ostatniego zakupu</dt>
                              <dd>{formatDateTimePl(lastPurchaseDate)}</dd>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <dt className="font-medium text-slate-500">Ostatni dostawca</dt>
                              <dd className="text-right">{(lastSupplierName || "").trim() || "—"}</dd>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <dt className="font-medium text-slate-500">Waluta ostatniego zakupu</dt>
                              <dd className="tabular-nums">{(lastPurchaseCurrency || "").trim() || "—"}</dd>
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <dt className="font-medium text-slate-500">Cena oryginalna (waluta)</dt>
                              <dd className="tabular-nums font-medium text-slate-900">
                                {purchasePriceOriginal === "" || purchasePriceOriginal == null ? "—" : `${Number(purchasePriceOriginal).toFixed(4)} ${(purchaseCurrency || "").trim() || ""}`.trim()}
                              </dd>
                            </div>
                          </dl>
                        </section>

                        <section>
                          <h3 className="mb-4 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Podsumowanie kosztów</h3>
                          <dl className="space-y-3 text-sm text-slate-700 mt-5">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <dt className="text-slate-500">Cena zakupu netto</dt>
                              <dd className="tabular-nums">{formatMoneyZlDisplay(pricingDisplay.purchaseNet)}</dd>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <dt className="text-slate-500">Cena zakupu brutto</dt>
                              <dd className="tabular-nums">{formatMoneyZlDisplay(pricingDisplay.purchaseGross)}</dd>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <dt className="text-slate-500">Stawka VAT</dt>
                              <dd className="tabular-nums">{pricingDisplay.vatLabel}</dd>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <dt className="text-slate-500">Pakowanie</dt>
                              <dd className="tabular-nums text-rose-600">+{formatMoneyZl(extraCostPackagingNet === "" ? 0 : Number(extraCostPackagingNet))}</dd>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <dt className="text-slate-500">Prowizja</dt>
                              <dd className="tabular-nums text-rose-600">+{(extraCostCommissionPercent === "" ? 0 : Number(extraCostCommissionPercent)).toFixed(2)}%</dd>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <dt className="text-slate-500">Inne koszty</dt>
                              <dd className="tabular-nums text-rose-600">+{formatMoneyZl(extraCostOtherNet === "" ? 0 : Number(extraCostOtherNet))}</dd>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mt-1">
                              <dt className="font-semibold text-slate-900">Łączny koszt netto (Landed)</dt>
                              <dd className="tabular-nums font-bold text-slate-900">
                                {formatMoneyZlDisplay(pricingDisplay.landedCostNet)}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between pt-1 border-b border-slate-100 pb-2">
                              <dt className="text-slate-500">Cena sprzedaży netto</dt>
                              <dd className="tabular-nums">{formatMoneyZlDisplay(pricingDisplay.saleNet)}</dd>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <dt className="text-slate-500">Cena sprzedaży brutto</dt>
                              <dd className="tabular-nums font-semibold text-slate-900">
                                {formatMoneyZlDisplay(pricingDisplay.saleGross)}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <dt className="font-medium text-slate-900">Zysk (Marża PLN)</dt>
                              <dd className={`tabular-nums font-semibold ${marginToneClass(pricingDisplay.marginPercent)}`}>
                                {formatMoneyZlDisplay(pricingDisplay.marginValue)}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <dt className="font-medium text-slate-900">Rentowność (Marża %)</dt>
                              <dd className={`tabular-nums text-lg font-bold ${marginToneClass(pricingDisplay.marginPercent)}`}>
                                {pricingDisplay.marginLabel}
                              </dd>
                            </div>
                          </dl>
                        </section>
                      </div>
                    </aside>
                  </div>
                )}

                {activeTab === "warehouse" && (
                  <>
                  <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3 lg:gap-8">
                    <div className="space-y-6">
                      <ProductWarehouseStockPanel
                          physicalStockDisplay={physicalStockDisplay}
                          totalStockDisplay={inventoryBreakdown?.total ?? physicalStockDisplay}
                          allocatedStockDisplay={inventoryBreakdown?.allocated ?? null}
                          unallocatedStockDisplay={inventoryBreakdown?.unallocated ?? null}
                          reservedDisplay={inventoryBreakdown?.reserved ?? null}
                          availableDisplay={inventoryBreakdown?.available ?? null}
                          dispositionStock={product?.disposition_stock ?? null}
                          commerciallySellableQty={product?.commercially_sellable_qty ?? null}
                          salesBlockedQty={product?.sales_blocked_qty ?? null}
                          networkCommerciallySellableQty={product?.network_commercially_sellable_qty ?? null}
                          inventoryRows={magazynInventoryRows as MagazynInvRowDisplay[]}
                          showInventoryLink={!isNew}
                          canManualAdjustStock={canManualAdjustStock}
                          onManualAdjustClick={() => setStockCorrectionOpen(true)}
                          emptyLocationsMessage={magazynEmptyLocationsMessage}
                          onEditTraceability={isNew ? undefined : (row) => setTraceEditRow(row)}
                          traceabilityEditDisabled={saving}
                        />
                        {!isNew && product?.id && tenantId != null && warehouse?.id ? (
                          <ProductStockCorrectionModal
                            open={stockCorrectionOpen}
                            onClose={() => setStockCorrectionOpen(false)}
                            onSuccess={() => void reloadProductAfterStockCorrection()}
                            tenantId={tenantId}
                            warehouseId={warehouse.id}
                            productId={product.id}
                            productName={product.name}
                            inventoryRows={magazynInventoryRows as MagazynInvRowDisplay[]}
                          />
                        ) : null}

                      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-100 px-5 py-4">
                          <h3 className="font-semibold text-slate-800">Powiadomienia i alarmy</h3>
                        </div>
                        <div className="p-5">
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-4">
                          <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-amber-900">
                            <input
                              type="checkbox"
                              checked={enableStockAlert}
                              onChange={(e) => setEnableStockAlert(e.target.checked)}
                              className="h-5 w-5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                            />
                            Włącz alarm niskiego stanu magazynowego
                          </label>
                          {enableStockAlert && (
                            <div className="pl-8">
                              <label className="mb-1 block text-sm font-medium text-amber-900">Próg alarmowy łącznego stanu (szt.)</label>
                              <input
                                type="number" min={0} step={0.01}
                                value={minTotalStock === "" ? "" : minTotalStock}
                                onChange={(e) => {
                                  const s = String(e.target.value).trim().replace(",", ".");
                                  if (s === "") setMinTotalStock("");
                                  else {
                                    const n = parseFloat(s);
                                    if (Number.isFinite(n) && n >= 0) setMinTotalStock(n);
                                  }
                                }}
                                className="w-full rounded border border-amber-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                                placeholder="np. 10"
                              />
                            </div>
                          )}
                          </div>
                        </div>
                      </section>

                      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-100 px-5 py-4">
                          <h3 className="font-semibold text-slate-800">Poziomy uzupełniania w strefach</h3>
                        </div>
                        <div className="space-y-8 p-5">
                          <div>
                            <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">Strefa Kompletacji (Pick-face)</h4>
                            <div className="grid grid-cols-1 gap-5">
                              <div>
                                <label className={fieldLabel}>Minimalna ilość (szt.)</label>
                                <input
                                  type="number" min={0} step={0.01}
                                  value={minPickQuantity === "" ? "" : minPickQuantity}
                                  onChange={(e) => {
                                    const s = String(e.target.value).trim().replace(",", ".");
                                    if (s === "") setMinPickQuantity("");
                                    else { const n = parseFloat(s); if (Number.isFinite(n) && n >= 0) setMinPickQuantity(n); }
                                  }}
                                  className={inputClass} placeholder="np. 5"
                                />
                              </div>
                              <div>
                                <label className={fieldLabel}>Maksymalna ilość (szt.)</label>
                                <input
                                  type="number" min={0} step={0.01}
                                  value={maxPickQuantity === "" ? "" : maxPickQuantity}
                                  onChange={(e) => {
                                    const s = String(e.target.value).trim().replace(",", ".");
                                    if (s === "") setMaxPickQuantity("");
                                    else { const n = parseFloat(s); if (Number.isFinite(n) && n >= 0) setMaxPickQuantity(n); }
                                  }}
                                  className={inputClass} placeholder="np. 50"
                                />
                              </div>
                            </div>
                          </div>
                          <hr className="border-slate-100" />
                          <div>
                            <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">Strefa Zapasu (Reserve)</h4>
                            <div className="grid grid-cols-1 gap-5">
                              <div>
                                <label className={fieldLabel}>Minimalna ilość (szt.)</label>
                                <input
                                  type="number" min={0} step={0.01}
                                  value={minReserveQuantity === "" ? "" : minReserveQuantity}
                                  onChange={(e) => {
                                    const s = String(e.target.value).trim().replace(",", ".");
                                    if (s === "") setMinReserveQuantity("");
                                    else { const n = parseFloat(s); if (Number.isFinite(n) && n >= 0) setMinReserveQuantity(n); }
                                  }}
                                  className={inputClass} placeholder="np. 12"
                                />
                              </div>
                              <div>
                                <label className={fieldLabel}>Maksymalna ilość (szt.)</label>
                                <input
                                  type="number" min={0} step={0.01}
                                  value={maxReserveQuantity === "" ? "" : maxReserveQuantity}
                                  onChange={(e) => {
                                    const s = String(e.target.value).trim().replace(",", ".");
                                    if (s === "") setMaxReserveQuantity("");
                                    else { const n = parseFloat(s); if (Number.isFinite(n) && n >= 0) setMaxReserveQuantity(n); }
                                  }}
                                  className={inputClass} placeholder="opcjonalnie"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>

                    <div className="space-y-6">
                      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-100 px-5 py-4">
                          <h3 className="font-semibold text-slate-800">Magazynowanie: Produkt (Sztuka)</h3>
                        </div>
                        <div className="space-y-5 p-5">
                          <div>
                            <label className={fieldLabel}>Wymagana orientacja</label>
                            <select value={orientationType} onChange={(e) => setOrientationType(e.target.value as "any" | "upright" | "no_stack")} className={inputClass}>
                              <option value="any">Dowolna orientacja</option>
                              <option value="upright">Tylko w pionie (strzałki do góry)</option>
                              <option value="no_stack">Nie obracać</option>
                            </select>
                          </div>
                          <div>
                            <label className={fieldLabel}>Kształt</label>
                            <select value={shapeType} onChange={(e) => setShapeType(e.target.value as "box" | "cylinder")} className={inputClass}>
                              <option value="box">Prostopadłościan (Pudełko)</option>
                              <option value="cylinder">Walec (np. Butelka / Tuba)</option>
                            </select>
                          </div>
                          <div>
                            <label className={fieldLabel}>Czy można układać w stos?</label>
                            <select value={stackBehavior} onChange={(e) => setStackBehavior(e.target.value as "stackable" | "no_stack")} className={inputClass}>
                              <option value="stackable">Tak, sztuka na sztuce</option>
                              <option value="no_stack">Nie układać w stos!</option>
                            </select>
                          </div>
                          
                          {stackBehavior === "stackable" && (
                            <div className="space-y-4 pt-2 border-t border-slate-200">
                              <label className="flex cursor-pointer items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={stackCompressible}
                                  onChange={(e) => setStackCompressible(e.target.checked)}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm font-medium text-slate-700">Podlega kompresji przy nacisku</span>
                              </label>
                              
                              <div className="grid grid-cols-1 gap-4">
                                {stackCompressible ? (
                                  <div>
                                    <label className={fieldLabel}>Wys. po kompresji (cm)</label>
                                    <input
                                      type="number" min={0.01} step={0.1}
                                      value={compressedHeightCm === "" ? "" : compressedHeightCm}
                                      onChange={(e) => {
                                        const s = String(e.target.value).trim().replace(",", ".");
                                        if (s === "") setCompressedHeightCm("");
                                        else { const n = parseFloat(s); if (Number.isFinite(n) && n > 0) setCompressedHeightCm(n); }
                                      }}
                                      className={inputClass}
                                    />
                                  </div>
                                ) : null}
                                <div>
                                  <label className={fieldLabel}>Maks. ciężar stosu (kg)</label>
                                  <input
                                    type="number" min={0} step={0.1}
                                    value={maxStackWeight === "" ? "" : maxStackWeight}
                                    onChange={(e) => {
                                      const s = String(e.target.value).trim().replace(",", ".");
                                      if (s === "") setMaxStackWeight("");
                                      else { const n = parseFloat(s); if (Number.isFinite(n) && n >= 0) setMaxStackWeight(n); }
                                    }}
                                    placeholder="Opcjonalny limit"
                                    className={inputClass}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </section>

                      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-100 px-5 py-4">
                          <h3 className="font-semibold text-slate-800">Magazynowanie: Karton</h3>
                        </div>
                        <div className="space-y-5 p-5">
                          <div>
                            <label className={fieldLabel}>Wymagana orientacja kartonu</label>
                            <select value={cartonOrientationType} onChange={(e) => setCartonOrientationType(e.target.value as "any" | "upright" | "no_stack")} className={inputClass}>
                              <option value="any">Dowolna orientacja</option>
                              <option value="upright">Tylko w pionie (strzałki do góry)</option>
                              <option value="no_stack">Nie obracać</option>
                            </select>
                          </div>
                          <div>
                            <label className={fieldLabel}>Kształt opakowania</label>
                            <select value={cartonShapeType} onChange={(e) => setCartonShapeType(e.target.value as "box" | "cylinder")} className={inputClass}>
                              <option value="box">Prostopadłościan</option>
                              <option value="cylinder">Walec (Beczka)</option>
                            </select>
                          </div>
                          <div>
                            <label className={fieldLabel}>Czy kartony ułożysz w stos?</label>
                            <select value={cartonStackBehavior} onChange={(e) => setCartonStackBehavior(e.target.value as "stackable" | "no_stack")} className={inputClass}>
                              <option value="stackable">Tak, karton na kartonie</option>
                              <option value="no_stack">Nie układać stosów!</option>
                            </select>
                          </div>
                          
                          {cartonStackBehavior === "stackable" && (
                            <div className="space-y-4 pt-2 border-t border-indigo-100/50">
                              <label className="flex cursor-pointer items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={cartonStackCompressible}
                                  onChange={(e) => setCartonStackCompressible(e.target.checked)}
                                  className="h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm font-medium text-slate-700">Karton "siada" przy nacisku</span>
                              </label>

                              <div className="grid grid-cols-1 gap-4">
                                {cartonStackCompressible ? (
                                  <div>
                                    <label className={fieldLabel}>Wys. po kompresji (cm)</label>
                                    <input
                                      type="number" min={0.01} step={0.1}
                                      value={cartonCompressedHeightCm === "" ? "" : cartonCompressedHeightCm}
                                      onChange={(e) => {
                                        const s = String(e.target.value).trim().replace(",", ".");
                                        if (s === "") setCartonCompressedHeightCm("");
                                        else { const n = parseFloat(s); if (Number.isFinite(n) && n > 0) setCartonCompressedHeightCm(n); }
                                      }}
                                      className={inputClass}
                                    />
                                  </div>
                                ) : null}
                                <div>
                                  <label className={fieldLabel}>Maks. obciążenie na karton (kg)</label>
                                  <input
                                    type="number" min={0} step={0.1}
                                    value={cartonMaxStackWeight === "" ? "" : cartonMaxStackWeight}
                                    onChange={(e) => {
                                      const s = String(e.target.value).trim().replace(",", ".");
                                      if (s === "") setCartonMaxStackWeight("");
                                      else { const n = parseFloat(s); if (Number.isFinite(n) && n >= 0) setCartonMaxStackWeight(n); }
                                    }}
                                    placeholder="Opcjonalny limit"
                                    className={inputClass}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </section>
                    </div>

                    <div className="space-y-6">
                      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-100 px-5 py-4">
                          <h3 className="font-semibold text-slate-800">Dopasowanie opakowań (Wysyłka)</h3>
                        </div>
                        <div className="p-5">
                        <ProductLogisticsPackagingMatchingSection
                          productId={product?.id ?? null}
                          tenantId={tenantId}
                          dimensionsComplete={productDimensions != null}
                          isNew={isNew}
                        />
                        </div>
                      </section>
                    </div>
                  </div>

                  {!isNew && product?.id && tenantId != null ? (
                    <div className="mt-8 w-full max-w-7xl space-y-8">
                      <ProductMultiWarehouseStockSection productId={product.id} tenantId={tenantId} />
                      <ProductMultiWarehouseSlottingSection productId={product.id} tenantId={tenantId} />
                    </div>
                  ) : null}
                  </>
                )}

                {activeTab === "images" && (
                  <div className="w-full xl:max-w-4xl space-y-12">
                    <section>
                      <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Galeria produktu</h3>
                      <div className="space-y-6">
                        <div className="flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-slate-50 p-5 shadow-sm">
                          <div className="min-w-[200px] flex-1">
                            <label className="mb-2 block text-sm font-medium text-slate-700">Dodaj zdjęcie z adresu URL</label>
                            <input
                              type="url"
                              className={inputClass}
                              value={newGalleryUrl}
                              onChange={(e) => setNewGalleryUrl(e.target.value)}
                              placeholder="https://... lub /uploads/..."
                            />
                          </div>
                          <button
                            type="button"
                            onClick={addGalleryFromUrl}
                            disabled={!newGalleryUrl.trim()}
                            className="rounded bg-slate-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-50 transition-colors"
                          >
                            Dodaj URL
                          </button>
                          <label className="inline-flex cursor-pointer items-center justify-center rounded border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                            <input type="file" accept="image/*" className="sr-only" onChange={onGalleryFileSelected} disabled={galleryUploadBusy} />
                            {galleryUploadBusy ? "Wgrywanie…" : "Wgraj z pliku"}
                          </label>
                        </div>

                        {ensureSingleMainImage(productImages).length === 0 ? (
                          <div className="text-center py-12 border border-dashed border-slate-300 rounded-lg bg-slate-50">
                            <p className="text-sm font-medium text-slate-500">Brak zdjęć w galerii.</p>
                            <p className="text-xs text-slate-400 mt-1">Użyj opcji powyżej, aby dodać pierwsze zdjęcie.</p>
                          </div>
                        ) : (
                          <ul className="space-y-4">
                            {ensureSingleMainImage(productImages)
                              .sort((a, b) => a.sort_order - b.sort_order)
                              .map((img) => (
                                <li
                                  key={img.id}
                                  className="flex flex-col sm:flex-row sm:items-center gap-6 rounded border border-slate-200 bg-white p-5 shadow-sm"
                                >
                                  {/* Czyste zdjęcie na białym tle, bez ramki ograniczającej */}
                                  <div className="flex w-24 shrink-0 items-center justify-center overflow-hidden bg-white">
                                    <img src={img.image_url} alt="" className="max-h-24 max-w-full object-contain" />
                                  </div>
                                  <div className="min-w-0 flex-1 space-y-4">
                                    <input
                                      type="url"
                                      className={inputClass}
                                      value={img.image_url}
                                      onChange={(e) =>
                                        setProductImages((prev) =>
                                          ensureSingleMainImage(prev.map((x) => (x.id === img.id ? { ...x, image_url: e.target.value } : x))),
                                        )
                                      }
                                    />
                                    <div className="flex flex-wrap items-center gap-4 text-sm font-medium">
                                      <label className="flex cursor-pointer items-center gap-2 text-blue-700">
                                        <input
                                          type="radio"
                                          name="product-main-image"
                                          className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                                          checked={img.is_main}
                                          onChange={() => setGalleryMain(img.id)}
                                        />
                                        Główne zdjęcie
                                      </label>
                                      <div className="hidden h-4 w-px bg-slate-200 sm:block"></div>
                                      <div className="flex items-center gap-4">
                                        <button type="button" className="text-slate-600 transition-colors hover:text-slate-900" onClick={() => moveGalleryImage(img.id, -1)}>
                                          W górę
                                        </button>
                                        <button type="button" className="text-slate-600 transition-colors hover:text-slate-900" onClick={() => moveGalleryImage(img.id, 1)}>
                                          W dół
                                        </button>
                                      </div>
                                      <div className="hidden h-4 w-px bg-slate-200 sm:block"></div>
                                      <button type="button" className="text-rose-600 transition-colors hover:text-rose-800" onClick={() => removeGalleryImage(img.id)}>
                                        Usuń zdjęcie
                                      </button>
                                    </div>
                                  </div>
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === "production" && !isNew && tenantId != null && product?.id != null ? (
                  <ProductManufacturingPanel
                    tenantId={tenantId}
                    productId={Number(product.id)}
                    productName={name.trim() || `Produkt #${product.id}`}
                    onChanged={() => {
                      setProductionTabVisible(true);
                      setActiveTab("production");
                    }}
                  />
                ) : null}

                {activeTab === "production" && isNew ? (
                  <p className="text-sm text-slate-500">Zapisz produkt, aby zdefiniować recepturę produkcyjną (BOM).</p>
                ) : null}

                {activeTab === "offers" && (
                  isNew || product?.id == null || tenantId == null ? (
                    <p className="text-sm text-slate-500">Zapisz produkt, aby zarządzać ofertami sprzedażowymi.</p>
                  ) : (
                    <ProductSalesOffersSection
                      productId={product.id}
                      tenantId={tenantId}
                      warehouseId={warehouse?.id ?? null}
                    />
                  )
                )}

                {activeTab === "labelSheet" && (
                  <div className="w-full xl:max-w-5xl space-y-12 lg:grid lg:grid-cols-[1fr_min(340px,35%)] lg:items-start lg:gap-12 lg:space-y-0">
                    <div className="space-y-12">
                      <section>
                        <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Wybór szablonu</h3>
                        <div className="space-y-5">
                          <div>
                            <label className={fieldLabel}>Szablon etykiety</label>
                            <select
                              value={labelTemplateId ?? ""}
                              onChange={(e) => setLabelTemplateId(e.target.value === "" ? null : Number(e.target.value))}
                              className={inputClass}
                            >
                              <option value="">Brak</option>
                              {productTemplates.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="rounded border border-slate-200 bg-slate-50 p-5">
                            <p className="mb-3 text-sm font-medium text-slate-700">Podgląd szablonu (SVG)</p>
                            <div className="flex min-h-[100px] items-center justify-center rounded border border-dashed border-slate-300 bg-white p-2">
                              {templatePreviewLoading ? (
                                <p className="text-xs text-slate-500">Ładowanie…</p>
                              ) : templatePreviewSvg ? (
                                <div
                                  className="max-h-36 max-w-full overflow-auto [&_svg]:max-h-36"
                                  dangerouslySetInnerHTML={{ __html: templatePreviewSvg }}
                                />
                              ) : (
                                <p className="text-xs text-slate-500">Brak podglądu</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </section>

                      <section>
                        <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">A. Podstawowe</h3>
                        <div>
                          <label className={fieldLabel}>Nazwa produktu na etykiecie (PL)</label>
                          <input
                            type="text"
                            className={inputClass}
                            value={labelData.product_name_pl ?? ""}
                            onChange={(e) => setLabelData((d) => ({ ...d, product_name_pl: e.target.value }))}
                            placeholder={name.trim() || "jak nazwa produktu"}
                          />
                        </div>
                      </section>

                      <section>
                        <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">B. Producent / Importer</h3>
                        <div className="space-y-5">
                          <div className="rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                            <p className="font-semibold text-slate-900">{manufacturerReadonly.name || "—"}</p>
                            <p className="mt-1 whitespace-pre-line text-slate-700">{manufacturerReadonly.address || "—"}</p>
                            {manufacturerId == null ? (
                              <p className="mt-2 text-xs text-amber-600 font-medium">Wybierz producenta w zakładce Podstawowe, aby wypełnić blok producenta.</p>
                            ) : null}
                          </div>
                          <div>
                            <label className={fieldLabel}>Importer — nazwa</label>
                            <input
                              type="text"
                              className={inputClass}
                              value={labelData.importer_name ?? ""}
                              onChange={(e) => setLabelData((d) => ({ ...d, importer_name: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className={fieldLabel}>Importer — adres</label>
                            <textarea
                              className={`${inputClass} min-h-[64px] resize-y`}
                              value={labelData.importer_address ?? ""}
                              onChange={(e) => setLabelData((d) => ({ ...d, importer_address: e.target.value }))}
                            />
                          </div>
                        </div>
                      </section>

                      <section>
                        <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">C. Identyfikacja</h3>
                        <div className="space-y-5">
                          <div>
                            <label className={fieldLabel}>EAN</label>
                            <input type="text" className={`${inputClass} bg-slate-50 cursor-not-allowed`} value={ean} readOnly />
                          </div>
                          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                            <div>
                              <label className={fieldLabel}>Numer partii</label>
                              <input
                                type="text"
                                className={inputClass}
                                value={labelData.batch_number ?? ""}
                                onChange={(e) => setLabelData((d) => ({ ...d, batch_number: e.target.value }))}
                              />
                            </div>
                            <div>
                              <label className={fieldLabel}>Numer serii</label>
                              <input
                                type="text"
                                className={inputClass}
                                value={labelData.series_number ?? ""}
                                onChange={(e) => setLabelData((d) => ({ ...d, series_number: e.target.value }))}
                              />
                            </div>
                          </div>
                        </div>
                      </section>

                      <section>
                        <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">D. Regulacje i Cechy</h3>
                        <div className="space-y-5">
                          <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-800">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              checked={Boolean(labelData.requires_ce_mark)}
                              onChange={(e) => setLabelData((d) => ({ ...d, requires_ce_mark: e.target.checked }))}
                            />
                            Wymaga znaku CE na etykiecie
                          </label>
                          <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-800">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              checked={Boolean(labelData.show_price_on_label)}
                              onChange={(e) => setLabelData((d) => ({ ...d, show_price_on_label: e.target.checked }))}
                            />
                            Pokazuj cenę na etykiecie
                          </label>
                        </div>
                      </section>

                      <section>
                        <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">E. Branżowe (tekstylia)</h3>
                        <div className="space-y-5">
                          <div>
                            <label className={fieldLabel}>Skład materiałowy</label>
                            <textarea
                              className={`${inputClass} min-h-[72px] resize-y`}
                              value={labelData.material_composition ?? ""}
                              onChange={(e) => setLabelData((d) => ({ ...d, material_composition: e.target.value }))}
                              placeholder="np. 100% bawełna"
                            />
                          </div>
                          <div>
                            <label className={fieldLabel}>Instrukcja pielęgnacji</label>
                            <textarea
                              className={`${inputClass} min-h-[72px] resize-y`}
                              value={labelData.care_instructions ?? ""}
                              onChange={(e) => setLabelData((d) => ({ ...d, care_instructions: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className={fieldLabel}>Rozmiar / długość</label>
                            <input
                              type="text"
                              className={inputClass}
                              value={labelData.size_or_length ?? ""}
                              onChange={(e) => setLabelData((d) => ({ ...d, size_or_length: e.target.value }))}
                            />
                          </div>
                        </div>
                      </section>

                      <section>
                        <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">F. Pochodzenie</h3>
                        <div>
                          <label className={fieldLabel}>Kraj pochodzenia</label>
                          <select
                            className={inputClass}
                            value={labelData.country_of_origin ?? ""}
                            onChange={(e) => setLabelData((d) => ({ ...d, country_of_origin: e.target.value || undefined }))}
                          >
                            <option value="">— Brak —</option>
                            {SUPPLIER_COUNTRIES.map((c) => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>
                        </div>
                      </section>
                    </div>

                    <aside className="min-h-0 lg:sticky lg:top-8 mt-10 lg:mt-0">
                      <section>
                        <h3 className="mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Podgląd gotowej etykiety</h3>
                        <p className="mb-5 text-sm text-slate-500">Symulacja wydruku (~60×40 mm). Puste sekcje są automatycznie ukrywane.</p>
                        <div className="flex justify-center rounded bg-slate-50 border border-slate-200 px-4 py-8 shadow-inner overflow-hidden mb-24 sm:mb-32">
                          <div className="origin-top scale-[1.35] shadow-md sm:scale-150 bg-white">
                            <RetailLabel
                              brandName={manufacturerReadonly.name || manufacturer.trim() || "—"}
                              productNamePl={(labelData.product_name_pl ?? "").trim() || name.trim() || "—"}
                              composition={labelData.material_composition}
                              manufacturerName={manufacturerReadonly.name || undefined}
                              manufacturerAddress={manufacturerReadonly.address || undefined}
                              importerName={labelData.importer_name}
                              importerAddress={labelData.importer_address}
                              ean={ean.trim() || undefined}
                              batchNumber={labelData.batch_number}
                              seriesNumber={labelData.series_number}
                              countryOfOrigin={labelData.country_of_origin}
                              careInstructions={labelData.care_instructions}
                              sizeOrLength={labelData.size_or_length}
                              salePrice={salePrice === "" ? null : typeof salePrice === "number" ? salePrice : parseDecimal(String(salePrice)) ?? null}
                              showPriceOnLabel={Boolean(labelData.show_price_on_label)}
                              showCeMark={Boolean(labelData.requires_ce_mark)}
                            />
                          </div>
                        </div>
                      </section>
                    </aside>
                  </div>
                )}

      </ProductLikePageLayout>

      <EditInventoryTraceabilityModal
        open={traceEditRow != null && !isNew && product?.id != null && tenantId != null}
        tenantId={tenantId ?? 1}
        productId={product?.id ?? 0}
        row={traceEditRow}
        trackBatch={trackBatch}
        trackExpiry={trackExpiry}
        trackSerial={trackSerial}
        onClose={() => setTraceEditRow(null)}
        onSaved={() => setTraceEditRow(null)}
      />
    </>
  );

  return shell;
}

function ProductSupplierLinkRowEditor({ row, busy, inputTableMini, isDefault, onSelectDefault, onPatchPrice, onRemove }: any) {
  const [price, setPrice] = useState(row.purchase_price != null ? String(row.purchase_price) : "");
  useEffect(() => setPrice(row.purchase_price != null ? String(row.purchase_price) : ""), [row.purchase_price, row.id]);

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3 text-slate-800">{(row.supplier_name || "").trim() || `#${row.supplier_id}`}</td>
      <td className="px-4 py-3 text-right">
        <input className={inputTableMini} value={price} onChange={(e) => setPrice(e.target.value)} onBlur={() => onPatchPrice(price)} disabled={busy} placeholder="—" />
      </td>
      <td className="px-4 py-3 text-center">
        <input type="radio" className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500" name="product-default-supplier" checked={isDefault} onChange={onSelectDefault} disabled={busy} />
      </td>
      <td className="px-4 py-3 text-right">
        <button type="button" disabled={busy} onClick={onRemove} className="text-sm font-medium text-rose-600 hover:text-rose-800 transition-colors disabled:opacity-40">
          Usuń
        </button>
      </td>
    </tr>
  );
}