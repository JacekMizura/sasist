import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getWmsPackingModes } from "../../api/wmsPackingApi";
import { PackingModeSelectionView } from "../../components/wms/packing/PackingModeSelectionView";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { loadWmsPackingSession } from "./wmsPackingSession";
import { WMS_ROUTES } from "./wmsRoutes";

export default function WmsPackingModePage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { setActiveDocument, setScannerInputPlaceholder, refocusScannerInput } = useWmsScanner();

  const [session, setSession] = useState(() => loadWmsPackingSession());
  const [modes, setModes] = useState<{ no_cart: number; bulk: number; baskets: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const loadModes = useCallback(async () => {
    const s = loadWmsPackingSession();
    setSession(s);
    if (!s || warehouseId == null) {
      setModes(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const d = await getWmsPackingModes(DAMAGE_TENANT_ID, warehouseId, s.statusId);
      setModes(d);
    } catch {
      setErr("Nie udało się wczytać trybów pakowania.");
      setModes(null);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    const s = loadWmsPackingSession();
    if (!s) {
      navigate(WMS_ROUTES.packing, { replace: true });
      return;
    }
    void loadModes();
  }, [navigate, loadModes]);

  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Pakowanie — tryb" });
    return () => setActiveDocument(null);
  }, [setActiveDocument]);

  useEffect(() => {
    setScannerInputPlaceholder("Wybierz opcję pakowania");
    refocusScannerInput();
  }, [setScannerInputPlaceholder, refocusScannerInput]);

  if (!session) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 bg-white px-6 text-center text-sm font-medium text-slate-500">
        Przekierowanie…
      </div>
    );
  }

  if (warehouseId == null) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center bg-white px-6 py-12">
        <p className="max-w-md rounded-2xl border border-amber-200/90 bg-amber-50 px-5 py-4 text-center text-sm font-medium text-amber-950 shadow-sm">
          Wybierz magazyn w pasku u góry.
        </p>
      </div>
    );
  }

  const total = modes ? modes.no_cart + modes.bulk + modes.baskets : 0;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        {err ? (
          <p className="rounded-2xl border border-red-200/90 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 shadow-sm">
            {err}
          </p>
        ) : null}

        {loading ? (
          <p className="py-12 text-center text-base font-medium text-slate-500">Ładowanie…</p>
        ) : modes && total === 0 ? (
          <p className="mt-4 rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm leading-relaxed text-slate-600 shadow-sm">
            Brak zamówień do pakowania w tym statusie (wg podziału na wózki).
          </p>
        ) : modes ? (
          <PackingModeSelectionView
            statusName={session.statusName}
            statusColor={session.statusColor}
            mainGroup={session.mainGroup}
            modes={modes}
            warehouseId={warehouseId}
          />
        ) : null}
      </div>
    </div>
  );
}
