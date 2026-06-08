import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { fetchWmsInventoryTask, openWmsInventorySession, resolveWmsInventoryLocationScan } from "../../../api/inventoryCountApi";
import WmsInventoryScanField from "../../../modules/inventoryCount/components/WmsInventoryScanField";
import { useInventoryScanInput } from "../../../modules/inventoryCount/hooks/useInventoryScanInput";
import { wmsInventoryCountPaths } from "../../../modules/inventoryCount/inventoryCountPaths";
import {
  loadRecentLocations,
  pushRecentLocation,
  type RecentLocationEntry,
} from "../../../modules/inventoryCount/recentLocationsStorage";
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
    return <p className={`py-4 text-sm font-bold ${WMS_INV.textMuted}`}>Wybierz magazyn.</p>;
  }

  return (
    <div className={WMS_INV.shell}>
      <h1 className={WMS_INV.textLabel}>Inwentaryzacja</h1>

      <WmsInventoryScanField
        inputRef={inputRef}
        value={query}
        onChange={onChange}
        onSubmit={() => void submitScanOnce(query)}
        placeholder="Zeskanuj lokalizację"
        disabled={busy}
      />

      {recent.length > 0 ? (
        <section>
          <p className={`${WMS_INV.textLabel} mb-0.5`}>Ostatnie lokalizacje</p>
          <ul>
            {recent.map((item) => (
              <li key={`${item.taskId}-${item.at}`}>
                <button
                  type="button"
                  disabled={busy}
                  className="py-1 text-left text-base font-black text-[#1e4d8c] active:text-[#163a6b] disabled:opacity-40"
                  onClick={() => void openLocation(item.code, item.taskId)}
                >
                  {item.code}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Link to="/wms/menu" className={`inline-block text-[10px] font-bold uppercase tracking-wide ${WMS_INV.textMuted}`}>
        ← Menu WMS
      </Link>
    </div>
  );
}
