import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchWmsInventoryTask, openWmsInventorySession, resolveWmsInventoryLocationScan } from "@/api/inventoryCountApi";
import WmsInventoryRecentLocationContext from "@/modules/inventoryCount/components/WmsInventoryRecentLocationContext";
import WmsInventoryScanField from "@/modules/inventoryCount/components/WmsInventoryScanField";
import { useInventoryScanInput } from "@/modules/inventoryCount/hooks/useInventoryScanInput";
import { wmsInventoryCountPaths } from "@/modules/inventoryCount/inventoryCountPaths";
import {
  loadRecentLocationSessions,
  touchRecentLocation,
  type RecentLocationSession,
} from "@/modules/inventoryCount/recentLocationsStorage";
import { WMS_INV } from "@/modules/inventoryCount/wmsIndustrialTheme";
import { useScanFeedback } from "@/components/wms/execution/useScanFeedback";
import { useWarehouse } from "@/context/WarehouseContext";

const TENANT_ID = 1;

export default function WmsInventoryCountEntryPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const scanFeedback = useScanFeedback();
  const warehouseId = warehouse?.id;
  const tenantId = TENANT_ID;
  const inputRef = useRef<HTMLInputElement>(null);
  const [recentTick, setRecentTick] = useState(0);
  const [busy, setBusy] = useState(false);

  const recent = useMemo(() => loadRecentLocationSessions(), [recentTick]);

  const focusScan = useCallback(() => {
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    focusScan();
  }, [focusScan]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setRecentTick((n) => n + 1);
        focusScan();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [focusScan]);

  const openLocation = useCallback(
    async (code: string, knownTaskId?: number, knownLocationId?: number) => {
      if (!warehouseId || busy) return;
      const trimmed = code.trim();
      if (!trimmed) return;

      setBusy(true);
      try {
        let taskId = knownTaskId;
        let documentId: number | undefined;
        let locationId = knownLocationId ?? 0;
        let locationCode = trimmed.toUpperCase();

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
          locationId = resolved.location_id ?? 0;
          locationCode = (resolved.location_code ?? trimmed).toUpperCase();
        } else {
          const t = await fetchWmsInventoryTask(tenantId, taskId);
          documentId = t.inventory_document_id;
          locationId = t.location_id;
          locationCode = (t.location_code ?? t.location_name ?? trimmed).toUpperCase();
        }

        if (!documentId) {
          scanFeedback.error("Brak dokumentu inwentaryzacji");
          return;
        }

        const session = await openWmsInventorySession(tenantId, warehouseId, {
          document_id: documentId,
          task_id: taskId,
        });
        touchRecentLocation({ code: locationCode, taskId, locationId });
        setRecentTick((n) => n + 1);
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

  const openRecent = useCallback(
    (item: RecentLocationSession) => {
      void openLocation(item.code, item.taskId, item.locationId || undefined);
    },
    [openLocation],
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

      <WmsInventoryRecentLocationContext items={recent} disabled={busy} onSelect={openRecent} />
    </div>
  );
}
