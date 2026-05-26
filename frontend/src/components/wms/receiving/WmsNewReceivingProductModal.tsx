import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { createWmsReceivingProduct } from "../../../api/wmsReceivingApi";
import type { StockDocumentRead } from "../../../api/stockDocumentsApi";

type Props = {
  open: boolean;
  tenantId: number;
  pzId: number;
  ean: string;
  onClose: () => void;
  onCreated: (doc: StockDocumentRead, productId: number) => void;
};

export function WmsNewReceivingProductModal({ open, tenantId, pzId, ean, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("szt.");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setSku("");
      setUnit("szt.");
      setErr(null);
      setBusy(false);
    }
  }, [open, ean]);

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErr("Podaj nazwę produktu");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const doc = await createWmsReceivingProduct(tenantId, pzId, {
        ean: ean.trim(),
        name: trimmedName,
        sku: sku.trim() || undefined,
        unit: unit.trim() || "szt.",
      });
      const pid =
        doc.items?.find((it) => it.product_id != null && (it.product_ean || "").trim() === ean.trim())?.product_id ??
        [...(doc.items ?? [])].sort((a, b) => b.id - a.id).find((it) => it.product_id != null)?.product_id;
      if (pid == null) {
        setErr("Produkt utworzony, ale nie udało się go powiązać z PZ");
        return;
      }
      onCreated(doc, pid);
      onClose();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "")
          : "";
      if (msg.toLowerCase().includes("ean")) {
        setErr("Ten EAN już istnieje — zeskanuj ponownie, aby dodać do PZ.");
      } else {
        setErr("Nie udało się utworzyć produktu");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1650] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="Zamknij"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-t-[28px] sm:rounded-[28px] bg-white shadow-2xl border border-slate-200"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-lg font-black text-slate-900">Nowy produkt</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Zamknij"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-5 sm:p-6 space-y-4">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">EAN</span>
            <input
              type="text"
              readOnly
              value={ean}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm font-semibold text-slate-800"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nazwa produktu</span>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              disabled={busy}
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">SKU (opcjonalnie)</span>
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-400"
              disabled={busy}
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Jednostka</span>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-400"
              disabled={busy}
            />
          </label>
          {err ? <p className="text-sm font-medium text-red-600">{err}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-md hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            Utwórz i przyjmij
          </button>
        </div>
      </div>
    </div>
  );
}
