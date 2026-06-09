import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  fetchInventoryDocument,
  fetchWmsInventoryTask,
  openWmsInventorySession,
  resolveWmsInventoryLocationScan,
} from "@/api/inventoryCountApi";
import WmsInventoryRecentLocationContext from "@/modules/inventoryCount/components/WmsInventoryRecentLocationContext";
import WmsInventoryScanField from "@/modules/inventoryCount/components/WmsInventoryScanField";
import { useInventoryScanInput } from "@/modules/inventoryCount/hooks/useInventoryScanInput";
import { wmsInventoryCountPaths } from "@/modules/inventoryCount/inventoryCountPaths";
import {
  loadRecentLocationSessions,
  touchRecentLocation,
  type RecentLocationSession,
} from "@/modules/inventoryCount/recentLocationsStorage";
import { setActiveInventoryDocumentId } from "@/modules/inventoryCount/wmsActiveDocumentStorage";
import { WMS_INV } from "@/modules/inventoryCount/ui/wms/theme";
import { useScanFeedback } from "@/components/wms/execution/useScanFeedback";
import { useWarehouse } from "@/context/WarehouseContext";

const TENANT_ID = 1;

export default function WmsInventoryCountEntryPage() {
  const navigate = useNavigate();
  const { documentId: documentIdParam } = useParams();
  const documentId = documentIdParam ? Number(documentIdParam) : NaN;
  const { warehouse } = useWarehouse();
  const scanFeedback = useScanFeedback();
  const warehouseId = warehouse?.id;
  const tenantId = TENANT_ID;
  const inputRef = useRef<HTMLInputElement>(null);
  const [recentTick, setRecentTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [docTitle, setDocTitle] = useState<string | null>(null);
  const [docBlocked, setDocBlocked] = useState<string | null>(null);

  const recent = useMemo(() => loadRecentLocationSessions(), [recentTick]);

  useEffect(() => {
    if (!Number.isFinite(documentId)) return;
    void fetchInventoryDocument(tenantId, documentId)
      .then((d) => {
        if (d.status !== "in_progress") {
          setDocBlocked("Ten dokument nie jest w trakcie liczenia.");
          return;
        }
        setDocTitle(d.title?.trim() || d.number);
        if (warehouseId) setActiveInventoryDocumentId(warehouseId, documentId);
      })
      .catch(() => setDocBlocked("Nie znaleziono dokumentu inwentaryzacji."));
  }, [documentId, tenantId, warehouseId]);

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
      if (!warehouseId || busy || !Number.isFinite(documentId) || docBlocked) return;
      const trimmed = code.trim();
      if (!trimmed) return;

      setBusy(true);
      try {
        let taskId = knownTaskId;
        let locationId = knownLocationId ?? 0;
        let locationCode = trimmed.toUpperCase();

        if (!taskId) {
          const resolved = await resolveWmsInventoryLocationScan(tenantId, warehouseId, trimmed, documentId);
          if (!resolved.found || !resolved.task_id) {
            scanFeedback.error(
              resolved.reason === "location_not_found"
                ? "Nieznana lokalizacja"
                : resolved.reason === "no_open_task"
                  ? "Brak zadania dla tej lokalizacji w tym dokumencie"
                  : "Nie rozpoznano lokalizacji",
            );
            return;
          }
          taskId = resolved.task_id;
          locationId = resolved.location_id ?? 0;
          locationCode = (resolved.location_code ?? trimmed).toUpperCase();
          if (resolved.inventory_document_id && resolved.inventory_document_id !== documentId) {
            scanFeedback.error("Lokalizacja należy do innego dokumentu inwentaryzacji");
            return;
          }
        } else {
          const t = await fetchWmsInventoryTask(tenantId, taskId);
          if (t.inventory_document_id !== documentId) {
            scanFeedback.error("Zadanie należy do innego dokumentu");
            return;
          }
          locationId = t.location_id;
          locationCode = (t.location_code ?? t.location_name ?? trimmed).toUpperCase();
        }

        const session = await openWmsInventorySession(tenantId, warehouseId, {
          document_id: documentId,
          task_id: taskId,
        });
        touchRecentLocation({ code: locationCode, taskId, locationId });
        setRecentTick((n) => n + 1);
        navigate(wmsInventoryCountPaths.count(documentId, taskId), {
          state: { sessionId: session.id, locationConfirmed: true },
        });
        scanFeedback.success(undefined);
      } catch {
        scanFeedback.error("Błąd otwarcia lokalizacji");
      } finally {
        setBusy(false);
      }
    },
    [busy, docBlocked, documentId, navigate, scanFeedback, tenantId, warehouseId],
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
    return (
      <div className={WMS_INV.shellWide}>
        <p className={`py-4 text-sm font-bold ${WMS_INV.textMuted}`}>Wybierz magazyn.</p>
      </div>
    );
  }

  if (!Number.isFinite(documentId)) {
    return (
      <div className={WMS_INV.shellWide}>
        <p className="text-sm text-rose-700">
          Brak dokumentu.{" "}
          <Link to={wmsInventoryCountPaths.root} className="underline">
            Wróć do listy
          </Link>
        </p>
      </div>
    );
  }

  if (docBlocked) {
    return (
      <div className={WMS_INV.shellWide}>
        <p className="text-sm text-rose-700">{docBlocked}</p>
        <Link to={wmsInventoryCountPaths.root} className="mt-2 inline-block text-xs font-bold underline">
          Wróć do listy inwentaryzacji
        </Link>
      </div>
    );
  }

  return (
    <div className={`${WMS_INV.shell} mt-12 flex flex-col items-center`}>
      {docTitle ? <p className="mb-2 w-full text-sm font-semibold text-slate-600">{docTitle}</p> : null}

      <div className="relative mb-16 w-full max-w-2xl">
        <WmsInventoryScanField
          inputRef={inputRef}
          value={query}
          onChange={onChange}
          onSubmit={() => void submitScanOnce(query)}
          placeholder="Zeskanuj lokalizację..."
          disabled={busy}
          size="hero"
        />
      </div>

      <div className="w-full">
        <WmsInventoryRecentLocationContext items={recent} disabled={busy} onSelect={openRecent} />
      </div>
    </div>
  );
}
