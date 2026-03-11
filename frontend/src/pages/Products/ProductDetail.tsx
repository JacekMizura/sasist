import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../../api/axios";

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
};

const TENANT_ID = 1;

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api
      .get<Product>(`/products/${id}/`, { params: { tenant_id: TENANT_ID } })
      .then((res) => setProduct(res.data))
      .catch(() => setError("Nie znaleziono produktu"))
      .finally(() => setLoading(false));
  }, [id]);

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

  return (
    <div className="p-8 max-w-2xl">
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
          {(product.volume != null && product.volume > 0) && (
            <div>
              <dt className="text-slate-500">Objętość</dt>
              <dd>{product.volume} dm³</dd>
            </div>
          )}
        </dl>
        <div className="mt-6">
          <Link
            to="/products/list"
            className="text-blue-600 hover:underline text-sm font-medium"
          >
            ← Lista produktów
          </Link>
        </div>
      </div>
    </div>
  );
}
