import { useCallback, useEffect, useState } from "react";
import { postOrderLine } from "../../api/ordersApi";
import { searchProductsCatalog, vatFromProductMetadata, type ProductSearchHit } from "../../api/productsSearchApi";

const inp =
  "mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30";

type Props = {
  open: boolean;
  onClose: () => void;
  tenantId: number;
  orderId: number;
  currency: string;
  onAdded: () => void;
};

function formatOptionLabel(p: ProductSearchHit): string {
  const name = (p.name ?? "").trim() || "—";
  const id = p.id;
  const ean = (p.ean ?? "").trim();
  const sku = (p.symbol ?? p.sku ?? "").trim();
  const bits = [`ID ${id}`, ean ? `EAN ${ean}` : "", sku ? `SKU ${sku}` : ""].filter(Boolean);
  return `${name} (${bits.join(" / ")})`;
}

export default function OrderAddProductModal({ open, onClose, tenantId, orderId, currency, onAdded }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ProductSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ProductSearchHit | null>(null);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [ean, setEan] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [vat, setVat] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reset = useCallback(() => {
    setQ("");
    setHits([]);
    setSelected(null);
    setName("");
    setSku("");
    setEan("");
    setQuantity("1");
    setPrice("");
    setUnit("");
    setVat("");
    setErr(null);
    setSearching(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    reset();
  }, [open, orderId, reset]);

  useEffect(() => {
    if (!open) return;
    const t = q.trim();
    if (t.length < 2) {
      setHits([]);
      return;
    }
    const id = window.setTimeout(() => {
      setSearching(true);
      void searchProductsCatalog(tenantId, t, 25)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => window.clearTimeout(id);
  }, [open, q, tenantId]);

  const pickProduct = (p: ProductSearchHit) => {
    setSelected(p);
    setName((p.name ?? "").trim());
    setSku((p.symbol ?? p.sku ?? "").trim());
    setEan((p.ean ?? "").trim());
    const sp = p.sale_price;
    setPrice(sp != null && !Number.isNaN(Number(sp)) ? String(sp) : "");
    setUnit((p.unit ?? "").trim());
    const v = vatFromProductMetadata(p.metadata_json ?? null);
    setVat(v != null ? String(v) : "");
    setHits([]);
    setQ((p.name ?? "").trim());
  };

  const save = async () => {
    if (!selected) {
      setErr("Wybierz produkt z listy wyszukiwania.");
      return;
    }
    const qty = Math.max(1, Math.floor(Number(quantity.replace(",", ".")) || 0));
    if (!Number.isFinite(qty) || qty < 1) {
      setErr("Podaj poprawną ilość.");
      return;
    }
    const priceNum = price.trim() === "" ? null : Number(price.replace(",", "."));
    if (price.trim() !== "" && (Number.isNaN(priceNum) || priceNum == null || priceNum < 0)) {
      setErr("Podaj poprawną cenę lub zostaw puste (cena katalogowa).");
      return;
    }
    const vatNum = vat.trim() === "" ? null : Number(vat.replace(",", "."));
    if (vat.trim() !== "" && (Number.isNaN(vatNum) || vatNum == null || vatNum < 0 || vatNum > 100)) {
      setErr("VAT musi być w zakresie 0–100 lub pusty.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await postOrderLine(orderId, {
        product_id: selected.id,
        quantity: qty,
        unit_price: priceNum,
        unit: unit.trim() || null,
        vat_percent: vatNum,
      });
      onAdded();
      onClose();
    } catch (e: unknown) {
      const msg =
        typeof e === "object" &&
        e !== null &&
        "response" in e &&
        typeof (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail === "string"
          ? String((e as { response: { data: { detail: string } } }).response.data.detail)
          : "Nie udało się dodać pozycji.";
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        data-add-product-modal-root
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">Dodaj produkt</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            Zamknij
          </button>
        </div>

        <div className="relative mt-4">
          <label className="block text-xs font-medium text-slate-600">
            Wyszukaj w katalogu
            <input
              className={inp}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSelected(null);
              }}
              placeholder="Nazwa, SKU lub EAN…"
              autoComplete="off"
            />
          </label>
          {searching ? <p className="mt-1 text-xs text-slate-500">Szukanie…</p> : null}
          {hits.length > 0 ? (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
              {hits.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                  onClick={() => pickProduct(p)}
                >
                  {formatOptionLabel(p)}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
            Nazwa
            <input className={inp} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            SKU
            <input className={inp} value={sku} onChange={(e) => setSku(e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            EAN
            <input className={inp} value={ean} onChange={(e) => setEan(e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Ilość
            <input className={inp} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Cena ({currency})
            <input className={inp} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="z katalogu jeśli puste" />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Jednostka
            <input className={inp} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="np. szt." />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            VAT %
            <input className={inp} inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} placeholder="opcjonalnie" />
          </label>
        </div>

        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
            Anuluj
          </button>
          <button
            type="button"
            disabled={saving || !selected}
            onClick={() => void save()}
            className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "…" : "Dodaj do zamówienia"}
          </button>
        </div>
      </div>
    </div>
  );
}
