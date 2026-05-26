import { useCallback, useEffect, useState } from "react";
import { postOrderLine } from "../../api/ordersApi";
import { listBundles, type BundleRead } from "../../api/bundlesApi";

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

function formatBundleOption(b: BundleRead): string {
  const name = (b.name ?? "").trim() || "—";
  const sku = (b.sku ?? "").trim();
  const ean = (b.ean ?? "").trim();
  const bits = [`ID ${b.id}`, sku ? `SKU ${sku}` : "", ean ? `EAN ${ean}` : ""].filter(Boolean);
  return `${name} (${bits.join(" / ")})`;
}

export default function OrderAddBundleModal({ open, onClose, tenantId, orderId, currency, onAdded }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<BundleRead[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<BundleRead | null>(null);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [ean, setEan] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
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
      void listBundles({ tenantId, search: t, activeFilter: "active" })
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => window.clearTimeout(id);
  }, [open, q, tenantId]);

  const pickBundle = (b: BundleRead) => {
    setSelected(b);
    setName((b.name ?? "").trim());
    setSku((b.sku ?? "").trim());
    setEan((b.ean ?? "").trim());
    const sp = b.sale_price;
    setPrice(sp != null && !Number.isNaN(Number(sp)) ? String(sp) : "");
    setHits([]);
    setQ((b.name ?? "").trim());
  };

  const save = async () => {
    if (!selected) {
      setErr("Wybierz zestaw z listy wyszukiwania.");
      return;
    }
    const qty = Math.max(1, Math.floor(Number(quantity.replace(",", ".")) || 0));
    if (!Number.isFinite(qty) || qty < 1) {
      setErr("Podaj poprawną ilość.");
      return;
    }
    const priceNum = price.trim() === "" ? null : Number(price.replace(",", "."));
    if (price.trim() !== "" && (Number.isNaN(priceNum) || priceNum == null || priceNum < 0)) {
      setErr("Podaj poprawną cenę lub zostaw puste (cena katalogowa zestawu).");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await postOrderLine(orderId, {
        bundle_id: selected.id,
        quantity: qty,
        unit_price: priceNum,
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
          : "Nie udało się dodać zestawu.";
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
        data-add-bundle-modal-root
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">Dodaj zestaw</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            Zamknij
          </button>
        </div>

        <p className="mt-2 text-xs leading-snug text-slate-600">
          Wybierz zestaw z katalogu — składniki zostaną dodane jako osobne pozycje zamówienia (powiązane ze zestawem).
        </p>

        <div className="relative mt-4">
          <label className="block text-xs font-medium text-slate-600">
            Wyszukaj zestaw
            <input
              className={inp}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSelected(null);
              }}
              placeholder="Nazwa zestawu, SKU lub EAN…"
              autoComplete="off"
            />
          </label>
          {searching ? <p className="mt-1 text-xs text-slate-500">Szukanie…</p> : null}
          {hits.length > 0 ? (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
              {hits.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                  onClick={() => pickBundle(b)}
                >
                  {formatBundleOption(b)}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
            Nazwa zestawu
            <input className={`${inp} bg-slate-50/80`} value={name} readOnly tabIndex={-1} />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            SKU
            <input className={`${inp} bg-slate-50/80`} value={sku} readOnly tabIndex={-1} />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            EAN
            <input className={`${inp} bg-slate-50/80`} value={ean} readOnly tabIndex={-1} />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Ilość zestawów
            <input className={inp} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Cena zestawu ({currency})
            <input
              className={inp}
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="z katalogu jeśli puste"
            />
          </label>
        </div>

        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
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
