import { useCallback, useState } from "react";
import toast from "react-hot-toast";

import { useAuth } from "../../context/AuthContext";
import { packingSessionWorkstationId } from "../../pages/wms/wmsPackingSession";
import type { WorkstationListItem } from "../../types/wmsWorkstations";
import {
  cloudPrintUnavailableMessage,
  getCloudPrintCapability,
  type CloudPrintCapability,
} from "./hasDefaultCloudPrinter";
import type { PrintMethod, PrintMethodHandlers, PrintMethodKind } from "./printMethodTypes";
import { resolvePrintWorkstation } from "./resolvePrintWorkstation";

type Options = {
  tenantId: number;
  warehouseId?: number | null;
  printerKind?: PrintMethodKind;
  /**
   * When true (default), documents support Agent print → station pick / auto Agent.
   * When false, skip Agent and open browser/PDF alternatives only.
   */
  agentSupported?: boolean;
};

/**
 * Print entrypoint:
 * - Packing session workstation → Agent auto (or alternatives if offline/unmapped)
 * - Otherwise → available-for-me → 1 station auto / N station picker → Agent
 * - Browser/PDF only via "Inna metoda" or when Agent path unavailable
 */
export function usePrintMethodFlow({
  tenantId,
  warehouseId,
  printerKind = "a4",
  agentSupported = true,
}: Options) {
  const { user } = useAuth();
  const [methodOpen, setMethodOpen] = useState(false);
  const [stationPickerOpen, setStationPickerOpen] = useState(false);
  const [stations, setStations] = useState<WorkstationListItem[]>([]);
  const [pending, setPending] = useState(false);
  const [handlers, setHandlers] = useState<PrintMethodHandlers | null>(null);
  const [cloudCapability, setCloudCapability] = useState<CloudPrintCapability | null>(null);
  const [activeWorkstationId, setActiveWorkstationId] = useState<number | null>(null);
  /** Method dialog shows Agent tile only when a workstation is already chosen and ready-check failed. */
  const [alternativesOnly, setAlternativesOnly] = useState(false);

  const lastUsedStationId = user?.wms_profile?.packing_station_id ?? null;

  const closeAll = useCallback(() => {
    if (pending) return;
    setMethodOpen(false);
    setStationPickerOpen(false);
    setHandlers(null);
    setStations([]);
    setAlternativesOnly(false);
  }, [pending]);

  const openAlternatives = useCallback((cap: CloudPrintCapability | null, onlyAlts: boolean) => {
    setCloudCapability(cap);
    setAlternativesOnly(onlyAlts);
    setStationPickerOpen(false);
    setMethodOpen(true);
  }, []);

  const runAgent = useCallback(
    async (workstationId: number, h: PrintMethodHandlers) => {
      setActiveWorkstationId(workstationId);
      const capability = await getCloudPrintCapability(
        tenantId,
        warehouseId,
        printerKind,
        workstationId,
      );
      setCloudCapability(capability);
      if (!capability.ready) {
        openAlternatives(capability, true);
        return false;
      }
      await (h.onAgentPrint ?? h.onCloudPrint)(workstationId);
      setMethodOpen(false);
      setStationPickerOpen(false);
      setHandlers(null);
      return true;
    },
    [openAlternatives, printerKind, tenantId, warehouseId],
  );

  const runMethod = useCallback(
    async (method: PrintMethod, h: PrintMethodHandlers) => {
      const normalized = method === "cloud" ? "agent" : method;
      if (normalized === "agent") {
        const ws =
          activeWorkstationId ??
          packingSessionWorkstationId() ??
          (stations.length === 1 ? stations[0].id : null);
        if (ws == null) {
          toast.error("Wybierz stanowisko, aby drukować przez Sasist Agent.");
          return;
        }
        if (cloudCapability && !cloudCapability.ready) {
          toast.error(cloudPrintUnavailableMessage(cloudCapability));
          return;
        }
        setPending(true);
        try {
          await runAgent(ws, h);
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Nie udało się wykonać wydruku.");
        } finally {
          setPending(false);
        }
        return;
      }
      setPending(true);
      try {
        if (normalized === "browser") await h.onBrowserPrint();
        else if (normalized === "qz") {
          if (import.meta.env.DEV && h.onQzPrint) await h.onQzPrint();
          else await h.onBrowserPrint();
        } else await h.onDownloadPdf();
        setMethodOpen(false);
        setStationPickerOpen(false);
        setHandlers(null);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Nie udało się wykonać wydruku.");
      } finally {
        setPending(false);
      }
    },
    [activeWorkstationId, cloudCapability, runAgent, stations],
  );

  const requestPrint = useCallback(
    async (next: PrintMethodHandlers) => {
      if (pending) return;
      setPending(true);
      setHandlers(next);
      try {
        if (!agentSupported) {
          openAlternatives(null, true);
          return;
        }

        const resolution = await resolvePrintWorkstation(tenantId, warehouseId);
        setStations(resolution.stations);

        if (resolution.kind === "session" || resolution.kind === "auto") {
          await runAgent(resolution.workstationId, next);
          return;
        }

        if (resolution.kind === "none") {
          openAlternatives(
            {
              kind: printerKind,
              ready: false,
              reason: "NO_WORKSTATION",
              printer_id: null,
              has_online_agent: false,
              workstation_id: null,
              message:
                "Brak przypisanego stanowiska. Poproś administratora o dostęp do stanowiska WMS.",
            },
            true,
          );
          return;
        }

        // Prefer online last-used for preselect; picker is shown for N stations.
        setActiveWorkstationId(null);
        setStationPickerOpen(true);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Nie udało się rozpocząć wydruku.");
        setHandlers(null);
      } finally {
        setPending(false);
      }
    },
    [agentSupported, openAlternatives, pending, printerKind, runAgent, tenantId, warehouseId],
  );

  const confirmStation = useCallback(
    async (workstationId: number) => {
      if (!handlers) return;
      setPending(true);
      try {
        await runAgent(workstationId, handlers);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Nie udało się wykonać wydruku.");
      } finally {
        setPending(false);
      }
    },
    [handlers, runAgent],
  );

  const confirmMethod = useCallback(
    async (method: PrintMethod) => {
      if (!handlers) return;
      await runMethod(method, handlers);
    },
    [handlers, runMethod],
  );

  const openAlternativeFromPicker = useCallback(() => {
    setAlternativesOnly(true);
    setStationPickerOpen(false);
    setMethodOpen(true);
  }, []);

  return {
    /** @deprecated use methodOpen — kept for callers of PrintMethodDialog */
    open: methodOpen,
    methodOpen,
    stationPickerOpen,
    stations,
    pending,
    cloudCapability,
    preferSasistAgent: true as boolean | null,
    alternativesOnly,
    lastUsedStationId,
    activeWorkstationId,
    requestPrint,
    confirmMethod,
    confirmStation,
    openAlternativeFromPicker,
    close: closeAll,
  };
}
