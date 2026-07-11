import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import api from "../../api/axios";
import { fetchTenantsList } from "../../api/tenantsApi";
import { CatalogEntityPageShell } from "../../components/catalog";
import { ProductEditModal, type ProductEditTabId } from "./ProductEditModal";
import { mapProductListRow } from "./productListMapper";
import { useWarehouse } from "../../context/WarehouseContext";

type Tenant = { id: number; name: string };

type LocationState = {
  tenantId?: number;
  listStockQuantity?: number;
  warehouseId?: number;
} | null;

/**
 * /products/:id/edit — full-page product edit (no modal).
 */
export default function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const tenantFromState = (location.state as LocationState)?.tenantId;
  const tenantFromQuery = searchParams.get("tenant_id");
  const tabParam = searchParams.get("tab");
  const validTabs: ProductEditTabId[] = [
    "basic",
    "suppliers",
    "labelSheet",
    "images",
    "prices",
    "warehouse",
    "warehouseOps",
    "logistics",
    "offers",
    "settings",
    "production",
  ];
  const tabResolved =
    tabParam === "wms-validation" ? "settings" : tabParam;
  const initialTab = validTabs.includes(tabResolved as ProductEditTabId)
    ? (tabResolved as ProductEditTabId)
    : undefined;
  const tenantHint =
    tenantFromState != null && Number.isFinite(tenantFromState)
      ? tenantFromState
      : tenantFromQuery != null && tenantFromQuery !== ""
        ? Number(tenantFromQuery)
        : null;
  const { selectedWarehouseId } = useWarehouse();
  const warehouseHint =
    (location.state as LocationState)?.warehouseId != null &&
    Number.isFinite((location.state as LocationState)?.warehouseId)
      ? Number((location.state as LocationState)?.warehouseId)
      : selectedWarehouseId;
  const listStockHint = (location.state as LocationState)?.listStockQuantity;

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productRow, setProductRow] = useState<ReturnType<typeof mapProductListRow> | null>(null);

  useEffect(() => {
    void fetchTenantsList().then(setTenants).catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    if (id == null || id === "") {
      setError("Brak identyfikatora produktu.");
      setLoading(false);
      return;
    }
    const pid = Number(id);
    if (!Number.isFinite(pid) || pid < 1) {
      setError("Nieprawidłowy identyfikator produktu.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const params: Record<string, string> = {};
    if (tenantHint != null && Number.isFinite(tenantHint)) {
      params.tenant_id = String(tenantHint);
    }
    if (warehouseHint != null && Number.isFinite(warehouseHint)) {
      params.warehouse_id = String(warehouseHint);
    }
    void api
      .get<Record<string, unknown>>(`/products/${pid}/`, { params })
      .then((res) => {
        try {
          setProductRow(mapProductListRow(res.data));
        } catch {
          setError("Nie udało się wczytać produktu.");
          setProductRow(null);
        }
      })
      .catch(() => {
        setError("Nie udało się wczytać produktu.");
        setProductRow(null);
      })
      .finally(() => setLoading(false));
  }, [id, tenantHint, warehouseHint]);

  // Po powrocie z innej karty/okna (np. zakończenie PZ) – odśwież produkt bez zacinania pełnoekranowego loadera.
  useEffect(() => {
    if (id == null || id === "") return;
    const pid = Number(id);
    if (!Number.isFinite(pid) || pid < 1) return;
    const params: Record<string, string> = {};
    if (tenantHint != null && Number.isFinite(tenantHint)) {
      params.tenant_id = String(tenantHint);
    }
    if (warehouseHint != null && Number.isFinite(warehouseHint)) {
      params.warehouse_id = String(warehouseHint);
    }
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      void api
        .get<Record<string, unknown>>(`/products/${pid}/`, { params })
        .then((res) => {
          try {
            setProductRow(mapProductListRow(res.data));
          } catch {
            setError("Nie udało się wczytać produktu.");
            setProductRow(null);
          }
        })
        .catch(() => {
          setError("Nie udało się wczytać produktu.");
        });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [id, tenantHint, warehouseHint]);

  const goProducts = () => navigate("/products", { replace: true });

  if (loading) {
    return (
      <CatalogEntityPageShell loading loadingLabel="Ładowanie…" />
    );
  }

  if (error != null || productRow == null) {
    return (
      <CatalogEntityPageShell
        error={
          <>
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error ?? "Brak danych."}</div>
            <button
              type="button"
              onClick={goProducts}
              className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Wróć do listy
            </button>
          </>
        }
      />
    );
  }

  const p = productRow;

  return (
    <CatalogEntityPageShell>
      <ProductEditModal
              variant="page"
              tenants={tenants}
              initialTab={initialTab}
              scrollToWmsValidation={tabParam === "wms-validation"}
              listStockHint={
                listStockHint != null && Number.isFinite(listStockHint) ? Number(listStockHint) : undefined
              }
              product={{
                ...p,
                name: p.name ?? "",
                ean: p.ean ?? "",
                symbol: p.symbol ?? "",
                manufacturer: p.manufacturer,
                manufacturer_id: p.manufacturer_id,
                manufacturer_brief: p.manufacturer_brief,
                default_supplier_id: p.default_supplier_id,
                default_supplier_brief: p.default_supplier_brief,
                gpsr_responsible_name: p.gpsr_responsible_name,
                gpsr_responsible_email: p.gpsr_responsible_email,
                tenant_id: p.tenant_id,
                assignedLocations: p.assignedLocations,
                locations: p.locations,
                inventory: p.inventory,
                stock_quantity: p.stock_quantity,
                location_allocated_quantity: p.location_allocated_quantity,
                unallocated_quantity: p.unallocated_quantity,
                reserved_quantity: p.reserved_quantity,
                production_reserved_quantity: p.production_reserved_quantity,
                available_quantity: p.available_quantity,
                disposition_stock: p.disposition_stock,
                locations_load_incomplete: p.locations_load_incomplete,
                detail_degraded: p.detail_degraded,
                purchase_price: p.purchase_price,
                extra_cost_packaging_net: p.extra_cost_packaging_net,
                extra_cost_commission_percent: p.extra_cost_commission_percent,
                extra_cost_other_net: p.extra_cost_other_net,
                previous_purchase_price: p.previous_purchase_price,
                purchase_price_original: p.purchase_price_original,
                purchase_currency: p.purchase_currency,
                last_purchase_date: p.last_purchase_date,
                last_supplier_id: p.last_supplier_id,
                last_supplier_brief: p.last_supplier_brief,
                last_purchase_currency: p.last_purchase_currency,
                current_cost: p.current_cost,
                sale_price: p.sale_price,
                metadata_json: p.metadata_json ?? null,
                min_pick_quantity: p.min_pick_quantity,
                max_pick_quantity: p.max_pick_quantity,
                min_reserve_quantity: p.min_reserve_quantity,
                max_reserve_quantity: p.max_reserve_quantity,
                enable_stock_alert: p.enable_stock_alert,
                min_total_stock: p.min_total_stock,
                bulk_ean: p.bulk_ean,
                units_per_carton: p.units_per_carton,
                carton_length_cm: p.carton_length_cm,
                carton_width_cm: p.carton_width_cm,
                carton_height_cm: p.carton_height_cm,
                carton_weight_kg: p.carton_weight_kg,
                carton_volume_dm3: p.carton_volume_dm3,
                track_batch: p.track_batch,
                track_expiry: p.track_expiry,
                track_serial: p.track_serial,
                require_recv_height: p.require_recv_height,
                require_recv_width: p.require_recv_width,
                require_recv_length: p.require_recv_length,
                require_recv_weight: p.require_recv_weight,
                require_recv_master_carton: p.require_recv_master_carton,
                require_recv_master_carton_ean: p.require_recv_master_carton_ean,
                require_recv_master_carton_qty: p.require_recv_master_carton_qty,
                require_recv_master_carton_dims: p.require_recv_master_carton_dims,
                require_recv_master_carton_weight: p.require_recv_master_carton_weight,
              }}
              onSave={() => {}}
              onClose={() => {}}
            />
    </CatalogEntityPageShell>
  );
}
