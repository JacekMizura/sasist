import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ScanLine } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { WMS_ROUTES } from "./wmsRoutes";

export default function WmsProductPreviewHubPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { 
    setActiveDocument, 
    setScannerInputPlaceholder,
    registerScanHandler,
    showScannerToast,
  } = useWmsScanner();

  const [scanInputValue, setScanInputValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Podgląd produktu" });
    setScannerInputPlaceholder("Zeskanuj EAN / SKU");
    return () => setActiveDocument(null);
  }, [setActiveDocument, setScannerInputPlaceholder]);

  // Główna logika obsługi skanu
  const handleScan = useCallback(
    async (raw: string) => {
      if (!warehouseId || busy) return;
      const key = raw.trim();
      if (!key) return;

      setBusy(true);
      try {
        // =========================================================================
        // TUTAJ LOGIKA WYSZUKIWANIA/PRZEKIEROWANIA NA KARTĘ PRODUKTU
        // Np. odpytanie API o produkt po EAN/SKU i przekierowanie:
        // const res = await api.get(`/wms/products/resolve?query=${key}`);
        // if (res.data.id) {
        //   navigate(WMS_ROUTES.productDetail(res.data.id));
        // } else {
        //   showScannerToast("Nie znaleziono produktu");
        // }
        // =========================================================================
        
        showScannerToast(`Zeskanowano: ${key}`);
        setScanInputValue("");

      } catch (err) {
        showScannerToast("Błąd wyszukiwania produktu");
      } finally {
        setBusy(false);
      }
    },
    [warehouseId, busy, showScannerToast]
  );

  // Rejestracja sprzętowego skanera
  useEffect(() => {
    registerScanHandler((ean) => {
      void handleScan(ean);
    });
    return () => registerScanHandler(null);
  }, [registerScanHandler, handleScan]);

  if (warehouseId == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <p className="text-slate-500 font-bold tracking-widest uppercase">
          Wybierz magazyn w nagłówku WMS.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-white font-sans text-slate-900 items-center justify-center p-6">
      <main className="w-full max-w-4xl flex flex-col items-center gap-10 animate-in fade-in duration-500 flex-1 justify-center relative">
        
        <div className="w-full flex flex-col items-center">
          
          {/* DUŻY INPUT SKANERA */}
          <div className="w-full relative group">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-6 sm:pl-8">
              <ScanLine
                className={`h-8 w-8 transition-colors sm:h-10 sm:w-10 ${
                  busy ? "text-indigo-300 animate-pulse" : "text-slate-400 group-focus-within:text-[#5a4fcf]"
                }`}
                strokeWidth={2.5}
              />
            </div>
            <input
              type="text"
              autoFocus
              disabled={busy}
              value={scanInputValue}
              onChange={(e) => setScanInputValue(e.target.value)}
              placeholder="Zeskanuj EAN, SKU lub kod kreskowy..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleScan(scanInputValue);
                }
              }}
              className="w-full rounded-[2rem] border-2 border-slate-200 bg-slate-50/80 py-6 pl-[5rem] pr-8 text-lg font-bold text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-[#5a4fcf] focus:bg-white focus:shadow-md focus:ring-4 focus:ring-indigo-500/10 sm:py-8 sm:pl-[6rem] sm:text-2xl disabled:opacity-50"
            />
          </div>

          {/* AKCJA ALTERNATYWNA (Brakujące dane) */}
          <div className="w-full flex flex-col items-center mt-12 animate-in slide-in-from-bottom-4 duration-500">
            <div className="relative flex items-center w-full mb-10">
              <div className="flex-grow border-t-2 border-dashed border-slate-200"></div>
              <span className="shrink-0 px-6 text-xs font-black tracking-widest uppercase text-slate-400">
                LUB
              </span>
              <div className="flex-grow border-t-2 border-dashed border-slate-200"></div>
            </div>

            <Link
              to={WMS_ROUTES.productDataCompletion}
              className={`flex flex-col sm:flex-row items-center justify-center gap-4 bg-white hover:bg-amber-50/40 border-2 border-amber-200 hover:border-amber-400 text-amber-900 p-6 sm:px-10 rounded-[2rem] transition-all active:scale-95 shadow-sm group w-full max-w-xl ${
                busy ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <div className="bg-amber-50 p-4 rounded-[1.25rem] group-hover:scale-110 transition-transform">
                <AlertTriangle className="text-amber-500 w-8 h-8" strokeWidth={2.5} />
              </div>
              <span className="text-sm sm:text-base font-black uppercase tracking-wider text-center">
                Produkty z brakującymi danymi
              </span>
            </Link>
          </div>

        </div>

      </main>
    </div>
  );
}