import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Columns3,
  Copy,
  Download,
  Home,
  Pencil,
  Printer,
  Settings2,
  Table2,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { error as logError, log } from "../../utils/logger";
import { extractApiErrorMessage } from "../../api/authApi";
import api from "../../api/axios";
import { duplicateProduct } from "../../api/productsApi";
import { useTranslation } from "../../locales";
import { LocationTypeBadge } from "../../components/warehouse/LocationTypeBadge";
import { getManufacturer } from "../../api/manufacturersApi";
import { mapProductListRow, type ProductListRow } from "./productListMapper";
import { ProductBulkActionModal } from "./ProductBulkActionModal";
import { ProductBulkDeleteModal } from "./ProductBulkDeleteModal";
import { ProductBulkHubModal } from "./ProductBulkHubModal";
import { ProductBulkPatchModal } from "./ProductBulkPatchModal";
import { isBulkPatchPreset, isBulkUpdateAction, type ProductBulkHubChoice } from "./productBulkHubTypes";
import { ProductListLogisticsBadges } from "./productListLogisticsBadges";
import type { ProductBulkPatchPreset } from "./productBulkLogisticsFields";
import { fallbackBadgeFromDisposition } from "../../components/products/MagazynInventoryLine";
import type { BulkUpdateAction } from "../../api/productsBulkApi";
import { postProductsBulkDelete, type ProductsBulkDeleteResult } from "../../api/productsBulkApi";
import { buildProductBulkListFiltersPayload } from "../../utils/productListBulkFilters";
import type { ProductBulkModalSelection } from "./ProductBulkActionModal";
import ExportModal from "../../components/exports/ExportModal";
import {
  listSellasistInputClass,
  listSellasistProductListTitleClass,
  listSellasistTableBodyCellGrid,
  listSellasistTableHeaderCellGrid,
  listSellasistToolbarSquareBtn,
  listSellasistToolbarToggleBtn,
} from "../../components/listPage/listSellasistTokens";
import {
  OperationalActionButton,
  OperationalActionColumn,
  operationalActionsColumnWidthClass,
} from "../../components/operational";
import { PageHeader } from "../../components/layout/PageHeader";
import type { ProductListUiFilters as UiFilters } from "./productListUiFilters";
import { DEFAULT_PRODUCT_LIST_UI_FILTERS as defaultFilters } from "./productListUiFilters";
import { ProductListFiltersSection } from "./ProductListFiltersSection";
import { ColumnSelectorModal } from "../../components/columnPicker";
import {
  loadColumnLayout,
  normalizeColumnOrder,
  PRODUCTS_COLUMNS_LAYOUT_KEY,
  saveColumnLayout,
} from "../../preferences/columnLayoutPreferences";
import {
  PRODUCT_LIST_DEFAULT_TABLE_COLUMN_ORDER,
  PRODUCT_LIST_TABLE_CATALOG_IDS,
  PRODUCT_LIST_TABLE_COLUMN_CATALOG,
} from "./productListColumnCatalog";

const ProductLocationMapModal = lazy(() => import("./ProductLocationMapModal"));

type Tenant = { id: number; name: string };

type Product = ProductListRow;

const CLIENT_BATCH_LIMIT = 8000;

function formatPurchasePriceZl(p: Product): string {
  const v = p.purchase_price;
  if (v == null) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `${n.toFixed(2)} zł`;
}

function formatDimensionsCm(p: Product): string {
  const dims: number[] = [];
  if (p.length != null && Number.isFinite(Number(p.length))) dims.push(Number(p.length));
  if (p.width != null && Number.isFinite(Number(p.width))) dims.push(Number(p.width));
  if (p.height != null && Number.isFinite(Number(p.height))) dims.push(Number(p.height));
  const cleaned = dims.filter((x) => x > 0);
  if (cleaned.length === 0) return "";
  const out = cleaned
    .map((x) => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : String(x)))
    .join(" × ");
  return `${out} cm`;
}

/** Pierwszy URL z pola "Zdjęcia" – .split(';')[0] */
function firstImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;
  const first = trimmed.split(";").map((s) => s.trim()).find(Boolean);
  return first || null;
}

const MAX_LOCATION_BADGES = 3;

type PhysicalInvLoc = {
  name: string;
  quantity: number;
  warehouse_id?: number;
  storage_type?: string;
  location_uuid?: string | null;
};

function physicalInventoryLocations(p: Product): PhysicalInvLoc[] {
  const inv = p.inventory;
  if (Array.isArray(inv) && inv.length > 0) {
    return inv
      .filter((row) => (Number(row.quantity) || 0) > 0)
      .map((row) => {
        const code = (row.location_code ?? "").trim() || "";
        const bd =
          (row.disposition_badge ?? "").trim() ||
          fallbackBadgeFromDisposition(String(row.stock_disposition ?? "").trim()) ||
          "";
        const name = bd ? `${code} ${bd}`.trim() : code;
        return {
          name,
          quantity: Number(row.quantity) || 0,
          warehouse_id: row.warehouse_id,
          storage_type: row.location_type,
          location_uuid: row.location_uuid ?? null,
        };
      });
  }
  return (p.locations ?? [])
    .filter((l) => (l.quantity ?? 0) > 0)
    .map((l) => ({
      name: (l.name ?? "").trim() || "",
      quantity: Number(l.quantity) || 0,
      warehouse_id: l.warehouse_id,
      storage_type: l.storage_type,
      location_uuid: l.location_uuid ?? null,
    }));
}

type OpenLocationOnMapPayload = { product: Product; warehouseId: number; focusedUuid: string };

