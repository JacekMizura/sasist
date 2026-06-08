import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ScanLine } from "lucide-react";

import { fetchWmsInventoryTask, openWmsInventorySession, resolveWmsInventoryLocationScan } from "../../../api/inventoryCountApi";
import { wmsInventoryCountPaths } from "../../../modules/inventoryCount/inventoryCountPaths";
import {
  loadRecentLocations,
  pushRecentLocation,
  type RecentLocationEntry,
} from "../../../modules/inventoryCount/recentLocationsStorage";
import { useInventoryScanInput } from "../../../modules/inventoryCount/hooks/useInventoryScanInput";
import { WMS_INV } from "../../../modules/inventoryCount/wmsIndustrialTheme";
import { useWarehouse } from "../../../context/WarehouseContext";
import { useScanFeedback } from "../../../components/wms/execution/useScanFeedback";

const TENANT_ID = 1;

export default function WmsInventoryCountEntryPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const scanFeedback = useScanFeedback();
  const warehouseId = warehouse?.id;
  const tenantId = TENANT_ID;
  const inputRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<RecentLocationEntry[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRecent(loadRecentLocations());
    inputRef.current?.focus();
  }, []);

  const openLocation = useCallback(
    async (code: string, knownTaskId?: number) => {
      if (!warehouseId || busy) return;
      const trimmed = code.trim();
      if (!trimmed) return;

      setBusy(true);
      try {
        let taskId = knownTaskId;
        let documentId: number | undefined;
        if (!taskId) {
          const resolved = await resolveWmsInventoryLocationScan(tenantId, warehouseId, trimmed);
          if (!resolved.found || !resolved.task_id) {
            scanFeedback.error(
              resolved.reason === "location_not_found"
                ? "Nieznana lokalizacja"
                : resolved.reason === "no_open_task"
                  ? "Brak zadania dla lokalizacji"
                  : "Nie rozpoznano lokalizacji",
            );
            return;
          }
          taskId = resolved.task_id;
          documentId = resolved.inventory_document_id;
        } else {
          const t = await fetchWmsInventoryTask(tenantId, taskId);
          documentId = t.inventory_document_id;
        }

        if (!documentId) {
          scanFeedback.error("Brak dokumentu inwentaryzacji");
          return;
        }

        const session = await openWmsInventorySession(tenantId, warehouseId, {
          document_id: documentId,
          task_id: taskId,
        });
        const label = trimmed.toUpperCase();
        pushRecentLocation({ code: label, taskId });
        setRecent(loadRecentLocations());
        navigate(wmsInventoryCountPaths.count(taskId), {
          state: { sessionId: session.id, locationConfirmed: true },
        });
        scanFeedback.success(undefined);
      } catch {
        scanFeedback.error("Błąd otwarcia lokalizacji");
      } finally {
        setBusy(false);
      }
    },
    [busy, navigate, scanFeedback, tenantId, warehouseId],
  );

  const { query, onChange, submitScanOnce } = useInventoryScanInput({
    searchEnabled: false,
    onScan: openLocation,
  });

  if (!warehouseId) {
    return <p className={`py-8 text-center ${WMS_INV.textMuted}`}>Wybierz magazyn.</p>;
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col justify-center px-3">
      <h1 className="text-center text-xl font-black uppercase tracking-wide text-[#1a2b3c]">Inwentaryzacja</h1>

      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submitScanOnce(query);
        }}
      >
        <div className="relative">
          <ScanLine className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a9bb0]" />
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            inputMode="search"
            value={query}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Zeskanuj lokalizację"
            disabled={busy}
            className={`${WMS_INV.inputTerminal} pl-9`}
            aria-label="Zeskanuj lokalizację"
          />
        </div>
      </form>

      {recent.length > 0 ? (
        <section className="mt-5">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8a9bb0]">
            Ostatnie lokalizacje
          </p>
          <ul className="space-y-0.5">
            {recent.map((item) => (
              <li key={`${item.taskId}-${item.at}`}>
                <button
                  type="button"
                  disabled={busy}
                  className="w-full py-1.5 text-left text-lg font-bold text-[#1e4d8c] active:text-[#163a6b]"
                  onClick={() => void openLocation(item.code, item.taskId)}
                >
                  {item.code}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Link to="/wms/menu" className={`mt-6 text-center text-xs font-semibold ${WMS_INV.textMuted}`}>
        ← Menu WMS
      </Link>
    </div>
  );
}
