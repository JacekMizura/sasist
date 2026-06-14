import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ScanLine } from "lucide-react";
import { postSingleBulkStockScan } from "../../api/bundlesLogisticsApi";
import { WmsOperationalPageBody, WmsOperationalPageShell } from "../../components/wms/execution/WmsOperationalPageShell";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { playScanBeep } from "../../utils/playScanBeep";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { appendBulkScanLog, bulkScanLogEntry, type BundleBulkScanLogEntry } from "../../utils/bundleScanFlow";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WMS_ROUTES } from "./wmsRoutes";

function fmtTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

/** STOCK — skanuj kolejne bundle; każdy skan = jedna linia complete. */
export default function WmsBundleBulkScanPage() {
  const { registerScanHandler, setActiveDocument, appendScanToHistory, showScannerToast, refocusScannerInput, setScannerInputPlaceholder } =
    useWmsScanner();
  const [log, setLog] = useState<BundleBulkScanLogEntry[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Bulk scan — bundle STOCK" });
    setScannerInputPlaceholder("Skanuj kolejne bundle (EAN)");
    refocusScannerInput();
    return () => setActiveDocument(null);
  }, [setActiveDocument, setScannerInputPlaceholder, refocusScannerInput]);

  const onScan = useCallback(
    async (raw: string) => {
      const barcode = normalizeScanEan(raw);
      if (!barcode || busy) return;
      setBusy(true);
      try {
        const out = await postSingleBulkStockScan(DAMAGE_TENANT_ID, barcode);
        const ok = out.found && out.action === "pick_stock_line";
        playScanBeep();
        appendScanToHistory(barcode);
        const message = ok ? out.message ?? "Linia STOCK zaliczona" : out.message ?? "Nie rozpoznano STOCK bundle";
        setLog((prev) => appendBulkScanLog(prev, bulkScanLogEntry(barcode, ok, message)));
        showScannerToast(message);
      } catch {
        setLog((prev) =>
          appendBulkScanLog(prev, bulkScanLogEntry(barcode, false, "Błąd skanu — sprawdź kod STOCK bundle")),
        );
        showScannerToast("Błąd skanu bundle.");
      } finally {
        setBusy(false);
        refocusScannerInput();
      }
    },
    [busy, appendScanToHistory, showScannerToast, refocusScannerInput],
  );

  useEffect(() => {
    registerScanHandler((raw) => {
      void onScan(raw);
    });
    return () => registerScanHandler(null);
  }, [registerScanHandler, onScan]);

  return (
    <WmsOperationalPageShell className="bg-slate-50 font-sans">
      <WmsOperationalPageBody className="max-w-2xl mx-auto space-y-6 !py-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            to={WMS_ROUTES.picking}
            className="text-xs font-black uppercase tracking-widest text-slate-500 hover:text-indigo-700"
          >
            ← Zbieranie
          </Link>
          <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-indigo-700">
            <ScanLine size={16} />
            Bulk STOCK
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
          <p className="text-lg font-black text-slate-900">Skanuj kolejne bundle</p>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Każdy skan EAN bundle STOCK zalicza jedną linię. Użyj globalnego pola skanera.
          </p>
          {busy ? <p className="mt-4 text-sm font-semibold text-indigo-600">Przetwarzanie…</p> : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Historia skanów</p>
          </div>
          {log.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Brak skanów — zeskanuj pierwszy bundle.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {log.map((row) => (
                <li key={row.id} className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-mono font-bold text-slate-800">{row.barcode}</span>
                  <span className="text-xs tabular-nums text-slate-400">{fmtTime(row.scanned_at)}</span>
                  <span
                    className={`ml-auto text-xs font-black uppercase ${
                      row.status === "ok" ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {row.status === "ok" ? "OK" : "Błąd"}
                  </span>
                  <span className="w-full text-xs font-medium text-slate-600">{row.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </WmsOperationalPageBody>
    </WmsOperationalPageShell>
  );
}
