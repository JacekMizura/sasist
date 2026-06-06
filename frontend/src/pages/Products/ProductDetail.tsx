import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import api from "../../api/axios";
import { quickPurchaseOrderFromProduct } from "../../api/inboundDeliveriesApi";

type Product = {
  id: number;
  name: string | null;
  ean: string | null;
  symbol: string | null;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  volume?: number;
  tenant_id?: number;
  default_supplier_id?: number | null;
};

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tenantId = useMemo(() => {
    const t = Number(searchParams.get("tenant_id"));
    return Number.isFinite(t) && t >= 1 ? t : 1;
  }, [searchParams]);

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderBusy, setOrderBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api
      .get<Product>(`/products/${id}/`, { params: { tenant_id: tenantId } })
      .then((res) => setProduct(res.data))
      .catch((err: unknown) => {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        setError(status === 404 ? "Nie znaleziono produktu." : "Nie udało się wczytać produktu.");
      })
      .finally(() => setLoading(false));
  }, [id, tenantId]);

  const orderFromSupplier = useCallback(async () => {
    if (!product) return;
    if (product.default_supplier_id == null) {
      window.alert("Ustaw domyślnego dostawcę w edycji produktu (Podstawowe), aby móc szybko zamówić.");
      navigate(`/products/${product.id}/edit`, { state: { tenantId: product.tenant_id ?? tenantId } });
      return;
    }
    const tid = product.tenant_id ?? tenantId;
    setOrderBusy(true);
    try {
      const d = await quickPurchaseOrderFromProduct({
        tenant_id: tid,
        product_id: product.id,
      });
      navigate(`/goods-orders?edit=${d.id}&tenant_id=${tid}`);
    } catch (e) {
      let msg = "Nie udało się utworzyć szkicu zamówienia.";
      if (axios.isAxiosError(e)) {
        const data = e.response?.data;
        if (data && typeof data === "object" && "detail" in data) {
          const det = (data as { detail: unknown }).detail;
          if (typeof det === "string") msg = det;
          else if (Array.isArray(det)) {
            msg = det
              .map((x) =>
                typeof x === "object" && x != null && "msg" in x ? String((x as { msg: unknown }).msg) : String(x),
              )
              .join("; ");
          }
        }
      }
      window.alert(msg);
    } finally {
      setOrderBusy(false);
    }
  }, [navigate, product, tenantId]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-2 text-slate-500">
          <span className="w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
          Ładowanie…
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="p-8">
        <p className="text-red-600">{error ?? "Brak produktu"}</p>
        <Link to="/products/list" className="mt-4 inline-block text-blue-600 hover:underline">
          ← Lista produktów
        </Link>
      </div>
    );
  }

  const tenantQs = tenantId !== 1 ? `?tenant_id=${tenantId}` : "";

  return (
    <div className="w-full p-8">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h1 className="text-xl font-bold text-slate-800 mb-4">{product.name ?? "—"}</h1>
        <dl className="grid grid-cols-1 gap-2 text-sm">
          <div>
            <dt className="text-slate-500">EAN</dt>
            <dd className="font-mono">{product.ean ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Symbol</dt>
            <dd>{product.symbol ?? "—"}</dd>
          </div>
          {product.volume != null && product.volume > 0 && (
            <div>
              <dt className="text-slate-500">Objętość</dt>
              <dd>{product.volume} dm³</dd>
            </div>
          )}
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={orderBusy}
            onClick={() => void orderFromSupplier()}
            className="inline-flex items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 shadow-sm hover:bg-sky-100 disabled:opacity-50"
          >
            {orderBusy ? "Tworzenie…" : "Zamów u dostawcy"}
          </button>
          <Link
            to={`/products/${product.id}/edit`}
            state={{ tenantId: product.tenant_id ?? tenantId }}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Edytuj produkt
          </Link>
        </div>
        <div className="mt-6">
          <Link
            to={`/products/list${tenantQs}`}
            className="text-blue-600 hover:underline text-sm font-medium"
          >
            ← Lista produktów
          </Link>
        </div>
      </div>
    </div>
  );
}
