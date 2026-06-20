import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, Columns3, Download, Settings2, TableProperties } from "lucide-react";
import toast from "react-hot-toast";
import { error as logError, log } from "../../utils/logger";
import { extractApiErrorMessage } from "../../api/authApi";
import api from "../../api/axios";
import { duplicateProduct } from "../../api/productsApi";
import { getManufacturer } from "../../api/manufacturersApi";
import { mapProductListRow, type ProductListRow } from "./productListMapper";
import { useWarehouse } from "../../context/WarehouseContext";
import { resolveProductPricingFromRow, resolvedSaleNetForFilter } from "../../utils/resolvedProductPricing";
import { FilterVisibilityModal } from "../../components/filters";
import { ListPageHeader } from "../../components/listPage/ListPageHeader";
import {
  moduleTableCardClass,
  moduleTablePaginationFooterClass,
} from "../../components/listPage/moduleList";
import { ProductsListBulkBar } from "../../components/products/productList/ProductsListBulkBar";
import {
  ProductsListTable,
  type ProductListSortKey,
} from "../../components/products/productList/ProductsListTable";
import {
  buildProductListColumnCatalog,
  PRODUCT_LIST_DEFAULT_COLUMN_ORDER,
  productListNeedsNetworkStock,
  productListNeedsWarehouseStocks,
} from "../../components/products/productList/productListColumnCatalog";
import {
  countActiveProductListFilters,
  productListFilterToggleLabel,
} from "../../components/products/productList/productListFilterTypes";
import { physicalInventoryLocations, type OpenLocationOnMapPayload } from "../../components/products/productList/productListLocationCells";
import { useProductsListColumnOrder } from "../../components/products/productList/useProductsListColumnOrder";
import { ProductBulkActionModal } from "./ProductBulkActionModal";
import { ProductBulkDeleteModal } from "./ProductBulkDeleteModal";
import { ProductBulkPatchModal } from "./ProductBulkPatchModal";
import { isBulkPatchPreset, isBulkUpdateAction, type ProductBulkHubChoice } from "./productBulkHubTypes";
import type { BulkUpdateAction } from "../../api/productsBulkApi";
import { postProductsBulkDelete, type ProductsBulkDeleteResult } from "../../api/productsBulkApi";
import { buildProductBulkListFiltersPayload } from "../../utils/productListBulkFilters";
import type { ProductBulkModalSelection } from "./ProductBulkActionModal";
import ExportModal from "../../components/exports/ExportModal";
import {
  listSellasistInputClass,
  listSellasistToolbarSquareBtn,
  listSellasistToolbarToggleBtn,
} from "../../components/listPage/listSellasistTokens";
import type { ProductListUiFilters as UiFilters } from "./productListUiFilters";
import { DEFAULT_PRODUCT_LIST_UI_FILTERS as defaultFilters } from "./productListUiFilters";
import { ProductListFiltersSection } from "./ProductListFiltersSection";
import { warehouseService, type TenantWarehouseAssignment } from "../../services/warehouseService";

const ProductLocationMapModal = lazy(() => import("./ProductLocationMapModal"));

type Tenant = { id: number; name: string };

type Product = ProductListRow;

const CLIENT_BATCH_LIMIT = 8000;

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
    const price = resolvedSaleNetForFilter(resolveProductPricingFromRow(p));
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

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200, 500] as const;

