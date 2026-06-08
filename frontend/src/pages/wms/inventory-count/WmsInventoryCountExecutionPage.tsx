import { Link, useParams } from "react-router-dom";
import { AlertTriangle, HelpCircle, MapPin, Search } from "lucide-react";

import WmsInventoryProductChipList from "../../../modules/inventoryCount/components/WmsInventoryProductChipList";
import WmsInventoryUniversalSearchModal from "../../../modules/inventoryCount/components/WmsInventoryUniversalSearchModal";
import WmsInventoryUnknownProductModal from "../../../modules/inventoryCount/components/WmsInventoryUnknownProductModal";
import { useWmsInventoryCountExecution } from "../../../modules/inventoryCount/hooks/useWmsInventoryCountExecution";
import { wmsInventoryCountPaths } from "../../../modules/inventoryCount/inventoryCountPaths";
import { WMS_INV } from "../../../modules/inventoryCount/wmsIndustrialTheme";
import { useWarehouse } from "../../../context/WarehouseContext";

const TENANT_ID = 1;

export default function WmsInventoryCountExecutionPage() {
  const { taskId } = useParams();
  const { warehouse } = useWarehouse();
  const tenantId = TENANT_ID;
  const warehouseId = warehouse?.id;
  const id = Number(taskId);

  const {
    loading,
    error,
    task,
    summary,
    sessionId,
    step,
    locationLabel,
    scanHint,
    activeProductLabel,
    pendingQty,
    scanMode,
    autoConfirm,
    searchOpen,
    unknownOpen,
    lastScanCode,
    online,
    progressLabel,
    confirmManualQty,
    setManualQty,
    setScanMode,
    setAutoConfirm,
    setSearchOpen,
    setUnknownOpen,
    reloadSummary,
  } = useWmsInventoryCountExecution(id, tenantId, warehouseId);

  if (loading) {
    return <p className={`py-16 text-center text-lg font-semibold ${WMS_INV.textMuted}`}>Wczytywanie lokalizacji…</p>;
  }
  if (error || !task) {
    return (
      <div className="text-center">
        <p className="text-lg font-bold text-[#b42318]">{error ?? "Zadanie niedostępne."}</p>
        <Link to={wmsInventoryCountPaths.root} className={`mt-6 inline-block text-sm font-semibold ${WMS_INV.textMuted}`}>
          ← Kolejka zadań
        </Link>
      </div>
    );
  }

  const varianceCount = summary?.variance.length ?? 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {/* Location-first header */}
      <header className={`rounded-xl border-2 ${WMS_INV.borderStrong} ${WMS_INV.surface} p-4 shadow-sm`}>
        <p className="text-xs font-black uppercase tracking-widest text-[#1e4d8c]">Lokalizacja</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-black tracking-tight text-[#1a2b3c] md:text-4xl">
          <MapPin className="h-8 w-8 shrink-0 text-[#1e4d8c]" aria-hidden />
          {locationLabel}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-bold text-[#5a6b7d]">
          <span>{progressLabel}</span>
          <span className="text-xs font-normal">· {task.task_number}</span>
          {!online ? <span className="text-[#b45309]">Offline</span> : null}
        </div>
        {varianceCount > 0 ? (
          <div className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${WMS_INV.warning}`}>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Wykryto {varianceCount} różnic w tej lokalizacji
          </div>
        ) : null}
      </header>

      {/* Scan zone */}
      <section className={`rounded-xl ${WMS_INV.scanZone} px-4 py-8 text-center`}>
        <p className="text-xs font-black uppercase tracking-widest text-[#1e4d8c]">
          {step === "location" ? "Krok 1 — potwierdź lokalizację" : "Krok 2 — skanuj produkty"}
        </p>
        <p className="mt-3 text-xl font-bold leading-snug text-[#1a2b3c] md:text-2xl">{scanHint}</p>
        {activeProductLabel ? (
          <p className="mt-2 text-lg font-black text-[#1e4d8c]">{activeProductLabel}</p>
        ) : null}
        {summary?.blind_mode ? (
          <p className="mt-4 text-xs font-semibold text-[#5a6b7d]">Tryb blind — stany oczekiwane ukryte</p>
        ) : null}
      </section>

      {/* Fast count controls */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setScanMode("increment")}
          className={`min-h-[44px] flex-1 rounded-lg border-2 px-3 py-2 text-xs font-black uppercase ${
            scanMode === "increment" ? "border-[#1e4d8c] bg-[#1e4d8c] text-white" : `${WMS_INV.border} bg-white text-[#5a6b7d]`
          }`}
        >
          Skan +1
        </button>
        <button
          type="button"
          onClick={() => setScanMode("manual")}
          className={`min-h-[44px] flex-1 rounded-lg border-2 px-3 py-2 text-xs font-black uppercase ${
            scanMode === "manual" ? "border-[#1e4d8c] bg-[#1e4d8c] text-white" : `${WMS_INV.border} bg-white text-[#5a6b7d]`
          }`}
        >
          Ilość ręczna
        </button>
        <label className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 ${WMS_INV.border} bg-white px-3 text-xs font-black uppercase`}>
          <input
            type="checkbox"
            checked={autoConfirm}
            onChange={(e) => setAutoConfirm(e.target.checked)}
            className="h-4 w-4 accent-[#1e4d8c]"
          />
          Auto zapis
        </label>
      </div>

      {scanMode === "manual" && activeProductLabel ? (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {[1, 2, 5, 10, 25, 50].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setManualQty(n)}
                className={`min-h-[48px] rounded-lg border-2 ${WMS_INV.border} bg-white text-lg font-black tabular-nums hover:border-[#1e4d8c] hover:bg-[#eef3fa]`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-center text-3xl font-black tabular-nums text-[#1e4d8c]">{pendingQty}</p>
          <button type="button" className={`${WMS_INV.btnPrimary} w-full`} onClick={() => void confirmManualQty()}>
            Potwierdź {pendingQty} szt.
          </button>
        </div>
      ) : null}

      {/* Mixed SKU chips */}
      {summary ? (
        <section className={`rounded-xl border-2 ${WMS_INV.border} ${WMS_INV.surface} p-4`}>
          <h2 className="mb-3 text-xs font-black uppercase tracking-wider text-[#1e4d8c]">Produkty w lokalizacji</h2>
          <WmsInventoryProductChipList
            pending={summary.pending}
            counted={summary.counted}
            variance={summary.variance}
            unexpected={summary.unexpected}
          />
        </section>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={WMS_INV.btnGhost} onClick={() => setSearchOpen(true)}>
          <Search className="mr-2 h-4 w-4" />
          Szukaj (Ctrl+K)
        </button>
        <button type="button" className={WMS_INV.btnAccent} onClick={() => setUnknownOpen(true)}>
          <HelpCircle className="mr-2 h-4 w-4" />
          Nieznany produkt
        </button>
      </div>

      <Link to={wmsInventoryCountPaths.root} className={`text-center text-sm font-semibold ${WMS_INV.textMuted}`}>
        ← Kolejka zadań
      </Link>

      <WmsInventoryUniversalSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        tenantId={tenantId}
        warehouseId={warehouseId!}
        documentId={task.inventory_document_id}
        onPickProduct={() => void reloadSummary()}
      />

      <WmsInventoryUnknownProductModal
        open={unknownOpen}
        onClose={() => setUnknownOpen(false)}
        tenantId={tenantId}
        warehouseId={warehouseId!}
        documentId={task.inventory_document_id}
        taskId={task.id}
        locationId={task.location_id}
        locationCode={locationLabel}
        sessionId={sessionId}
        initialBarcode={lastScanCode ?? undefined}
        onCreated={() => void reloadSummary()}
      />
    </div>
  );
}
