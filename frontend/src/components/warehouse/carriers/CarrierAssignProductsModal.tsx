import { useEffect, useMemo, useState } from "react";
import { listWmsCarriers, scanWmsCarrierByBarcode, type WarehouseCarrierRead } from "../../../api/wmsCarrierApi";
import { normalizeCarrierBarcode } from "../../../utils/carrierBarcode";

type Props = {
  tenantId: number;
  open: boolean;
  onClose: () => void;
  onPick: (carrier: WarehouseCarrierRead) => void;
};

export function CarrierAssignProductsModal({ tenantId, open, onClose, onPick }: Props) {
  const [rows, setRows] = useState<WarehouseCarrierRead[]>([]);
  const [scan, setScan] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setScan("");
    void listWmsCarriers(tenantId)
      .then(setRows)
      .catch(() => setRows([]));
  }, [open, tenantId]);

  const filtered = useMemo(() => {
    const q = normalizeCarrierBarcode(scan).toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.barcode.toLowerCase().includes(q) ||
        String(r.id).includes(q),
    );
  }, [rows, scan]);

  if (!open) return null;

  const resolveScan = async () => {
    const bc = normalizeCarrierBarcode(scan);
    if (!bc) {
      setErr("Wpisz lub zeskanuj kod nośnika.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const out = await scanWmsCarrierByBarcode(tenantId, bc);
      if (!out.found || !out.carrier) {
        setErr("Nie znaleziono nośnika.");
        return;
      }
      onPick(out.carrier);
      onClose();
    } catch {
      setErr("Błąd wyszukiwania.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-lg font-black text-slate-900">Wybierz nośnik</h2>
          <p className="text-xs text-slate-600">Skan lub wyszukaj po kodzie / numerze.</p>
          <div className="mt-3 flex gap-2">
            <input
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              placeholder="PAL-000123"
              className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-amber-50/40 px-3 py-2 font-mono text-sm"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void resolveScan()}
              className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black uppercase text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Szukaj
            </button>
          </div>
          {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        </div>
        <ul className="flex-1 overflow-y-auto p-2">
          {filtered.slice(0, 80).map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(r);
                  onClose();
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-mono font-bold text-slate-900">{r.code}</span>
                <span className="truncate text-xs text-slate-500">{r.barcode}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-100 p-3 text-right">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600">
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
