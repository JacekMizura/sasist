import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import toast from "react-hot-toast";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { duplicateProduct } from "../../api/productsApi";
import { postProductsBulkDelete } from "../../api/productsBulkApi";
import { extractApiErrorMessage } from "../../api/authApi";
import { quickPurchaseOrderFromProduct } from "../../api/inboundDeliveriesApi";
import { useActiveWarehouseContext, ACTIVE_WAREHOUSE_REQUIRED_MESSAGE } from "../../hooks/useActiveWarehouseContext";
import { PrimaryButton } from "../../design-system/PrimaryButton";
import { getProductDetailsPath, productDetailsNavState } from "./productPaths";
import {
  Building2,
  ClipboardList,
  Copy,
  Factory,
  Image as ImageIcon,
  AlignLeft,
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
import { getInventoryManagementSettings } from "../../api/inventoryManagementPolicyApi";
import { ProductManufacturingPanel } from "../Production/ProductManufacturingPanel";
import { ProductSalesOffersSection } from "./ProductSalesOffersSection";
import { listCompositionsForProduct } from "../../api/compositionApi";
import type { MagazynInvRowDisplay } from "../../components/products/MagazynInventoryLine";
import { EditInventoryTraceabilityModal } from "../../components/products/EditInventoryTraceabilityModal";
import { getWmsProductValidationSettings } from "../../api/wmsProductValidationApi";
import type { ProductValidationGlobalSettings } from "../../components/wms/receiving/ProductValidationOverridesSection";
import type { ProductImageEntry, ProductLabelData } from "../../types/productLabel";
import {
  ProductLikePageLayout,
  type ProductLikeStatCard,
} from "../../components/catalog";
import {
  buildProductMetadataJson,
  ensureSingleMainImage,
  manufacturerLabelBlock,
  parseLabelData,
  parseProductDescription,
  parseProductImages,
  pickMainImageUrl,
} from "../../utils/productLabelMetadata";
import { formatMoneyZlDisplay, resolveProductPricingDisplay } from "./productPricingDisplay";
import { ProductEditPricesTab } from "./ProductEditPricesTab";
import { ProductEditBasicTab } from "./ProductEditBasicTab";
import { ProductEditWarehouseTab } from "./ProductEditWarehouseTab";
import { ProductEditImagesTab } from "./ProductEditImagesTab";
import { ProductEditLabelTab } from "./ProductEditLabelTab";
import { ProductEditDescriptionTab } from "./ProductEditDescriptionTab";
import { ProductLabelPrintModal } from "./ProductLabelPrintModal";
import ActivityLogPanel from "../../components/activityLog/ActivityLogPanel";

export type ProductForm = {
  id?: number;
  tenant_id?: number;
  name: string;
  ean: string;
  /** Alternate EANs from product_barcodes (excluding primary ean). */
  extra_barcodes?: { id?: number; ean: string; multiplier?: number }[];
  symbol: string;
  catalog_number?: string | null;
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
  production_reserved_quantity?: number;
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
  max_stack_count?: number | null;
  stack_behavior?: "stackable" | "no_stack";
  fragile?: boolean | null;
  product_fragile?: boolean | null;
  product_orientation_type?: "any" | "upright" | "no_stack";
  product_shape_type?: "box" | "cylinder";
  product_stack_compressible?: boolean;
  product_compressed_height_cm?: number | null;
  product_max_stack_weight?: number | null;
  product_max_stack_count?: number | null;
  product_stack_behavior?: "stackable" | "no_stack";
  carton_orientation_type?: "any" | "upright" | "no_stack" | null;
  carton_shape_type?: "box" | "cylinder" | null;
  carton_stack_compressible?: boolean | null;
  carton_compressed_height_cm?: number | null;
  carton_max_stack_weight?: number | null;
  carton_max_stack_count?: number | null;
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
  validation_skip_dimensions?: boolean;
  validation_skip_weight?: boolean;
  validation_skip_batch?: boolean;
  validation_skip_expiry?: boolean;
  validation_skip_serial?: boolean;
  validation_skip_master_carton?: boolean;
  validation_skip_master_carton_ean?: boolean;
  validation_skip_master_carton_qty?: boolean;
  validation_skip_master_carton_dims?: boolean;
  validation_skip_master_carton_weight?: boolean;
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
  | "description"
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
  const location = useLocation();
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();
  const isPage = variant === "page";
  const isNew = product == null;
  const [dupBusy, setDupBusy] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const { warehouse } = useWarehouse();
  const returnToRaw = (location.state as { returnTo?: string } | null)?.returnTo;
  const backListTo =
    typeof returnToRaw === "string" && returnToRaw.trim() ? returnToRaw.trim() : "/products/list";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? "basic");
  const [productionTabVisible, setProductionTabVisible] = useState(initialTab === "production");
  const [saving, setSaving] = useState(false);
  const [canManualAdjustStock, setCanManualAdjustStock] = useState(false);
  const [stockCorrectionOpen, setStockCorrectionOpen] = useState(false);

  const [tenantId, setTenantId] = useState<number | null>(product?.tenant_id ?? null);
  const effectiveTenantId = tenantId ?? product?.tenant_id ?? 1;
  const [headerLabelPrintOpen, setHeaderLabelPrintOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [name, setName] = useState(product?.name ?? "");
  const [ean, setEan] = useState(product?.ean ?? "");
  const [extraEans, setExtraEans] = useState<string[]>(() =>
    Array.isArray(product?.extra_barcodes)
      ? product!.extra_barcodes!
          .map((b) => (b.ean ?? "").trim())
          .filter((code) => code && code !== (product?.ean ?? "").trim())
      : [],
  );
  const [symbol, setSymbol] = useState(product?.symbol ?? "");
  const [catalogNumber, setCatalogNumber] = useState(product?.catalog_number ?? "");
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
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [descTagsText, setDescTagsText] = useState("");
  const [descShort, setDescShort] = useState("");
  const [descSerialNotes, setDescSerialNotes] = useState("");
  const [descLong, setDescLong] = useState("");
  const [descAttributeGroup, setDescAttributeGroup] = useState("");
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
  const [maxStackCount, setMaxStackCount] = useState<number | "">(() => {
    const mc = product?.product_max_stack_count ?? product?.max_stack_count;
    return mc != null && mc > 0 ? mc : "";
  });
  const [fragile, setFragile] = useState<boolean>(
    Boolean(product?.product_fragile ?? product?.fragile ?? false),
  );
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
  const [cartonMaxStackCount, setCartonMaxStackCount] = useState<number | "">(() => {
    const mc = product?.carton_max_stack_count;
    return mc != null && mc > 0 ? mc : "";
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
  const [validationSkips, setValidationSkips] = useState({
    validation_skip_dimensions: Boolean(product?.validation_skip_dimensions),
    validation_skip_weight: Boolean(product?.validation_skip_weight),
    validation_skip_batch: Boolean(product?.validation_skip_batch),
    validation_skip_expiry: Boolean(product?.validation_skip_expiry),
    validation_skip_serial: Boolean(product?.validation_skip_serial),
    validation_skip_master_carton: Boolean(product?.validation_skip_master_carton),
    validation_skip_master_carton_ean: Boolean(product?.validation_skip_master_carton_ean),
    validation_skip_master_carton_qty: Boolean(product?.validation_skip_master_carton_qty),
    validation_skip_master_carton_dims: Boolean(product?.validation_skip_master_carton_dims),
    validation_skip_master_carton_weight: Boolean(product?.validation_skip_master_carton_weight),
  });
  const [globalValidation, setGlobalValidation] = useState<ProductValidationGlobalSettings | null>(null);

  useEffect(() => {
    void getWmsProductValidationSettings()
      .then((s) =>
        setGlobalValidation({
          require_dimensions: s.require_dimensions,
          require_weight: s.require_weight,
          require_batch: s.require_batch,
          require_expiry: s.require_expiry,
          require_serial: s.require_serial,
          require_master_carton: s.require_master_carton,
          require_master_carton_ean: s.require_master_carton_ean,
          require_master_carton_qty: s.require_master_carton_qty,
          require_master_carton_dims: s.require_master_carton_dims,
          require_master_carton_weight: s.require_master_carton_weight,
        }),
      )
      .catch(() => setGlobalValidation(null));
  }, []);

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
      productionReserved:
        product?.production_reserved_quantity != null &&
        Number.isFinite(product.production_reserved_quantity)
          ? String(Math.round(product.production_reserved_quantity))
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
      {
        const primary = (product.ean ?? "").trim();
        const extras = Array.isArray(product.extra_barcodes)
          ? product.extra_barcodes
              .map((b) => (b.ean ?? "").trim())
              .filter((code) => code && code !== primary)
          : [];
        setExtraEans(extras);
      }
      setSymbol(product.symbol ?? "");
      setCatalogNumber(product.catalog_number ?? "");
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
      setMaxStackCount(
        (() => {
          const mc = product.product_max_stack_count ?? product.max_stack_count;
          return mc != null && mc > 0 ? mc : "";
        })(),
      );
      setFragile(Boolean(product.product_fragile ?? product.fragile ?? false));
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
      setCartonMaxStackCount(
        product.carton_max_stack_count != null && product.carton_max_stack_count > 0 ? product.carton_max_stack_count : "",
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
      setValidationSkips({
        validation_skip_dimensions: Boolean(product.validation_skip_dimensions),
        validation_skip_weight: Boolean(product.validation_skip_weight),
        validation_skip_batch: Boolean(product.validation_skip_batch),
        validation_skip_expiry: Boolean(product.validation_skip_expiry),
        validation_skip_serial: Boolean(product.validation_skip_serial),
        validation_skip_master_carton: Boolean(product.validation_skip_master_carton),
        validation_skip_master_carton_ean: Boolean(product.validation_skip_master_carton_ean),
        validation_skip_master_carton_qty: Boolean(product.validation_skip_master_carton_qty),
        validation_skip_master_carton_dims: Boolean(product.validation_skip_master_carton_dims),
        validation_skip_master_carton_weight: Boolean(product.validation_skip_master_carton_weight),
      });
    } else {
      setCatalogNumber("");
      setSymbol("");
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
      setExtraEans([]);
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
      setDescTagsText("");
      setDescShort("");
      setDescSerialNotes("");
      setDescLong("");
      setDescAttributeGroup("");
      return;
    }
    const meta = product.metadata_json;
    setLabelData(parseLabelData(meta));
    const desc = parseProductDescription(meta);
    setDescTagsText(desc.tagsText);
    setDescShort(desc.shortDescription);
    setDescSerialNotes(desc.serialNotes);
    setDescLong(desc.longDescription);
    setDescAttributeGroup(desc.attributeGroup);
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
        description: {
          tagsText: descTagsText,
          shortDescription: descShort,
          serialNotes: descSerialNotes,
          longDescription: descLong,
          attributeGroup: descAttributeGroup,
        },
      });
      const mainImgResolved = pickMainImageUrl(imagesForMeta, image_url);

      const payload: ProductForm = {
        name: name.trim(),
        ean: ean.trim(),
        symbol: symbol.trim(),
        catalog_number: catalogNumber.trim() || null,
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
        product_max_stack_count: maxStackCount === "" ? undefined : typeof maxStackCount === "number" ? maxStackCount : parseInt(String(maxStackCount), 10) || undefined,
        product_stack_behavior: stackBehavior,
        product_fragile: fragile,
        fragile: fragile,
        orientation_type: orientationType,
        shape_type: shapeType,
        stack_compressible: stackCompressible,
        compressed_height_cm:
          compressedHeightCm === "" ? undefined : typeof compressedHeightCm === "number" ? compressedHeightCm : parseDecimal(String(compressedHeightCm)) ?? undefined,
        max_stack_weight:
          maxStackWeight === "" ? undefined : typeof maxStackWeight === "number" ? maxStackWeight : parseDecimal(String(maxStackWeight)) ?? undefined,
        max_stack_count: maxStackCount === "" ? undefined : typeof maxStackCount === "number" ? maxStackCount : parseInt(String(maxStackCount), 10) || undefined,
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
        carton_max_stack_count:
          cartonMaxStackCount === ""
            ? undefined
            : typeof cartonMaxStackCount === "number"
              ? cartonMaxStackCount
              : parseInt(String(cartonMaxStackCount), 10) || undefined,
        carton_stack_behavior: cartonStackBehavior,
        min_pick_quantity: minPickVal ?? undefined,
        max_pick_quantity: maxPickVal ?? undefined,
        min_reserve_quantity: minReserveVal ?? undefined,
        max_reserve_quantity: maxReserveVal ?? undefined,
        enable_stock_alert: enableStockAlert,
        ...(enableStockAlert && minTotalVal != null ? { min_total_stock: minTotalVal } : {}),
        ...validationSkips,
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
        catalog_number: payload.catalog_number ?? null,
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
        product_max_stack_count: maxStackCount === "" ? undefined : parseNumber(maxStackCount) ?? undefined,
        product_stack_behavior: stackBehavior,
        product_fragile: fragile,
        fragile: fragile,
        carton_orientation_type: cartonOrientationType,
        carton_shape_type: cartonShapeType,
        carton_stack_compressible: cartonStackCompressible,
        carton_compressed_height_cm: cartonCompressedHeightCm === "" ? undefined : parseNumber(cartonCompressedHeightCm) ?? undefined,
        carton_max_stack_weight: cartonMaxStackWeight === "" ? undefined : parseNumber(cartonMaxStackWeight) ?? undefined,
        carton_max_stack_count: cartonMaxStackCount === "" ? undefined : parseNumber(cartonMaxStackCount) ?? undefined,
        carton_stack_behavior: cartonStackBehavior,
        min_pick_quantity: minPickVal ?? undefined,
        max_pick_quantity: maxPickVal ?? undefined,
        min_reserve_quantity: minReserveVal ?? undefined,
        max_reserve_quantity: maxReserveVal ?? undefined,
        enable_stock_alert: enableStockAlert,
        ...validationSkips,
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
      {
        const primary = ean.trim();
        const seen = new Set<string>();
        const extras: { ean: string; multiplier: number }[] = [];
        for (const raw of extraEans) {
          const code = raw.trim();
          if (!code || code === primary || seen.has(code)) continue;
          seen.add(code);
          extras.push({ ean: code, multiplier: 1 });
        }
        body.extra_barcodes = extras;
      }
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
          validation_skip_dimensions: Boolean(d?.validation_skip_dimensions ?? validationSkips.validation_skip_dimensions),
          validation_skip_weight: Boolean(d?.validation_skip_weight ?? validationSkips.validation_skip_weight),
          validation_skip_batch: Boolean(d?.validation_skip_batch ?? validationSkips.validation_skip_batch),
          validation_skip_expiry: Boolean(d?.validation_skip_expiry ?? validationSkips.validation_skip_expiry),
          validation_skip_serial: Boolean(d?.validation_skip_serial ?? validationSkips.validation_skip_serial),
          validation_skip_master_carton: Boolean(d?.validation_skip_master_carton ?? validationSkips.validation_skip_master_carton),
          validation_skip_master_carton_ean: Boolean(
            d?.validation_skip_master_carton_ean ?? validationSkips.validation_skip_master_carton_ean,
          ),
          validation_skip_master_carton_qty: Boolean(
            d?.validation_skip_master_carton_qty ?? validationSkips.validation_skip_master_carton_qty,
          ),
          validation_skip_master_carton_dims: Boolean(
            d?.validation_skip_master_carton_dims ?? validationSkips.validation_skip_master_carton_dims,
          ),
          validation_skip_master_carton_weight: Boolean(
            d?.validation_skip_master_carton_weight ?? validationSkips.validation_skip_master_carton_weight,
          ),
          product_orientation_type: parseOrient(d?.product_orientation_type ?? d?.orientation_type),
          product_shape_type: parseShape(d?.product_shape_type ?? d?.shape_type),
          product_stack_compressible: Boolean(d?.product_stack_compressible ?? d?.stack_compressible),
          product_compressed_height_cm:
            d?.product_compressed_height_cm != null ? Number(d.product_compressed_height_cm) : payload.product_compressed_height_cm,
          product_max_stack_weight:
            d?.product_max_stack_weight != null ? Number(d.product_max_stack_weight) : payload.product_max_stack_weight,
          product_stack_behavior: parseStackBehavior(d?.product_stack_behavior ?? d?.stack_behavior),
          product_fragile: Boolean(d?.product_fragile ?? d?.fragile ?? fragile),
          fragile: Boolean(d?.product_fragile ?? d?.fragile ?? fragile),
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
          validation_skip_dimensions: Boolean(d?.validation_skip_dimensions ?? validationSkips.validation_skip_dimensions),
          validation_skip_weight: Boolean(d?.validation_skip_weight ?? validationSkips.validation_skip_weight),
          validation_skip_batch: Boolean(d?.validation_skip_batch ?? validationSkips.validation_skip_batch),
          validation_skip_expiry: Boolean(d?.validation_skip_expiry ?? validationSkips.validation_skip_expiry),
          validation_skip_serial: Boolean(d?.validation_skip_serial ?? validationSkips.validation_skip_serial),
          validation_skip_master_carton: Boolean(d?.validation_skip_master_carton ?? validationSkips.validation_skip_master_carton),
          validation_skip_master_carton_ean: Boolean(
            d?.validation_skip_master_carton_ean ?? validationSkips.validation_skip_master_carton_ean,
          ),
          validation_skip_master_carton_qty: Boolean(
            d?.validation_skip_master_carton_qty ?? validationSkips.validation_skip_master_carton_qty,
          ),
          validation_skip_master_carton_dims: Boolean(
            d?.validation_skip_master_carton_dims ?? validationSkips.validation_skip_master_carton_dims,
          ),
          validation_skip_master_carton_weight: Boolean(
            d?.validation_skip_master_carton_weight ?? validationSkips.validation_skip_master_carton_weight,
          ),
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
          product_fragile: Boolean(d?.product_fragile ?? d?.fragile ?? fragile),
          fragile: Boolean(d?.product_fragile ?? d?.fragile ?? fragile),
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
      setActivityRefreshKey((k) => k + 1);
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
    // Podstawowe, Ceny, Opis, Zdjęcia, Oferty, Produkcja, Etykieta, Magazyn
    if (!isNew) {
      return ["basic", "prices", "description", "images", "offers", "production", "labelSheet", "warehouse"];
    }
    return ["basic", "prices", "description", "images", "offers", "labelSheet", "warehouse"];
  }, [isNew]);

  const railLabel: Record<TabId, string> = {
    basic: "Podstawowe",
    prices: "Ceny",
    description: "Opis",
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
    description: AlignLeft,
    warehouse: Warehouse,
    warehouseOps: ClipboardList,
    logistics: Truck,
    offers: Layers,
    settings: Wrench,
    production: Factory,
  };

  const tenantDisplay =
    tenantId != null ? (tenants.find((t) => t.id === tenantId)?.name ?? "").trim() || `#${tenantId}` : "—";

  const productStatCards = useMemo((): ProductLikeStatCard[] => {
    const stockValue =
      physicalStockDisplay != null && physicalStockDisplay !== "—" ? physicalStockDisplay : "—";
    return [
      {
        label: "Stan magazynu",
        value: stockValue,
        unit: stockValue !== "—" ? "szt." : undefined,
        variant: "slate",
      },
      {
        label: "Cena netto",
        value: formatMoneyZlDisplay(pricingDisplay.saleNet, "—").replace(/\s*zł$/, "").trim() || "—",
        unit: pricingDisplay.saleNet != null ? "zł" : undefined,
        subValue: `Brutto: ${formatMoneyZlDisplay(pricingDisplay.saleGross, "brak danych")}`,
        variant: "green",
      },
      {
        label: "Marża",
        value: (
          <span className="inline-flex items-center gap-1.5">
            {pricingDisplay.marginLabel}
            <TrendingUp className="h-3.5 w-3.5 text-orange-500" strokeWidth={2} aria-hidden />
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
            {!isNew && product?.id != null ? (
              <button
                type="button"
                disabled={orderBusy}
                onClick={() => {
                  void (async () => {
                    if (product.default_supplier_id == null && defaultSupplierId == null) {
                      toast.error("Ustaw domyślnego dostawcę w zakładce Podstawowe / Dostawcy, aby zamówić.");
                      setActiveTab("suppliers");
                      return;
                    }
                    if (!hasActiveWarehouse || warehouseId == null) {
                      toast.error(ACTIVE_WAREHOUSE_REQUIRED_MESSAGE);
                      return;
                    }
                    const tid = product.tenant_id ?? tenantId ?? 1;
                    setOrderBusy(true);
                    try {
                      const d = await quickPurchaseOrderFromProduct({
                        tenant_id: tid,
                        warehouse_id: warehouseId,
                        product_id: product.id!,
                      });
                      navigate(`/goods-orders/${d.id}?tenant_id=${tid}`);
                    } catch (e: unknown) {
                      let msg = "Nie udało się utworzyć szkicu zamówienia.";
                      if (axios.isAxiosError(e)) {
                        const data = e.response?.data;
                        if (data && typeof data === "object" && "detail" in data) {
                          const det = (data as { detail: unknown }).detail;
                          if (typeof det === "string") msg = det;
                        }
                      }
                      toast.error(msg);
                    } finally {
                      setOrderBusy(false);
                    }
                  })();
                }}
                className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {orderBusy ? "Tworzenie…" : "Zamów u dostawcy"}
              </button>
            ) : null}
            {!isNew && product?.id != null ? (
              <button
                type="button"
                title="Drukuj etykietę produktu"
                onClick={() => setHeaderLabelPrintOpen(true)}
                className="hidden items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 sm:flex"
              >
                <Printer className="h-4 w-4 text-slate-500" strokeWidth={2} aria-hidden />
                Drukuj
              </button>
            ) : null}
            {isPage ? <div className="mx-1 hidden h-6 w-px bg-slate-300 md:block" aria-hidden /> : null}
            <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
              <button
                type="button"
                title="Kopiuj"
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
                      navigate(getProductDetailsPath(newId), { state: productDetailsNavState({ tenantId }) });
                    } catch (e: unknown) {
                      logError("duplicateProduct failed", e);
                      toast.error(extractApiErrorMessage(e, "Kopiowanie produktu nie powiodło się."));
                    } finally {
                      setDupBusy(false);
                    }
                  })();
                }}
                className="flex items-center justify-center border-r border-slate-300 px-3 py-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
              >
                <Copy className="h-4 w-4" strokeWidth={2} aria-hidden />
                <span className="sr-only">Kopiuj</span>
              </button>
              <details className="relative">
                <summary
                  className="list-none flex cursor-pointer items-center justify-center px-3 py-2 text-slate-600 transition-colors marker:content-none hover:bg-slate-50 hover:text-slate-900 [&::-webkit-details-marker]:hidden"
                  title="Więcej"
                >
                  <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
                  <span className="sr-only">Więcej</span>
                </summary>
                <div className="absolute right-0 z-50 mt-2 w-48 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-xl">
                  <button
                    type="button"
                    disabled={galleryUploadBusy}
                    onClick={() => headerGalleryInputRef.current?.click()}
                    className="block w-full px-4 py-2 text-left font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 disabled:opacity-50"
                  >
                    {galleryUploadBusy ? "Wgrywanie…" : "Wgraj zdjęcie"}
                  </button>
                  <Link to={backListTo} className="block px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600">
                    {returnToRaw?.trim() ? "Wróć" : "Wróć do listy"}
                  </Link>
                  {!isNew && product?.id != null && tenantId != null ? (
                    <button
                      type="button"
                      disabled={deleteBusy}
                      onClick={() => {
                        if (
                          !window.confirm(
                            "Usunąć ten produkt? Powiązane z historią zostaną zarchiwizowane, pozostałe usunięte trwale.",
                          )
                        ) {
                          return;
                        }
                        void (async () => {
                          setDeleteBusy(true);
                          try {
                            const summary = await postProductsBulkDelete({
                              tenant_id: tenantId,
                              selection: { mode: "explicit_ids", ids: [product.id!] },
                            });
                            if (summary.errors?.length) {
                              toast.error(summary.errors.join("; "));
                              return;
                            }
                            toast.success(
                              summary.soft_deleted_count
                                ? "Produkt zarchiwizowany."
                                : "Produkt usunięty.",
                            );
                            navigate(backListTo);
                          } catch (e: unknown) {
                            toast.error(extractApiErrorMessage(e, "Nie udało się usunąć produktu."));
                          } finally {
                            setDeleteBusy(false);
                          }
                        })();
                      }}
                      className="block w-full px-4 py-2 text-left font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deleteBusy ? "Usuwanie…" : "Usuń produkt"}
                    </button>
                  ) : null}
                </div>
              </details>
            </div>
          </>
        }
        tabs={railTabOrder.map((tabId) => ({ id: tabId, label: railLabel[tabId], icon: railIcon[tabId] }))}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSubmit={handleSubmit}
        saving={saving}
      >
                {activeTab === "basic" && (
                  <ProductEditBasicTab
                    isNew={isNew}
                    saving={saving}
                    name={name}
                    setName={setName}
                    tenantId={tenantId}
                    setTenantId={setTenantId}
                    tenants={tenants}
                    symbol={symbol}
                    setSymbol={setSymbol}
                    catalogNumber={catalogNumber}
                    setCatalogNumber={setCatalogNumber}
                    ean={ean}
                    setEan={setEan}
                    extraEans={extraEans}
                    setExtraEans={setExtraEans}
                    length={length}
                    width={width}
                    height={height}
                    weight={weight}
                    volume={volume}
                    unit={unit}
                    setUnit={setUnit}
                    setWeight={setWeight}
                    updateDimension={updateDimension}
                    bulkEan={bulkEan}
                    setBulkEan={setBulkEan}
                    unitsPerCarton={unitsPerCarton}
                    setUnitsPerCarton={setUnitsPerCarton}
                    cartonLength={cartonLength}
                    cartonWidth={cartonWidth}
                    cartonHeight={cartonHeight}
                    cartonWeight={cartonWeight}
                    cartonVolume={cartonVolume}
                    setCartonWeight={setCartonWeight}
                    updateCartonDimension={updateCartonDimension}
                    round2={round2}
                    productId={product?.id}
                    effectiveTenantId={effectiveTenantId}
                    labelTemplateId={labelTemplateId}
                    manufacturerId={manufacturerId}
                    setManufacturerId={setManufacturerId}
                    manufacturersCatalog={manufacturersCatalog}
                    manufacturer={manufacturer}
                    setManufacturer={setManufacturer}
                    responsiblePerson={responsiblePerson}
                    setResponsiblePerson={setResponsiblePerson}
                    responsiblePersonEmail={responsiblePersonEmail}
                    setResponsiblePersonEmail={setResponsiblePersonEmail}
                    globalValidation={globalValidation}
                    validationSkips={validationSkips}
                    setValidationSkips={setValidationSkips}
                  />
                )}

                {activeTab === "prices" && (
                  <ProductEditPricesTab
                    isNew={isNew}
                    salePrice={salePrice}
                    setSalePrice={setSalePrice}
                    purchasePrice={purchasePrice}
                    setPurchasePrice={setPurchasePrice}
                    extraCostPackagingNet={extraCostPackagingNet}
                    setExtraCostPackagingNet={setExtraCostPackagingNet}
                    extraCostCommissionPercent={extraCostCommissionPercent}
                    setExtraCostCommissionPercent={setExtraCostCommissionPercent}
                    extraCostOtherNet={extraCostOtherNet}
                    setExtraCostOtherNet={setExtraCostOtherNet}
                    vatRate={vatRate}
                    setVatRate={setVatRate}
                    promotion={promotion}
                    setPromotion={setPromotion}
                    cheapestSupplierInsight={cheapestSupplierInsight}
                    supplierLinkRows={supplierLinkRows}
                    supplierLinksBusy={supplierLinksBusy}
                    suppliersCatalog={suppliersCatalog}
                    addSupplierPick={addSupplierPick}
                    setAddSupplierPick={setAddSupplierPick}
                    defaultSupplierId={defaultSupplierId}
                    setDefaultSupplierId={setDefaultSupplierId}
                    onAddSupplierLink={() => void onAddSupplierLink()}
                    onPatchSupplierLinkPrice={(linkId, raw) => void onPatchSupplierLinkPrice(linkId, raw)}
                    onRemoveSupplierLink={(linkId, supplierId) => void onRemoveSupplierLink(linkId, supplierId)}
                    previousPurchasePrice={previousPurchasePrice}
                    lastPurchaseDate={lastPurchaseDate}
                    lastSupplierName={lastSupplierName}
                    lastPurchaseCurrency={lastPurchaseCurrency}
                    purchasePriceOriginal={purchasePriceOriginal}
                    purchaseCurrency={purchaseCurrency}
                    pricingDisplay={pricingDisplay}
                    formatMoneyZl={formatMoneyZl}
                    formatDateTimePl={formatDateTimePl}
                  />
                )}

                {activeTab === "description" && (
                  <ProductEditDescriptionTab
                    tagsText={descTagsText}
                    setTagsText={setDescTagsText}
                    shortDescription={descShort}
                    setShortDescription={setDescShort}
                    serialNotes={descSerialNotes}
                    setSerialNotes={setDescSerialNotes}
                    longDescription={descLong}
                    setLongDescription={setDescLong}
                    attributeGroup={descAttributeGroup}
                    setAttributeGroup={setDescAttributeGroup}
                    saving={saving}
                  />
                )}

                {activeTab === "warehouse" && (
                  <ProductEditWarehouseTab
                    isNew={isNew}
                    saving={saving}
                    productId={product?.id ?? null}
                    productName={product?.name ?? name}
                    tenantId={tenantId}
                    warehouseId={warehouse?.id ?? null}
                    physicalStockDisplay={physicalStockDisplay}
                    inventoryBreakdown={inventoryBreakdown}
                    dispositionStock={product?.disposition_stock ?? null}
                    commerciallySellableQty={product?.commercially_sellable_qty ?? null}
                    salesBlockedQty={product?.sales_blocked_qty ?? null}
                    networkCommerciallySellableQty={product?.network_commercially_sellable_qty ?? null}
                    inventoryRows={magazynInventoryRows as MagazynInvRowDisplay[]}
                    emptyLocationsMessage={magazynEmptyLocationsMessage}
                    canManualAdjustStock={canManualAdjustStock}
                    stockCorrectionOpen={stockCorrectionOpen}
                    setStockCorrectionOpen={setStockCorrectionOpen}
                    onStockCorrectionSuccess={() => void reloadProductAfterStockCorrection()}
                    onEditTraceability={isNew ? undefined : (row) => setTraceEditRow(row)}
                    enableStockAlert={enableStockAlert}
                    setEnableStockAlert={setEnableStockAlert}
                    minTotalStock={minTotalStock}
                    setMinTotalStock={setMinTotalStock}
                    orientationType={orientationType}
                    setOrientationType={setOrientationType}
                    shapeType={shapeType}
                    setShapeType={setShapeType}
                    stackBehavior={stackBehavior}
                    setStackBehavior={setStackBehavior}
                    fragile={fragile}
                    setFragile={setFragile}
                    stackCompressible={stackCompressible}
                    setStackCompressible={setStackCompressible}
                    compressedHeightCm={compressedHeightCm}
                    setCompressedHeightCm={setCompressedHeightCm}
                    maxStackWeight={maxStackWeight}
                    setMaxStackWeight={setMaxStackWeight}
                    maxStackCount={maxStackCount}
                    setMaxStackCount={setMaxStackCount}
                    cartonOrientationType={cartonOrientationType}
                    setCartonOrientationType={setCartonOrientationType}
                    cartonShapeType={cartonShapeType}
                    setCartonShapeType={setCartonShapeType}
                    cartonStackBehavior={cartonStackBehavior}
                    setCartonStackBehavior={setCartonStackBehavior}
                    cartonStackCompressible={cartonStackCompressible}
                    setCartonStackCompressible={setCartonStackCompressible}
                    cartonCompressedHeightCm={cartonCompressedHeightCm}
                    setCartonCompressedHeightCm={setCartonCompressedHeightCm}
                    cartonMaxStackWeight={cartonMaxStackWeight}
                    setCartonMaxStackWeight={setCartonMaxStackWeight}
                    cartonMaxStackCount={cartonMaxStackCount}
                    setCartonMaxStackCount={setCartonMaxStackCount}
                    minPickQuantity={minPickQuantity}
                    setMinPickQuantity={setMinPickQuantity}
                    maxPickQuantity={maxPickQuantity}
                    setMaxPickQuantity={setMaxPickQuantity}
                    minReserveQuantity={minReserveQuantity}
                    setMinReserveQuantity={setMinReserveQuantity}
                    maxReserveQuantity={maxReserveQuantity}
                    setMaxReserveQuantity={setMaxReserveQuantity}
                    dimensionsComplete={productDimensions != null}
                  />
                )}

                {activeTab === "images" && (
                  <ProductEditImagesTab
                    productImages={productImages}
                    setProductImages={setProductImages}
                    newGalleryUrl={newGalleryUrl}
                    setNewGalleryUrl={setNewGalleryUrl}
                    galleryUploadBusy={galleryUploadBusy}
                    onAddFromUrl={addGalleryFromUrl}
                    onFileSelected={onGalleryFileSelected}
                    onSetMain={setGalleryMain}
                    onMove={moveGalleryImage}
                    onRemove={removeGalleryImage}
                  />
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
                  <ProductEditLabelTab
                    labelTemplateId={labelTemplateId}
                    setLabelTemplateId={setLabelTemplateId}
                    productTemplates={productTemplates}
                    labelData={labelData}
                    setLabelData={setLabelData}
                    name={name}
                    ean={ean}
                    manufacturerId={manufacturerId}
                    manufacturerReadonly={manufacturerReadonly}
                    manufacturer={manufacturer}
                    salePrice={salePrice}
                    parseDecimal={parseDecimal}
                  />
                )}

                {!isNew && product?.id != null ? (
                  <div className="mt-8 w-full max-w-none border-t border-slate-100 pb-6 pt-4">
                    <ActivityLogPanel
                      objectType="product"
                      objectId={product.id}
                      refreshKey={activityRefreshKey}
                    />
                  </div>
                ) : null}

      </ProductLikePageLayout>

      <EditInventoryTraceabilityModal
        open={traceEditRow != null && !isNew && product?.id != null && tenantId != null}
        tenantId={tenantId ?? 1}
        productId={product?.id ?? 0}
        row={traceEditRow}
        trackBatch={Boolean(globalValidation?.require_batch && !validationSkips.validation_skip_batch)}
        trackExpiry={Boolean(globalValidation?.require_expiry && !validationSkips.validation_skip_expiry)}
        trackSerial={Boolean(globalValidation?.require_serial && !validationSkips.validation_skip_serial)}
        onClose={() => setTraceEditRow(null)}
        onSaved={() => setTraceEditRow(null)}
      />
      {headerLabelPrintOpen && product?.id != null ? (
        <ProductLabelPrintModal
          product={{
            id: product.id,
            tenant_id: tenantId ?? product.tenant_id ?? undefined,
            label_template_id: labelTemplateId,
          }}
          eanOverride={ean.trim() || null}
          title="Drukuj etykietę — produkt"
          onClose={() => setHeaderLabelPrintOpen(false)}
        />
      ) : null}
    </>
  );

  return shell;
}
