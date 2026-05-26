import { useEffect, useState } from "react";
import { Loader2, X, Package, Barcode, Tag, AlertCircle } from "lucide-react";
import { createWmsMinimalProduct } from "../../api/wmsProductApi";
import { createWmsReceivingProduct } from "../../api/wmsReceivingApi";
import type { StockDocumentRead } from "../../api/stockDocumentsApi";

type BaseProps = {
  open: boolean;
  tenantId: number;
  onClose: () => void;
  initialEan?: string;
  initialName?: string;
  initialSku?: string;
};

type PzProps = BaseProps & {
  variant: "pz";
  pzId: number;
  onCreated: (doc: StockDocumentRead, productId: number) => void;
};

type MinimalProps = BaseProps & {
  variant: "minimal";
  onCreated: (productId: number, productName: string, productEan?: string | null) => void;
};

export type WmsManualProductModalProps = PzProps | MinimalProps;

function extractProductIdFromDoc(doc: StockDocumentRead, ean?: string, sku?: string): number | null {
  const e = (ean || "").trim();
  const s = (sku || "").trim();
  const items = doc.items ?? [];
  if (e) {
    const hit = items.find((it) => (it.product_ean || "").trim() === e && it.product_id != null);
    if (hit?.product_id != null) return hit.product_id;
  }
  if (s) {
    const hit = items.find(
      (it) =>
        it.product_id != null &&
        ((it.product_sku || "").trim() === s || (it.product_symbol || "").trim() === s),
    );
    if (hit?.product_id != null) return hit.product_id;
  }
  const last = [...items].sort((a, b) => b.id - a.id).find((it) => it.product_id != null);
  return last?.product_id ?? null;
}

export function WmsManualProductModal(props: WmsManualProductModalProps) {
  const { open, tenantId, onClose, initialEan = "", initialName = "", initialSku = "" } = props;

  const [name, setName] = useState("");
  const [ean, setEan] = useState("");
  const [sku, setSku] = useState("");
  const [createInAssortment, setCreateInAssortment] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setEan("");
      setSku("");
      setCreateInAssortment(true);
      setErr(null);
      setBusy(false);
      return;
    }
    setName(initialName.trim());
    setEan(initialEan.trim());
    setSku(initialSku.trim());
    setErr(null);
  }, [open, initialEan, initialName, initialSku]);

  const title = props.variant === "pz" ? "Nowy produkt w przyjęciu" : "Utwórz produkt tymczasowy";
  const submitLabel = props.variant === "pz" ? "Dodaj do PZ" : "Utwórz produkt";

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErr("Podaj nazwę produktu");
      return;
    }
    if (!createInAssortment) {
      setErr("Produkt musi być utworzony w asortymencie");
      return;
    }
    setBusy(true);
    setErr(null);
    const eanOpt = ean.trim() || undefined;
    const skuOpt = sku.trim() || undefined;
    try {
      if (props.variant === "pz") {
        const doc = await createWmsReceivingProduct(tenantId, props.pzId, {
          name: trimmedName,
          ean: eanOpt,
          sku: skuOpt,
          create_in_assortment: createInAssortment,
        });
        const pid = extractProductIdFromDoc(doc, eanOpt, skuOpt);
        if (pid == null) {
          setErr("Produkt zapisany, ale nie udało się go powiązać z PZ");
          return;
        }
        props.onCreated(doc, pid);
        onClose();
      } else {
        const res = await createWmsMinimalProduct(tenantId, {
          name: trimmedName,
          ean: eanOpt,
          sku: skuOpt,
          create_in_assortment: createInAssortment,
        });
        props.onCreated(res.product_id, res.product_name, res.product_ean);
        onClose();
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "")
          : "";
      setErr(msg.trim() || "Nie udało się zapisać produktu");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1650] flex items-end sm:items-center justify-center p-0 sm:p-4 font-sans text-slate-800">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        aria-label="Zamknij"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-t-[28px] sm:rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wms-manual-product-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-white z-10">
          <div>
            <h2 id="wms-manual-product-title" className="text-xl font-bold text-slate-900">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-50"
            aria-label="Zamknij"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6 space-y-5">
          {err && (
            <div className="flex items-start gap-3 rounded-xl bg-rose-50 px-4 py-3 border border-rose-100 shadow-sm">
              <AlertCircle className="text-rose-600 mt-0.5" size={18} />
              <p className="text-sm font-medium text-rose-800 leading-relaxed">{err}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Nazwa produktu <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Package className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                  placeholder="np. Klocki drewniane 100 szt."
                  className="w-full h-11 pl-10 pr-4 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-semibold text-slate-900 shadow-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  EAN
                </label>
                <div className="relative">
                  <Barcode className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    value={ean}
                    onChange={(e) => setEan(e.target.value)}
                    disabled={busy}
                    placeholder="Opcjonalnie"
                    className="w-full h-11 pl-10 pr-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono text-sm text-slate-900 shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  SKU
                </label>
                <div className="relative">
                  <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    disabled={busy}
                    placeholder="Opcjonalnie"
                    className="w-full h-11 pl-10 pr-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono text-sm text-slate-900 shadow-sm"
                  />
                </div>
              </div>
            </div>

            <label 
              className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all shadow-sm mt-2 ${
                createInAssortment 
                  ? 'bg-indigo-50/60 border-indigo-200' 
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="checkbox"
                checked={createInAssortment}
                onChange={(e) => setCreateInAssortment(e.target.checked)}
                disabled={busy}
                className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-colors"
              />
              <span className={`text-sm font-semibold select-none ${
                createInAssortment ? 'text-indigo-900' : 'text-slate-700'
              }`}>
                Utwórz od razu w asortymencie
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 p-4 bg-white z-10 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="w-full sm:w-1/3 py-3 text-slate-600 bg-white border border-slate-200 rounded-xl font-semibold hover:bg-slate-50 transition-colors order-2 sm:order-1"
          >
            Anuluj
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="w-full sm:w-2/3 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-all shadow-sm shadow-indigo-600/20 flex items-center justify-center gap-2 order-1 sm:order-2"
          >
            {busy && <Loader2 className="h-5 w-5 animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}