/** Hover popover: full `LocationTypeBadge` rows for overflow (same component as visible rows). */
function LocationOverflowPopover({
  hidden,
  product,
  onOpenLocationOnMap,
}: {
  hidden: PhysicalInvLoc[];
  product: Product;
  onOpenLocationOnMap: (payload: OpenLocationOnMapPayload) => void;
}) {
  const [open, setOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHide = useCallback(() => {
    if (hideTimer.current != null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearHide();
    setOpen(true);
  }, [clearHide]);

  const scheduleHide = useCallback(() => {
    clearHide();
    hideTimer.current = setTimeout(() => setOpen(false), 120);
  }, [clearHide]);

  useEffect(
    () => () => {
      clearHide();
    },
    [clearHide]
  );

  const n = hidden.length;
  if (n === 0) return null;

  return (
    <div className="relative inline-flex min-w-0 max-w-full" onMouseEnter={show} onMouseLeave={scheduleHide}>
      <button
        type="button"
        className="text-left text-xs text-slate-500 underline decoration-dotted decoration-slate-400 underline-offset-2 hover:text-slate-800"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Pokaż ${n} dodatkowych lokalizacji`}
        onClick={(e) => e.stopPropagation()}
      >
        +{n} więcej
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-[60] w-max min-w-[180px] max-w-[300px] rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
          style={{ marginTop: "-6px" }}
          role="dialog"
          aria-label="Dodatkowe lokalizacje"
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex max-h-[min(60vh,20rem)] w-full min-w-[180px] max-w-[300px] flex-col gap-2 overflow-y-auto">
            {hidden.map((l, i) => (
              <LocationTypeBadge
                key={`${l.name}-overflow-${i}`}
                locationText={l.name}
                quantity={l.quantity}
                storageType={l.storage_type}
                layoutSpread
                className="w-full"
                mapPinAction={
                  l.warehouse_id != null && (l.location_uuid ?? "").trim() !== ""
                    ? {
                        title: "Pokaż na mapie magazynu",
                        onClick: () =>
                          onOpenLocationOnMap({
                            product,
                            warehouseId: l.warehouse_id!,
                            focusedUuid: (l.location_uuid ?? "").trim(),
                          }),
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LocationBadgeStack({
  product,
  locations,
  onOpenLocationOnMap,
}: {
  product: Product;
  locations: PhysicalInvLoc[];
  onOpenLocationOnMap: (payload: OpenLocationOnMapPayload) => void;
}) {
  if (locations.length === 0) {
    /* Świadomy status biznesowy — nie ukrywamy pod pustą komórką */
    return <span className="text-xs text-slate-500">Brak lokalizacji</span>;
  }
  const visible = locations.slice(0, MAX_LOCATION_BADGES);
  const hidden = locations.slice(MAX_LOCATION_BADGES);
  return (
    <div className="flex min-w-0 w-full max-w-none flex-col gap-1">
      {visible.map((l, i) => (
        <LocationTypeBadge
          key={`${l.name}-${i}`}
          locationText={l.name}
          quantity={l.quantity}
          storageType={l.storage_type}
          mapPinAction={
            l.warehouse_id != null && (l.location_uuid ?? "").trim() !== ""
              ? {
                  title: "Pokaż na mapie magazynu",
                  onClick: () =>
                    onOpenLocationOnMap({
                      product,
                      warehouseId: l.warehouse_id!,
                      focusedUuid: (l.location_uuid ?? "").trim(),
                    }),
                }
              : undefined
          }
        />
      ))}
      {hidden.length > 0 && (
        <LocationOverflowPopover hidden={hidden} product={product} onOpenLocationOnMap={onOpenLocationOnMap} />
      )}
    </div>
  );
}

function hasPlanVersusPhysicalMismatch(p: Product): boolean {
  const assigned = p.assignedLocations ?? [];
  if (assigned.length === 0) return false;
  const planSum = assigned.reduce((s, a) => s + (Number(a.quantity) || 0), 0);
  const physical = p.stock_quantity ?? 0;
  return Math.abs(planSum - physical) > 0.01;
}

/** Map combined EAN/SKU search to backend params (no OR — heuristic). */
function serverParamsFromEanSku(q: string): { ean?: string; symbol?: string } {
  const t = q.trim().replace(/\s+/g, "");
  if (!t) return {};
  if (/^\d+$/.test(t) && t.length >= 4) return { ean: t };
  return { symbol: t };
}

function needsClientSideFiltering(f: UiFilters): boolean {
  return (
    f.stockMin.trim() !== "" ||
    f.stockMax.trim() !== "" ||
    f.priceMin.trim() !== "" ||
    f.priceMax.trim() !== "" ||
    f.weightMin.trim() !== "" ||
    f.weightMax.trim() !== "" ||
    f.producer !== "all" ||
    f.status !== "all" ||
    f.hasLocations !== "all" ||
    f.mismatch !== "all"
  );
}

function applyClientFilters(products: Product[], f: UiFilters): Product[] {
  return products.filter((p) => {
    const stock = p.stock_quantity ?? 0;
    if (f.stockMin.trim() !== "") {
      const n = Number.parseFloat(f.stockMin.replace(",", "."));
      if (Number.isFinite(n) && stock < n) return false;
    }
    if (f.stockMax.trim() !== "") {
      const n = Number.parseFloat(f.stockMax.replace(",", "."));
      if (Number.isFinite(n) && stock > n) return false;
    }
    const price = p.sale_price ?? p.purchase_price ?? null;
    if (f.priceMin.trim() !== "") {
      const n = Number.parseFloat(f.priceMin.replace(",", "."));
      if (!Number.isFinite(n) || price == null || price < n) return false;
    }
    if (f.priceMax.trim() !== "") {
      const n = Number.parseFloat(f.priceMax.replace(",", "."));
      if (!Number.isFinite(n) || price == null || price > n) return false;
    }
    const w = p.weight;
    if (f.weightMin.trim() !== "") {
      const n = Number.parseFloat(f.weightMin.replace(",", "."));
      if (!Number.isFinite(n) || w == null || Number(w) < n) return false;
    }
    if (f.weightMax.trim() !== "") {
      const n = Number.parseFloat(f.weightMax.replace(",", "."));
      if (!Number.isFinite(n) || w == null || Number(w) > n) return false;
    }
    if (f.producer !== "all") {
      const m = ((p.manufacturer_brief?.name ?? p.manufacturer) ?? "").trim();
      if (m !== f.producer) return false;
    }
    if (f.status === "complete") {
      if (!(p.length && p.width && p.height)) return false;
    }
    if (f.status === "incomplete") {
      if (p.length && p.width && p.height) return false;
    }
    const hasPhys = physicalInventoryLocations(p).length > 0;
    if (f.hasLocations === "with" && !hasPhys) return false;
    if (f.hasLocations === "without" && hasPhys) return false;
    const mm = hasPlanVersusPhysicalMismatch(p);
    if (f.mismatch === "yes" && !mm) return false;
    if (f.mismatch === "no" && mm) return false;
    return true;
  });
}

function formatPriceZl(p: Product): string {
  const v = p.sale_price ?? p.purchase_price;
  if (v == null || Number.isNaN(Number(v))) return "";
  return `${Number(v).toFixed(2)} zł`;
}

/** Stan × średnia ważona z RECEIPT (operacje magazynowe). */
function formatInventoryValueZl(p: Product): string {
  const stock = p.stock_quantity ?? 0;
  if (stock === 0) return "0 zł";
  const iv = p.inventory_value;
  if (iv == null || !Number.isFinite(iv)) return "";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(iv);
}

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200, 500] as const;
type SortKey = "id" | "name" | "ean" | "symbol" | "volume" | "weight" | "inventory_value";

export default function ProductList() {
  const t = useTranslation();
  const navigate = useNavigate();
  /** Nawigacja do karty produktu — używana przez cały wiersz tabeli (bez checkboxa i akcji). */
  const openProductEdit = useCallback(
    (p: Product) => {
      navigate(`/products/${p.id}/edit`, {
        state: { tenantId: p.tenant_id ?? undefined },
      });
    },
    [navigate],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const manufacturerFilterId = useMemo(() => {
    const v = searchParams.get("manufacturer_id");
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 ? n : null;
  }, [searchParams]);

  const [catalog, setCatalog] = useState<Product[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<UiFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<UiFilters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortBy, setSortBy] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [productBulkMode, setProductBulkMode] = useState<"none" | "filtered_all" | "explicit">("none");
  const [productBulkSelectKey, setProductBulkSelectKey] = useState(0);
  const [bulkActionChoice, setBulkActionChoice] = useState<BulkUpdateAction | "">("");
  const [bulkPatchPreset, setBulkPatchPreset] = useState<ProductBulkPatchPreset | "">("");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkHubOpen, setBulkHubOpen] = useState(false);
  const [rowDeleteBusyId, setRowDeleteBusyId] = useState<number | null>(null);
  const [rowDupBusyId, setRowDupBusyId] = useState<number | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantFilter, setTenantFilter] = useState<number | null>(null);
  const [locationMapModal, setLocationMapModal] = useState<null | {
    productId: number;
    productName: string;
    warehouseId: number;
    tenantId: number;
    focusedLocationUuid: string;
    relatedLocationUuids: string[];
  }>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const [manufacturerFilterName, setManufacturerFilterName] = useState<string | null>(null);
  const [manufacturerFilterMetaLoading, setManufacturerFilterMetaLoading] = useState(false);

  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    try {
      const v = localStorage.getItem("products.list.filtersExpanded");
      if (v === "0") return false;
      return true;
    } catch {
      return true;
    }
  });

  const toggleFiltersPanel = () => {
    setFiltersExpanded((prev) => {
      const n = !prev;
      try {
        localStorage.setItem("products.list.filtersExpanded", n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });
  };

  const openFilterFieldsRef = useRef<(() => void) | null>(null);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);
  /** Poziomy scroll tabeli + górny/dolny pasek przewijania zsynchronizowany (bez zejścia na dół strony). */
  const tableHScrollRef = useRef<HTMLDivElement>(null);
  const tableHScrollMirrorTopRef = useRef<HTMLDivElement>(null);
  const tableHScrollMirrorBottomRef = useRef<HTMLDivElement>(null);
  const tableElementRef = useRef<HTMLTableElement>(null);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [productColumnOrder, setProductColumnOrder] = useState<string[]>(() =>
    loadColumnLayout(PRODUCTS_COLUMNS_LAYOUT_KEY, PRODUCT_LIST_TABLE_CATALOG_IDS, PRODUCT_LIST_DEFAULT_TABLE_COLUMN_ORDER),
  );

  const persistProductColumns = useCallback((next: string[]) => {
    const n = normalizeColumnOrder(next, PRODUCT_LIST_TABLE_CATALOG_IDS, PRODUCT_LIST_DEFAULT_TABLE_COLUMN_ORDER);
    setProductColumnOrder(n);
    saveColumnLayout(PRODUCTS_COLUMNS_LAYOUT_KEY, n);
  }, []);

  useEffect(() => {
    if (manufacturerFilterId == null || tenantFilter == null) {
      setManufacturerFilterName(null);
      setManufacturerFilterMetaLoading(false);
      return;
    }
    let cancelled = false;
    setManufacturerFilterMetaLoading(true);
    void getManufacturer(tenantFilter, manufacturerFilterId, 1)
      .then((d) => {
        if (!cancelled) setManufacturerFilterName((d.name ?? "").trim() || null);
      })
      .catch(() => {
        if (!cancelled) setManufacturerFilterName(null);
      })
      .finally(() => {
        if (!cancelled) setManufacturerFilterMetaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [manufacturerFilterId, tenantFilter]);

  useEffect(() => {
    const tid = searchParams.get("tenant_id");
    if (tid == null || tid === "") return;
    const n = Number(tid);
    if (!Number.isFinite(n) || n < 1) return;
    setTenantFilter((prev) => (prev === n ? prev : n));
  }, [searchParams]);

  const clientMode = useMemo(() => needsClientSideFiltering(appliedFilters), [appliedFilters]);

  const productBulkFiltersPayload = useMemo(
    () =>
      buildProductBulkListFiltersPayload({
        manufacturerId: manufacturerFilterId,
        name: appliedFilters.name,
        eanSku: appliedFilters.eanSku,
      }),
    [manufacturerFilterId, appliedFilters.name, appliedFilters.eanSku],
  );

  useEffect(() => {
    setSelectedIds(new Set());
    setProductBulkMode("none");
    setProductBulkSelectKey((k) => k + 1);
  }, [clientMode, tenantFilter, manufacturerFilterId, appliedFilters, page, rowsPerPage, sortBy, sortDir]);

  const openProductLocationOnMap = useCallback(
    (payload: OpenLocationOnMapPayload) => {
      const { product, warehouseId, focusedUuid } = payload;
      const related = (product.locations ?? [])
        .filter(
          (loc) =>
            (loc.quantity ?? 0) > 0 &&
            loc.warehouse_id === warehouseId &&
            typeof loc.location_uuid === "string" &&
            loc.location_uuid.trim() !== "",
        )
        .map((loc) => loc.location_uuid!.trim());
      setLocationMapModal({
        productId: product.id,
        productName: (product.name ?? "").trim() || `#${product.id}`,
        warehouseId,
        tenantId: product.tenant_id ?? tenantFilter ?? 1,
        focusedLocationUuid: focusedUuid,
        relatedLocationUuids: related.length > 0 ? related : [focusedUuid],
      });
    },
    [tenantFilter],
  );

  useEffect(() => {
    api.get<Tenant[]>("/tenants/").then((res) => setTenants(Array.isArray(res.data) ? res.data : [])).catch(() => setTenants([]));
  }, []);

  const fetchServerPage = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tenantFilter != null) params.set("tenant_id", String(tenantFilter));
    if (manufacturerFilterId != null) params.set("manufacturer_id", String(manufacturerFilterId));
    if (appliedFilters.name.trim()) params.set("name", appliedFilters.name.trim());
    const { ean, symbol } = serverParamsFromEanSku(appliedFilters.eanSku);
    if (ean) params.set("ean", ean);
    if (symbol) params.set("symbol", symbol);
    params.set("limit", String(rowsPerPage));
    params.set("offset", String((page - 1) * rowsPerPage));
    if (sortBy) params.set("sort_by", sortBy);
    params.set("sort_dir", sortDir);

    api
      .get(`/products/?${params.toString()}`)
      .then((res) => {
        const data = res.data;
        const raw = data?.items ?? (Array.isArray(data) ? data : []);
        const list = (raw as Record<string, unknown>[]).map(mapProductListRow);
        const total = typeof data?.total === "number" ? data.total : list.length;
        setCatalog(list);
        setServerTotal(total);
      })
      .catch(() => log("Błąd pobierania produktów"))
      .finally(() => setLoading(false));
  }, [
    tenantFilter,
    manufacturerFilterId,
    appliedFilters.name,
    appliedFilters.eanSku,
    rowsPerPage,
    page,
    sortBy,
    sortDir,
  ]);

  const fetchClientBatch = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tenantFilter != null) params.set("tenant_id", String(tenantFilter));
    if (manufacturerFilterId != null) params.set("manufacturer_id", String(manufacturerFilterId));
    if (appliedFilters.name.trim()) params.set("name", appliedFilters.name.trim());
    const { ean, symbol } = serverParamsFromEanSku(appliedFilters.eanSku);
    if (ean) params.set("ean", ean);
    if (symbol) params.set("symbol", symbol);
    params.set("limit", String(CLIENT_BATCH_LIMIT));
    params.set("offset", "0");
    if (sortBy) params.set("sort_by", sortBy);
    params.set("sort_dir", sortDir);

    api
      .get(`/products/?${params.toString()}`)
      .then((res) => {
        const data = res.data;
        const raw = data?.items ?? (Array.isArray(data) ? data : []);
        const list = (raw as Record<string, unknown>[]).map(mapProductListRow);
        setCatalog(list);
        setServerTotal(typeof data?.total === "number" ? data.total : list.length);
      })
      .catch(() => log("Błąd pobierania produktów"))
      .finally(() => setLoading(false));
  }, [tenantFilter, manufacturerFilterId, appliedFilters, sortBy, sortDir]);

  useEffect(() => {
    if (!clientMode) return;
    fetchClientBatch();
  }, [clientMode, fetchClientBatch]);

  useEffect(() => {
    if (clientMode) return;
    fetchServerPage();
  }, [clientMode, fetchServerPage]);

  const filteredCatalog = useMemo(() => {
    if (!clientMode) return catalog;
    return applyClientFilters(catalog, appliedFilters);
  }, [catalog, appliedFilters, clientMode]);

  const displayRows = useMemo(() => {
    if (!clientMode) return catalog;
    const start = (page - 1) * rowsPerPage;
    return filteredCatalog.slice(start, start + rowsPerPage);
  }, [clientMode, catalog, filteredCatalog, page, rowsPerPage]);

  const totalCount = clientMode ? filteredCatalog.length : serverTotal;

  const [tableHScrollTrackPx, setTableHScrollTrackPx] = useState(0);
  const [tableNeedsHScroll, setTableNeedsHScroll] = useState(false);

  const refreshTableHScrollTrack = useCallback(() => {
    const tbl = tableElementRef.current;
    const sc = tableHScrollRef.current;
    if (tbl) setTableHScrollTrackPx(tbl.scrollWidth);
    if (tbl && sc) {
      setTableNeedsHScroll(tbl.scrollWidth > sc.clientWidth + 1);
      const left = sc.scrollLeft;
      if (tableHScrollMirrorTopRef.current) tableHScrollMirrorTopRef.current.scrollLeft = left;
      if (tableHScrollMirrorBottomRef.current) tableHScrollMirrorBottomRef.current.scrollLeft = left;
    }
  }, []);

  useLayoutEffect(() => {
    refreshTableHScrollTrack();
  }, [refreshTableHScrollTrack, displayRows, loading, productColumnOrder]);

  useEffect(() => {
    const tbl = tableElementRef.current;
    const sc = tableHScrollRef.current;
    if (!tbl) return undefined;
    const ro = new ResizeObserver(() => refreshTableHScrollTrack());
    ro.observe(tbl);
    if (sc) ro.observe(sc);
    window.addEventListener("resize", refreshTableHScrollTrack);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", refreshTableHScrollTrack);
    };
  }, [refreshTableHScrollTrack, displayRows.length, productColumnOrder]);

  const onTableHScroll = useCallback(() => {
    const left = tableHScrollRef.current?.scrollLeft ?? 0;
    if (tableHScrollMirrorTopRef.current) tableHScrollMirrorTopRef.current.scrollLeft = left;
    if (tableHScrollMirrorBottomRef.current) tableHScrollMirrorBottomRef.current.scrollLeft = left;
  }, []);

  const onMirrorTopHScroll = useCallback(() => {
    const left = tableHScrollMirrorTopRef.current?.scrollLeft ?? 0;
    if (tableHScrollRef.current) tableHScrollRef.current.scrollLeft = left;
    if (tableHScrollMirrorBottomRef.current) tableHScrollMirrorBottomRef.current.scrollLeft = left;
  }, []);

  const onMirrorBottomHScroll = useCallback(() => {
    const left = tableHScrollMirrorBottomRef.current?.scrollLeft ?? 0;
    if (tableHScrollRef.current) tableHScrollRef.current.scrollLeft = left;
    if (tableHScrollMirrorTopRef.current) tableHScrollMirrorTopRef.current.scrollLeft = left;
  }, []);

  const effectiveProductSelectionCount =
    productBulkMode === "filtered_all" ? totalCount : selectedIds.size;

  const producerOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of catalog) {
      const m = ((p.manufacturer_brief?.name ?? p.manufacturer) ?? "").trim();
      if (m) s.add(m);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pl"));
  }, [catalog]);

  const applyFilters = () => {
    setPage(1);
    setAppliedFilters(filters);
  };

  const clearManufacturerUrlFilter = useCallback(() => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("manufacturer_id");
        return p;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const clearFilters = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setPage(1);
    clearManufacturerUrlFilter();
  };

  const toggleSort = (key: SortKey) => {
    if (key === "inventory_value" && tenantFilter == null) {
      window.alert("Wybierz tenant w filtrze, aby sortować po wartości magazynowej.");
      return;
    }
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else setSortBy(key);
  };

  const toggleSelect = (id: number) => {
    if (productBulkMode === "filtered_all") {
      setProductBulkMode("explicit");
      setSelectedIds(new Set([id]));
      return;
    }
    setProductBulkMode("explicit");
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllProductsOnPage = () => {
    setProductBulkMode("explicit");
    setSelectedIds(new Set(displayRows.map((p) => p.id)));
  };

  const deselectAllOnPage = () => {
    setProductBulkMode("explicit");
    setSelectedIds((prev) => {
      const next = new Set(prev);
      displayRows.forEach((p) => next.delete(p.id));
      return next;
    });
  };

  const selectAllProductsFiltered = () => {
    if (clientMode || tenantFilter == null) return;
    setProductBulkMode("filtered_all");
    setSelectedIds(new Set());
  };

  const clearProductSelection = () => {
    setSelectedIds(new Set());
    setProductBulkMode("none");
    setProductBulkSelectKey((k) => k + 1);
  };

  useEffect(() => {
    if (productBulkMode === "explicit" && selectedIds.size === 0) {
      setProductBulkMode("none");
    }
  }, [productBulkMode, selectedIds.size]);

  const bulkTenantId = useMemo(() => {
    if (tenantFilter != null) return tenantFilter;
    const first = displayRows.find((p) => selectedIds.has(p.id));
    return first?.tenant_id ?? null;
  }, [tenantFilter, displayRows, selectedIds]);

  const exportTenantId = useMemo(() => {
    if (tenantFilter != null) return tenantFilter;
    const firstSel = displayRows.find((p) => selectedIds.has(p.id));
    if (firstSel?.tenant_id != null) return firstSel.tenant_id;
    return displayRows[0]?.tenant_id ?? 1;
  }, [tenantFilter, displayRows, selectedIds]);

  const productBulkModalSelection = useMemo((): ProductBulkModalSelection | null => {
    if (effectiveProductSelectionCount === 0) return null;
    if (productBulkMode === "filtered_all") {
      if (tenantFilter == null) return null;
      return { mode: "filtered_query", filters: productBulkFiltersPayload, count: totalCount };
    }
    if (selectedIds.size === 0) return null;
    return { mode: "explicit_ids", productIds: Array.from(selectedIds) };
  }, [
    effectiveProductSelectionCount,
    productBulkMode,
    tenantFilter,
    productBulkFiltersPayload,
    totalCount,
    selectedIds,
  ]);

  const isProductRowSelected = useCallback(
    (id: number) => productBulkMode === "filtered_all" || selectedIds.has(id),
    [productBulkMode, selectedIds],
  );

  const openBulkHub = () => {
    if (effectiveProductSelectionCount === 0) return;
    if (bulkTenantId == null) {
      window.alert("Ustal filtr „Tenant”, aby wykonać masową zmianę.");
      return;
    }
    if (productBulkMode === "filtered_all" && tenantFilter == null) {
      window.alert("Wybierz tenant w filtrze, aby masowo przetwarzać cały zbiór.");
      return;
    }
    setBulkHubOpen(true);
  };

  const onBulkHubSelectAction = (action: ProductBulkHubChoice) => {
    setBulkHubOpen(false);
    if (action === "delete_products") {
      setBulkDeleteOpen(true);
      return;
    }
    if (isBulkPatchPreset(action)) {
      setBulkPatchPreset(action);
      return;
    }
    if (isBulkUpdateAction(action)) {
      setBulkActionChoice(action);
      setBulkModalOpen(true);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- bulk delete not in toolbar; keep for reuse
  const bulkDelete = async () => {
    if (effectiveProductSelectionCount === 0) return;
    const firstProduct = displayRows.find((p) => selectedIds.has(p.id));
    const tid = tenantFilter ?? firstProduct?.tenant_id ?? undefined;
    if (tid == null) {
      window.alert("Ustal filtr „Tenant”, aby usunąć produkty.");
      return;
    }
    const n = effectiveProductSelectionCount;
    const ok = window.confirm(
      `Usunąć lub zarchiwizować ${n} produktów?\n\nRekordy powiązane z historią (zamówienia, dokumenty magazynowe, dostawy) zostaną ukryte z listy (archiwizacja), a nie skasowane z bazy.`,
    );
    if (!ok) return;
    try {
      let summary: ProductsBulkDeleteResult | null = null;
      if (productBulkMode === "filtered_all") {
        summary = await postProductsBulkDelete({
          tenant_id: tid,
          selection: { mode: "filtered_query", filters: productBulkFiltersPayload },
        });
      } else {
        summary = await postProductsBulkDelete({
          tenant_id: tid,
          selection: { mode: "explicit_ids", ids: Array.from(selectedIds) },
        });
      }
      clearProductSelection();
      if (clientMode) fetchClientBatch();
      else fetchServerPage();
      if (summary) {
        const parts = [
          summary.errors?.length ? `Błędy: ${summary.errors.join("; ")}` : null,
          `Usunięto trwale: ${summary.success_count ?? 0}`,
          `Zarchiwizowano: ${summary.soft_deleted_count ?? 0}`,
          summary.skipped_not_found ? `Nie znaleziono w tenancie: ${summary.skipped_not_found}` : null,
          summary.skipped_already_archived ? `Już zarchiwizowane: ${summary.skipped_already_archived}` : null,
          summary.messages?.length ? summary.messages.join(" ") : null,
        ].filter(Boolean);
        window.alert(parts.length ? parts.join("\n") : "Operacja zakończona.");
      }
    } catch (e) {
      console.error(e);
      window.alert("Usuwanie produktów nie powiodło się (szczegóły w konsoli).");
    }
  };

  const duplicateOneProduct = async (p: Product) => {
    const tid = tenantFilter ?? p.tenant_id ?? null;
    if (tid == null) {
      toast.error("Ustal filtr „Tenant”, aby skopiować produkt.");
      return;
    }
    setRowDupBusyId(p.id);
    try {
      const created = await duplicateProduct(p.id, tid);
      console.log("duplicate response", created);
      const newId = Number(created?.id);
      if (!Number.isFinite(newId) || newId < 1) {
        toast.error("Kopia mogła powstać, ale API nie zwróciło poprawnego ID produktu.");
        if (clientMode) fetchClientBatch();
        else fetchServerPage();
        return;
      }
      log("Product duplicated", { sourceId: p.id, newId, tenantId: tid });
      toast.success(`Utworzono kopię: ${created.name ?? "produkt"}`);
      if (clientMode) fetchClientBatch();
      else fetchServerPage();
      navigate(`/products/${newId}/edit`, { state: { tenantId: tid } });
    } catch (e: unknown) {
      console.error("duplicateProduct failed", { productId: p.id, tenantId: tid, error: e });
      logError("duplicateProduct failed", e);
      toast.error(extractApiErrorMessage(e, "Kopiowanie produktu nie powiodło się."));
    } finally {
      setRowDupBusyId(null);
    }
  };

  const deleteOneProduct = async (p: Product) => {
    const tid = tenantFilter ?? p.tenant_id ?? null;
    if (tid == null) {
      window.alert("Ustal filtr „Tenant”, aby usunąć produkt.");
      return;
    }
    if (
      !window.confirm(
        `Usunąć lub zarchiwizować produkt „${(p.name ?? "").trim() || `#${p.id}`}”?\n\nRekord powiązany z historią zostanie ukryty (archiwizacja), a nie skasowany z bazy.`,
      )
    )
      return;
    setRowDeleteBusyId(p.id);
    try {
      await postProductsBulkDelete({
        tenant_id: tid,
        selection: { mode: "explicit_ids", ids: [p.id] },
      });
      clearProductSelection();
      if (clientMode) void fetchClientBatch();
      else void fetchServerPage();
    } catch (e) {
      console.error(e);
      window.alert("Usunięcie nie powiodło się.");
    } finally {
      setRowDeleteBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const startRow = totalCount === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, totalCount);

  const Th = ({ label, sortKey, align }: { label: string; sortKey: SortKey; align?: "left" | "right" }) => (
    <th
      className={`${listSellasistTableHeaderCellGrid} cursor-pointer select-none hover:bg-slate-100/80 ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={() => toggleSort(sortKey)}
    >
      {label}
      {sortBy === sortKey && (sortDir === "asc" ? " ↑" : " ↓")}
    </th>
  );

  const pageNumbers = useMemo(() => {
    if (totalPages <= 1) return [1];
    const max = 5;
    const out: number[] = [];
    if (totalPages <= max) {
      for (let i = 1; i <= totalPages; i++) out.push(i);
      return out;
    }
    if (page <= 3) return [1, 2, 3, 4, 5];
    if (page >= totalPages - 2) {
      for (let i = totalPages - 4; i <= totalPages; i++) out.push(i);
      return out;
    }
    for (let i = page - 2; i <= page + 2; i++) out.push(i);
    return out;
  }, [page, totalPages]);

  const selectionOnPage = useMemo(() => {
    const ids = displayRows.map((p) => p.id);
    if (ids.length === 0) return { all: false, some: false };
    if (productBulkMode === "filtered_all") return { all: true, some: false };
    const n = ids.filter((id) => selectedIds.has(id)).length;
    return { all: n === ids.length && n > 0, some: n > 0 && n < ids.length };
  }, [displayRows, selectedIds, productBulkMode]);

  useEffect(() => {
    const el = masterCheckboxRef.current;
    if (!el) return;
    el.indeterminate =
      productBulkMode !== "filtered_all" && selectionOnPage.some && !selectionOnPage.all;
  }, [productBulkMode, selectionOnPage]);

  /** Lewa kolumna: checkbox — sticky przy poziomym scrollu. */
  const checkboxHeaderClass = `${listSellasistTableHeaderCellGrid} sticky left-0 top-0 z-[30] w-12 min-w-[3rem] bg-slate-50 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.12)]`;
  const checkboxCellClass = `${listSellasistTableBodyCellGrid} sticky left-0 z-[25] bg-white !align-middle shadow-[4px_0_10px_-4px_rgba(15,23,42,0.08)] group-hover:bg-slate-50`;
  /** Akcje po checkboxie — sticky `left-12` = szerokość kolumny zaznaczenia. */
  /** Match `panelListDenseOrderActions*` padding — same density as Orders list. */
  const actionsHeaderClass = `${listSellasistTableHeaderCellGrid} sticky left-12 top-0 z-[29] ${operationalActionsColumnWidthClass} bg-slate-50 text-center align-top !px-1 !py-1.5 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.1)]`;
  const actionsCellClass = `${listSellasistTableBodyCellGrid} sticky left-12 z-[24] ${operationalActionsColumnWidthClass} bg-white !px-1 !py-1 !align-top shadow-[4px_0_10px_-4px_rgba(15,23,42,0.08)] group-hover:bg-slate-50`;

  const renderProductColumnTh = (col: string) => {
    switch (col) {
      case "photo":
        return (
          <th key={col} className={`${listSellasistTableHeaderCellGrid} w-28 min-w-28 text-center`}>
            {t.photo ?? "Zdjęcie"}
          </th>
        );
      case "name":
        return <Th key={col} label="Nazwa" sortKey="name" />;
      case "ean_sku":
        return <th key={col} className={listSellasistTableHeaderCellGrid}>EAN / SKU</th>;
      case "supplier":
        return <th key={col} className={listSellasistTableHeaderCellGrid}>Dostawca</th>;
      case "manufacturer":
        return <th key={col} className={listSellasistTableHeaderCellGrid}>Producent</th>;
      case "price":
        return (
          <th key={col} className={`${listSellasistTableHeaderCellGrid} text-right`}>
            Cena
          </th>
        );
      case "purchase_price":
        return (
          <th key={col} className={`${listSellasistTableHeaderCellGrid} text-right`}>
            Cena zakupu
          </th>
        );
      case "dimensions":
        return <th key={col} className={listSellasistTableHeaderCellGrid}>Wymiary</th>;
      case "stock":
        return (
          <th key={col} className={`${listSellasistTableHeaderCellGrid} text-right`}>
            Stan
          </th>
        );
      case "inventory_value":
        return <Th key={col} label="Wartość mag." sortKey="inventory_value" align="right" />;
      case "locations":
        return (
          <th
            key={col}
            className={`${listSellasistTableHeaderCellGrid} min-w-[13rem] max-w-[20rem] lg:min-w-[14rem] lg:max-w-[22rem]`}
          >
            Lokalizacje
          </th>
        );
      default:
        return null;
    }
  };

  const renderProductColumnTd = (col: string, p: Product) => {
    const imgUrl = firstImageUrl(p.image_url);
    const mismatch = hasPlanVersusPhysicalMismatch(p);
    const physLocs = physicalInventoryLocations(p);
    switch (col) {
      case "photo":
        return (
          <td key={`${p.id}-${col}`} className={`${listSellasistTableBodyCellGrid} text-center`}>
            <div className="mx-auto flex h-20 w-20 max-h-20 max-w-20 items-center justify-center bg-transparent">
              {imgUrl ? (
                <img
                  src={imgUrl}
                  alt=""
                  className="max-h-20 max-w-20 object-contain object-center"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                  }}
                />
              ) : (
                <span className="text-center text-xs leading-tight text-slate-400">—</span>
              )}
            </div>
          </td>
        );
      case "name":
        return (
          <td key={`${p.id}-${col}`} className={`${listSellasistTableBodyCellGrid} min-w-[10rem] max-w-[22rem]`}>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium leading-snug text-slate-900">
                {p.name?.trim() ? p.name.trim() : null}
              </span>
              {mismatch && (
                <span
                  className="inline-flex w-fit max-w-full items-center rounded border border-amber-200/80 bg-amber-50/50 px-1.5 py-0.5 text-xs font-medium leading-snug text-amber-900/90"
                  title="Suma ilości w planie różni się od stanu fizycznego (inventory)."
                >
                  Niezgodność plan / stan
                </span>
              )}
              <ProductListLogisticsBadges product={p} />
            </div>
          </td>
        );
      case "ean_sku":
        return (
          <td key={`${p.id}-${col}`} className={listSellasistTableBodyCellGrid}>
            <div className="flex min-w-0 flex-col gap-0.5">
              {p.ean?.trim() ? <span className="text-sm tabular-nums text-slate-800">{p.ean.trim()}</span> : null}
              {p.symbol?.trim() ? (
                <span className="truncate text-xs text-slate-600" title={p.symbol.trim()}>
                  {p.symbol.trim()}
                </span>
              ) : null}
            </div>
          </td>
        );
      case "supplier": {
        const s = (p.default_supplier_brief?.name ?? "").trim();
        return (
          <td key={`${p.id}-${col}`} className={listSellasistTableBodyCellGrid}>
            <span className="text-sm text-slate-800">{s || null}</span>
          </td>
        );
      }
      case "manufacturer": {
        const m = (p.manufacturer_brief?.name ?? p.manufacturer ?? "").trim();
        return (
          <td key={`${p.id}-${col}`} className={listSellasistTableBodyCellGrid}>
            <span className="text-sm text-slate-800">{m || null}</span>
          </td>
        );
      }
      case "price":
        return (
          <td key={`${p.id}-${col}`} className={`${listSellasistTableBodyCellGrid} text-right text-sm tabular-nums text-slate-800`}>
            {formatPriceZl(p)}
          </td>
        );
      case "purchase_price":
        return (
          <td
            key={`${p.id}-${col}`}
            className={`${listSellasistTableBodyCellGrid} text-right text-sm tabular-nums text-slate-800`}
          >
            {formatPurchasePriceZl(p)}
          </td>
        );
      case "dimensions":
        return (
          <td key={`${p.id}-${col}`} className={`${listSellasistTableBodyCellGrid} text-sm tabular-nums text-slate-800`}>
            {formatDimensionsCm(p)}
          </td>
        );
      case "stock":
        return (
          <td key={`${p.id}-${col}`} className={`${listSellasistTableBodyCellGrid} text-right`}>
            <span
              className={`text-sm tabular-nums ${
                typeof p.stock_quantity === "number" && p.stock_quantity === 0
                  ? "font-semibold text-red-600"
                  : "text-slate-800"
              }`}
            >
              {typeof p.stock_quantity === "number" ? `${p.stock_quantity} szt.` : "0 szt."}
            </span>
          </td>
        );
      case "inventory_value":
        return (
          <td key={`${p.id}-${col}`} className={`${listSellasistTableBodyCellGrid} text-right text-sm tabular-nums text-slate-800`}>
            {formatInventoryValueZl(p)}
          </td>
        );
      case "locations":
        return (
          <td
            key={`${p.id}-${col}`}
            className={`${listSellasistTableBodyCellGrid} min-w-[13rem] max-w-[20rem] whitespace-normal align-top lg:min-w-[14rem] lg:max-w-[22rem]`}
          >
            <LocationBadgeStack product={p} locations={physLocs} onOpenLocationOnMap={openProductLocationOnMap} />
          </td>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <PageHeader
        title={`Produkty${loading ? "" : ` (${totalCount} wyników)`}`}
        breadcrumbs={[
          { label: "Asortyment", to: "/products/list" },
          { label: "Produkty" },
        ]}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={toggleFiltersPanel}
              className={listSellasistToolbarToggleBtn}
              aria-expanded={filtersExpanded}
            >
              {filtersExpanded ? "Ukryj filtry" : "Pokaż filtry"}
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            <button
              type="button"
              onClick={() => openFilterFieldsRef.current?.()}
              className={listSellasistToolbarSquareBtn}
              title="Widoczne pola filtrów"
              aria-label="Widoczne pola filtrów"
            >
              <Columns3 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setColumnPickerOpen(true)}
              className={listSellasistToolbarSquareBtn}
              title="Wybór kolumn tabeli"
              aria-label="Wybór kolumn tabeli"
            >
              <Table2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              className={listSellasistToolbarSquareBtn}
              title="Uzupełnianie danych WMS"
              aria-label="Uzupełnianie danych WMS"
              onClick={() => {
                if (selectedIds.size === 1) {
                  const pid = Array.from(selectedIds)[0];
                  const row = displayRows.find((p) => p.id === pid);
                  navigate(`/products/${pid}/edit?tab=wms-validation`, {
                    state: { tenantId: row?.tenant_id ?? exportTenantId },
                  });
                  return;
                }
                if (selectedIds.size > 1) {
                  window.alert("Zaznacz dokładnie jeden produkt, aby otworzyć ustawienia WMS.");
                  return;
                }
                window.alert("Zaznacz produkt na liście, aby skonfigurować wymagane dane WMS przy przyjęciu.");
              }}
            >
              <Settings2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            </button>
          </div>
        }
      />
      {manufacturerFilterId != null ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2 text-sm text-slate-800">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className="inline-flex shrink-0 items-center rounded-full bg-violet-600/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-violet-900 ring-1 ring-violet-300/60"
              title="Lista produktów jest ograniczona do wybranego producenta"
            >
              Filtr aktywny
            </span>
            <span className="min-w-0">
              Producent:{" "}
              {manufacturerFilterMetaLoading ? (
                <span className="text-slate-500">wczytywanie…</span>
              ) : (
                <Link
                  to={`/manufacturers?edit=${manufacturerFilterId}${tenantFilter != null ? `&tenant_id=${tenantFilter}` : ""}`}
                  className="font-medium text-violet-800 underline decoration-violet-300 underline-offset-2 hover:text-violet-950"
                >
                  {manufacturerFilterName?.trim() || `ID ${manufacturerFilterId}`}
                </Link>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={clearManufacturerUrlFilter}
            className="shrink-0 rounded border border-violet-300 bg-white px-2 py-1 text-xs font-medium text-violet-900 hover:bg-violet-100"
          >
            Usuń filtr producenta
          </button>
        </div>
      ) : null}

      <ProductListFiltersSection
        expanded={filtersExpanded}
        filters={filters}
        setFilters={setFilters}
        tenantFilter={tenantFilter}
        onTenantFilterChange={(next) => {
          setTenantFilter(next);
          setPage(1);
        }}
        tenants={tenants}
        producerOptions={producerOptions}
        onApply={applyFilters}
        onClear={clearFilters}
        clientMode={clientMode}
        clientBatchLimit={CLIENT_BATCH_LIMIT}
        openVisibilityRef={openFilterFieldsRef}
      />

      {productBulkMode === "filtered_all" && tenantFilter != null && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-950">
          Zaznaczono {effectiveProductSelectionCount} rekordów pasujących do filtrów (serwer).{" "}
          <button
            type="button"
            className="font-semibold text-sky-900 underline decoration-sky-400 underline-offset-2 hover:text-sky-950"
            onClick={clearProductSelection}
          >
            Wyczyść zaznaczenie
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">
          Ładowanie…
        </div>
      ) : (
        <div className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <select
                key={productBulkSelectKey}
                defaultValue=""
                className={`${listSellasistInputClass} !h-10 max-w-[11rem] text-sm`}
                aria-label="Zaznaczanie produktów"
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "page") selectAllProductsOnPage();
                  else if (v === "filtered") selectAllProductsFiltered();
                  else if (v === "clear") clearProductSelection();
                  e.target.value = "";
                }}
              >
                <option value="">Zaznacz…</option>
                <option value="page">Strona</option>
                <option
                  value="filtered"
                  disabled={clientMode || tenantFilter == null || totalCount < 1}
                  title={clientMode ? "Wyłączone przy filtrach lokalnych" : ""}
                >
                  Filtry ({totalCount})
                </option>
                <option value="clear">Odznacz</option>
              </select>
              <button
                type="button"
                onClick={openBulkHub}
                disabled={bulkTenantId == null || effectiveProductSelectionCount === 0}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Multiakcje
              </button>
              <button
                type="button"
                onClick={() => setExportOpen(true)}
                className={listSellasistToolbarSquareBtn}
                title="Eksport"
                aria-label="Eksport"
              >
                <Download className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className={listSellasistToolbarSquareBtn}
                title="Drukuj listę"
                aria-label="Drukuj listę"
              >
                <Printer className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <span className="whitespace-nowrap">Wyników na stronę:</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setPage(1);
                  }}
                  className={`${listSellasistInputClass} !h-10 w-auto min-w-[4.5rem] py-0 pr-8 text-sm`}
                >
                  {ROWS_PER_PAGE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {effectiveProductSelectionCount > 0 ? (
            <div className="border-b border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs leading-snug text-amber-950 sm:text-sm">
              Zaznaczono: <span className="font-semibold tabular-nums">{effectiveProductSelectionCount}</span>. Rekordy
              powiązane z historią mogą zostać zarchiwizowane zamiast usunięte.
            </div>
          ) : null}
          {tableNeedsHScroll && tableHScrollTrackPx > 0 ? (
            <div
              ref={tableHScrollMirrorTopRef}
              onScroll={onMirrorTopHScroll}
              className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] border-b border-slate-200 bg-slate-50/90"
              aria-hidden
            >
              <div style={{ width: tableHScrollTrackPx, height: 1 }} />
            </div>
          ) : null}
          <div
            ref={tableHScrollRef}
            onScroll={onTableHScroll}
            className="min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]"
          >
            <table
              ref={tableElementRef}
              className="w-max min-w-full border-collapse border-t border-slate-200 text-left text-sm"
            >
            <thead className="sticky top-0 z-[20] bg-slate-50 shadow-[0_1px_0_0_rgb(226_232_240)]">
              <tr>
                <th className={`${checkboxHeaderClass} text-center`}>
                  <span className="sr-only">Zaznacz wszystkie na stronie</span>
                  <input
                    ref={masterCheckboxRef}
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-slate-800"
                    checked={productBulkMode === "filtered_all" || selectionOnPage.all}
                    onChange={() => {
                      if (productBulkMode === "filtered_all") {
                        clearProductSelection();
                        return;
                      }
                      if (selectionOnPage.all) deselectAllOnPage();
                      else selectAllProductsOnPage();
                    }}
                    aria-label="Zaznacz wszystkie na stronie"
                  />
                </th>
                <th className={actionsHeaderClass}>Akcje</th>
                {productColumnOrder.map((col) => renderProductColumnTh(col))}
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={2 + productColumnOrder.length}
                    className="border-b border-slate-200 px-6 py-12 text-center text-sm text-slate-500"
                  >
                    <p>Brak produktów do wyświetlenia.</p>
                    <Link
                      to="/products/new"
                      className="mt-4 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                    >
                      Dodaj produkt
                    </Link>
                  </td>
                </tr>
              ) : (
                displayRows.map((p) => (
                    <tr
                      key={p.id}
                      className="group cursor-pointer transition-colors hover:bg-slate-50/90 [&>td]:align-middle"
                      onClick={() => openProductEdit(p)}
                    >
                      <td
                        className={`${checkboxCellClass} text-center`}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isProductRowSelected(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          className="h-4 w-4 rounded border-slate-300 text-slate-800"
                        />
                      </td>
                      <td
                        className={actionsCellClass}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <OperationalActionColumn
                          aria-label="Akcje produktu"
                          slots={[
                            <OperationalActionButton
                              key="dup"
                              disabled={rowDupBusyId === p.id}
                              title="Duplikuj produkt"
                              aria-label="Duplikuj produkt"
                              onClick={() => void duplicateOneProduct(p)}
                            >
                              <Copy strokeWidth={2} aria-hidden />
                            </OperationalActionButton>,
                            <OperationalActionButton
                              key="edit"
                              title="Edytuj produkt"
                              aria-label="Edytuj produkt"
                              onClick={() =>
                                navigate(`/products/${p.id}/edit`, {
                                  state: { tenantId: p.tenant_id ?? undefined },
                                })
                              }
                            >
                              <Pencil strokeWidth={2} aria-hidden />
                            </OperationalActionButton>,
                            <OperationalActionButton
                              key="del"
                              variant="danger"
                              disabled={rowDeleteBusyId === p.id}
                              onClick={() => void deleteOneProduct(p)}
                              title="Usuń / zarchiwizuj"
                              aria-label="Usuń produkt"
                            >
                              <Trash2 strokeWidth={2} aria-hidden />
                            </OperationalActionButton>,
                          ]}
                        />
                      </td>
                      {productColumnOrder.map((col) => renderProductColumnTd(col, p))}
                    </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
          {tableNeedsHScroll && tableHScrollTrackPx > 0 ? (
            <div
              ref={tableHScrollMirrorBottomRef}
              onScroll={onMirrorBottomHScroll}
              className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] border-t border-slate-200 bg-slate-50/90"
              aria-hidden
            >
              <div style={{ width: tableHScrollTrackPx, height: 1 }} />
            </div>
          ) : null}
          <div className="flex flex-col gap-2.5 border-t border-slate-200 bg-slate-50/95 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <span className="text-sm font-medium tabular-nums text-slate-600">
              {startRow}–{endRow} z {totalCount}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((pg) => Math.max(1, pg - 1))}
                className="rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40"
              >
                Poprzednia
              </button>
              {pageNumbers.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={`min-w-[2rem] rounded-md px-1.5 py-1 text-sm font-semibold tabular-nums ${
                    n === page ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-200/60"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((pg) => Math.min(totalPages, pg + 1))}
                className="rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40"
              >
                Następna
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
                className="ml-0.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40"
              >
                Ostatnia
              </button>
            </div>
          </div>
        </div>
      )}

      <ProductBulkHubModal
        open={bulkHubOpen}
        affectedCount={effectiveProductSelectionCount}
        onClose={() => setBulkHubOpen(false)}
        onSelectAction={onBulkHubSelectAction}
      />

      {bulkModalOpen && bulkTenantId != null && bulkActionChoice && productBulkModalSelection ? (
        <ProductBulkActionModal
          open={bulkModalOpen}
          tenantId={bulkTenantId}
          selection={productBulkModalSelection}
          action={bulkActionChoice}
          onClose={() => {
            setBulkModalOpen(false);
            setBulkActionChoice("");
          }}
          onSuccess={() => {
            clearProductSelection();
            if (clientMode) void fetchClientBatch();
            else void fetchServerPage();
          }}
        />
      ) : null}

      {bulkPatchPreset && bulkTenantId != null && productBulkModalSelection ? (
        <ProductBulkPatchModal
          open
          preset={bulkPatchPreset}
          tenantId={bulkTenantId}
          selection={productBulkModalSelection}
          onClose={() => setBulkPatchPreset("")}
          onSuccess={() => {
            clearProductSelection();
            if (clientMode) void fetchClientBatch();
            else void fetchServerPage();
          }}
        />
      ) : null}

      {bulkDeleteOpen && bulkTenantId != null && productBulkModalSelection ? (
        <ProductBulkDeleteModal
          open
          tenantId={bulkTenantId}
          selection={productBulkModalSelection}
          onClose={() => setBulkDeleteOpen(false)}
          onSuccess={() => {
            clearProductSelection();
            if (clientMode) void fetchClientBatch();
            else void fetchServerPage();
          }}
        />
      ) : null}

      {locationMapModal != null && (
        <Suspense fallback={null}>
          <ProductLocationMapModal
            open
            onClose={() => setLocationMapModal(null)}
            tenantId={locationMapModal.tenantId}
            warehouseId={locationMapModal.warehouseId}
            productId={locationMapModal.productId}
            productName={locationMapModal.productName}
            focusedLocationUuid={locationMapModal.focusedLocationUuid}
            relatedLocationUuids={locationMapModal.relatedLocationUuids}
          />
        </Suspense>
      )}

      <ColumnSelectorModal
        open={columnPickerOpen}
        onClose={() => setColumnPickerOpen(false)}
        title="Wybór kolumn"
        catalog={PRODUCT_LIST_TABLE_COLUMN_CATALOG}
        selectedOrder={productColumnOrder}
        onChange={persistProductColumns}
      />

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tenantId={exportTenantId}
        entityType="products"
        selectedIds={selectedIds.size > 0 ? Array.from(selectedIds) : []}
        fallbackIds={displayRows.map((p) => p.id)}
      />
    </>
  );
}
