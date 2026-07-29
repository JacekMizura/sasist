import { useCallback, useState } from "react";
import toast from "react-hot-toast";

import {
  packingSessionWorkstationId,
  PACKING_STATION_REQUIRED_MSG,
} from "../../pages/wms/wmsPackingSession";
import {
  cloudPrintUnavailableMessage,
  getCloudPrintCapability,
  type CloudPrintCapability,
} from "./hasDefaultCloudPrinter";
import type { PrintMethod, PrintMethodHandlers, PrintMethodKind } from "./printMethodTypes";

type Options = {
  tenantId: number;
  warehouseId?: number | null;
  printerKind?: PrintMethodKind;
};

/**
 * Shared print entrypoint. Agent readiness uses ONLY packing-session workstationId.
 * No auth/me, packing_station_id, PrintingDefaults, or prop overrides.
 */
export function usePrintMethodFlow({
  tenantId,
  warehouseId,
  printerKind = "a4",
}: Options) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [handlers, setHandlers] = useState<PrintMethodHandlers | null>(null);
  const [cloudCapability, setCloudCapability] = useState<CloudPrintCapability | null>(null);

  const close = useCallback(() => {
    if (pending) return;
    setOpen(false);
    setHandlers(null);
  }, [pending]);

  const runMethod = useCallback(async (method: PrintMethod, h: PrintMethodHandlers) => {
    const normalized = method === "cloud" ? "agent" : method;
    if (normalized === "agent" && cloudCapability && !cloudCapability.ready) {
      toast.error(cloudPrintUnavailableMessage(cloudCapability));
      return;
    }
    setPending(true);
    try {
      if (normalized === "browser") await h.onBrowserPrint();
      else if (normalized === "agent") await (h.onAgentPrint ?? h.onCloudPrint)();
      else if (normalized === "qz") {
        if (import.meta.env.DEV && h.onQzPrint) await h.onQzPrint();
        else await h.onBrowserPrint();
      } else await h.onDownloadPdf();
      setOpen(false);
      setHandlers(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Nie udało się wykonać wydruku.";
      toast.error(message);
    } finally {
      setPending(false);
    }
  }, [cloudCapability]);

  const requestPrint = useCallback(
    async (next: PrintMethodHandlers) => {
      if (pending) return;
      setPending(true);
      try {
        const workstationId = packingSessionWorkstationId();
        if (workstationId == null) {
          const capability: CloudPrintCapability = {
            kind: printerKind,
            ready: false,
            reason: "NO_WORKSTATION",
            printer_id: null,
            has_online_agent: false,
            workstation_id: null,
            message: PACKING_STATION_REQUIRED_MSG,
          };
          setCloudCapability(capability);
          setHandlers(next);
          setOpen(true);
          return;
        }
        const capability = await getCloudPrintCapability(
          tenantId,
          warehouseId,
          printerKind,
          workstationId,
        );
        setCloudCapability(capability);
        if (capability.ready) {
          await (next.onAgentPrint ?? next.onCloudPrint)();
          return;
        }
        setHandlers(next);
        setOpen(true);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Nie udało się rozpocząć wydruku.";
        toast.error(message);
      } finally {
        setPending(false);
      }
    },
    [pending, printerKind, tenantId, warehouseId],
  );

  const confirmMethod = useCallback(
    async (method: PrintMethod) => {
      if (!handlers) return;
      await runMethod(method, handlers);
    },
    [handlers, runMethod],
  );

  return {
    open,
    pending,
    cloudCapability,
    preferSasistAgent: true as boolean | null,
    requestPrint,
    confirmMethod,
    close,
  };
}