export default function ProductList() {
  const navigate = useNavigate();
  const { selectedWarehouseId } = useWarehouse();
  /** Nawigacja do karty produktu — używana przez cały wiersz tabeli (bez checkboxa i akcji). */
  const openProductEdit = useCallback(
    (p: Product) => {
      navigate(`/products/${p.id}/edit`, {
        state: {
          tenantId: p.tenant_id ?? undefined,
          listStockQuantity: p.stock_quantity ?? undefined,
          warehouseId: selectedWarehouseId ?? undefined,
        },
      });
    },
    [navigate, selectedWarehouseId],
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
  const [sortBy, setSortBy] = useState<ProductListSortKey>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [productBulkMode, setProductBulkMode] = useState<"none" | "filtered_all" | "explicit">("none");
  const [productBulkSelectKey, setProductBulkSelectKey] = useState(0);
  const [bulkActionChoice, setBulkActionChoice] = useState<BulkUpdateAction | "">("");
  const [bulkPatchPreset, setBulkPatchPreset] = useState<ProductBulkPatchPreset | "">("");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
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
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [tenantAssignments, setTenantAssignments] = useState<TenantWarehouseAssignment[]>([]);
  const [warehouseNameById, setWarehouseNameById] = useState<Map<number, string>>(() => new Map());

  const productColumnCatalog = useMemo(
    () => buildProductListColumnCatalog(tenantAssignments, warehouseNameById),
    [tenantAssignments, warehouseNameById],
  );

  const { columnOrder: productColumnOrder, persistColumnOrder: persistProductColumns } =
    useProductsListColumnOrder(productColumnCatalog);

  const activeFilterCount = useMemo(() => countActiveProductListFilters(appliedFilters), [appliedFilters]);

  const needsNetworkStockColumns = useMemo(
    () => productListNeedsNetworkStock(productColumnOrder),
    [productColumnOrder],
  );
  const needsPerWarehouseStockColumns = useMemo(
    () => productListNeedsWarehouseStocks(productColumnOrder),
    [productColumnOrder],
  );

  useEffect(() => {
    if (tenantFilter == null) {
      setTenantAssignments([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      warehouseService.getAssignments({ tenant_id: tenantFilter }),
      warehouseService.getAllWarehouses(),
    ])
      .then(([aRes, wRes]) => {
        if (cancelled) return;
        setTenantAssignments(Array.isArray(aRes.data) ? aRes.data : []);
        const m = new Map<number, string>();
        for (const w of Array.isArray(wRes.data) ? wRes.data : []) {
          m.set(w.id, w.name);
        }
        setWarehouseNameById(m);
      })
      .catch(() => {
        if (!cancelled) {
          setTenantAssignments([]);
          setWarehouseNameById(new Map());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tenantFilter]);

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
    [tenantFilter, selectedWarehouseId],
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
    if (selectedWarehouseId != null) params.set("warehouse_id", String(selectedWarehouseId));
    if (needsNetworkStockColumns) params.set("include_network_stock", "true");
    if (needsPerWarehouseStockColumns) params.set("include_warehouse_stocks", "true");

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
    selectedWarehouseId,
    needsNetworkStockColumns,
    needsPerWarehouseStockColumns,
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
    if (selectedWarehouseId != null) params.set("warehouse_id", String(selectedWarehouseId));
    if (needsNetworkStockColumns) params.set("include_network_stock", "true");
    if (needsPerWarehouseStockColumns) params.set("include_warehouse_stocks", "true");

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
  }, [tenantFilter, manufacturerFilterId, appliedFilters, sortBy, sortDir, selectedWarehouseId, needsNetworkStockColumns, needsPerWarehouseStockColumns]);

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

  const toggleSort = (key: ProductListSortKey) => {
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

  const handleBulkActionSelect = (action: ProductBulkHubChoice) => {
    if (effectiveProductSelectionCount === 0) return;
    if (bulkTenantId == null) {
      window.alert("Ustal filtr „Tenant”, aby wykonać masową zmianę.");
      return;
    }
    if (productBulkMode === "filtered_all" && tenantFilter == null) {
      window.alert("Wybierz tenant w filtrze, aby masowo przetwarzać cały zbiór.");
      return;
    }
    onBulkHubSelectAction(action);
  };

  const onBulkHubSelectAction = (action: ProductBulkHubChoice) => {
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

  const toggleAllPage = () => {
    if (productBulkMode === "filtered_all") {
      clearProductSelection();
      return;
    }
    if (selectionOnPage.all) deselectAllOnPage();
    else selectAllProductsOnPage();
  };

  const headerChecked = productBulkMode === "filtered_all" || selectionOnPage.all;
  const headerIndeterminate =
    productBulkMode !== "filtered_all" && selectionOnPage.some && !selectionOnPage.all;
  const bulkToolbarDisabled = bulkTenantId == null || effectiveProductSelectionCount === 0;

  return (
    <>
      <ListPageHeader
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
              {filtersExpanded ? "Ukryj filtry" : productListFilterToggleLabel(activeFilterCount)}
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
              title="Widoczne kolumny tabeli"
              aria-label="Widoczne kolumny tabeli"
            >
              <TableProperties className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
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
                  to={`/manufacturers/${manufacturerFilterId}${tenantFilter != null ? `?tenant_id=${tenantFilter}` : ""}`}
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

      {productBulkMode === "filtered_all" && tenantFilter != null ? (
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
      ) : null}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500" aria-busy="true">
          Ładowanie…
        </div>
      ) : (
        <div className={`${moduleTableCardClass} min-w-0`}>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <ProductsListBulkBar
              bulkSelectMenuKey={productBulkSelectKey}
              bulkToolbarDisabled={bulkToolbarDisabled}
              filteredSelectDisabled={clientMode || tenantFilter == null}
              totalCount={totalCount}
              effectiveSelectionCount={effectiveProductSelectionCount}
              bulkSelectionMode={productBulkMode}
              headerChecked={headerChecked}
              headerIndeterminate={headerIndeterminate}
              onSelectPage={selectAllProductsOnPage}
              onSelectFiltered={selectAllProductsFiltered}
              onClearSelection={clearProductSelection}
              onSelectMenuBump={() => setProductBulkSelectKey((k) => k + 1)}
              onBulkActionSelect={handleBulkActionSelect}
              onPrint={() => window.print()}
              onExport={() => setExportOpen(true)}
              trailing={
                <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <span className="whitespace-nowrap">Na stronę</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => {
                      setRowsPerPage(Number(e.target.value));
                      setPage(1);
                    }}
                    className={`${listSellasistInputClass} !h-8 w-auto min-w-[4rem] py-0 pr-7 text-sm`}
                  >
                    {ROWS_PER_PAGE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              }
            />
            {effectiveProductSelectionCount > 0 ? (
              <div className="border-b border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs leading-snug text-amber-950 sm:text-sm">
                Zaznaczono: <span className="font-semibold tabular-nums">{effectiveProductSelectionCount}</span>. Rekordy
                powiązane z historią mogą zostać zarchiwizowane zamiast usunięte.
              </div>
            ) : null}
            <ProductsListTable
              rows={displayRows}
              columnOrder={productColumnOrder}
              columnCatalog={productColumnCatalog}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={toggleSort}
              isRowSelected={isProductRowSelected}
              headerChecked={headerChecked}
              headerSelectAllRef={masterCheckboxRef}
              onToggleOne={toggleSelect}
              onToggleAllPage={toggleAllPage}
              onRowOpen={openProductEdit}
              onDuplicate={(p) => void duplicateOneProduct(p)}
              onDelete={(p) => void deleteOneProduct(p)}
              onOpenLocationOnMap={openProductLocationOnMap}
              rowDupBusyId={rowDupBusyId}
              rowDeleteBusyId={rowDeleteBusyId}
            />
            <div className={`${moduleTablePaginationFooterClass} px-4`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium tabular-nums text-slate-600">
                  {startRow}–{endRow} z {totalCount}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1">
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
        </div>
      )}

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

      <FilterVisibilityModal
        open={columnPickerOpen}
        onClose={() => setColumnPickerOpen(false)}
        title="Widoczne kolumny tabeli"
        catalog={productColumnCatalog}
        selectedOrder={productColumnOrder}
        onSave={persistProductColumns}
        selectedColumnLabel="Widoczne kolumny"
        availableColumnLabel="Ukryte kolumny"
        defaultVisibleOrder={PRODUCT_LIST_DEFAULT_COLUMN_ORDER}
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
