import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import api from "../../api/axios";
import PageLayout from "../../components/layout/PageLayout";
import { ProductEditModal, type ProductEditTabId } from "./ProductEditModal";
import { mapProductListRow } from "./productListMapper";

type Tenant = { id: number; name: string };

type LocationState = { tenantId?: number } | null;

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

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productRow, setProductRow] = useState<ReturnType<typeof mapProductListRow> | null>(null);

  useEffect(() => {
    api
      .get<Tenant[]>("/tenants/")
      .then((res) => setTenants(Array.isArray(res.data) ? res.data : []))
      .catch(() => setTenants([]));
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
  }, [id, tenantHint]);

  // Po powrocie z innej karty/okna (np. zakończenie PZ) – odśwież produkt bez zacinania pełnoekranowego loadera.
  useEffect(() => {
    if (id == null || id === "") return;
    const pid = Number(id);
    if (!Number.isFinite(pid) || pid < 1) return;
    const params: Record<string, string> = {};
    if (tenantHint != null && Number.isFinite(tenantHint)) {
      params.tenant_id = String(tenantHint);
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
  }, [id, tenantHint]);

  const goProducts = () => navigate("/products", { replace: true });

  if (loading) {
    return (
      <PageLayout omitCard fullBleed>
        <div className="w-full bg-slate-100 pb-8 pt-2 font-sans text-base antialiased">
          <div className="w-full max-w-none px-2 sm:px-3 lg:px-4">
            <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_12px_40px_-12px_rgba(15,23,42,0.07)]">
              <div className="flex min-h-[40vh] items-center justify-center gap-2 px-4 py-16 text-slate-500">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
                Ładowanie…
              </div>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error != null || productRow == null) {
    return (
      <PageLayout omitCard fullBleed>
        <div className="w-full bg-slate-100 pb-8 pt-2 font-sans text-base antialiased">
          <div className="w-full max-w-none px-2 sm:px-3 lg:px-4">
            <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06),0_12px_40px_-12px_rgba(15,23,42,0.07)] sm:p-6">
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error ?? "Brak danych."}</div>
              <button
                type="button"
                onClick={goProducts}
                className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Wróć do listy
              </button>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  const p = productRow;

  return (
    <PageLayout omitCard fullBleed>
      <div className="w-full bg-slate-100 pb-8 pt-2 font-sans text-base antialiased">
        <div className="w-full max-w-none px-2 sm:px-3 lg:px-4">
          <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_12px_40px_-12px_rgba(15,23,42,0.07)]">
            <ProductEditModal
              variant="page"
              tenants={tenants}
              focusPlanLocations={false}
              initialTab={initialTab}
              scrollToWmsValidation={tabParam === "wms-validation"}
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
                available_quantity: p.available_quantity,
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
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
