import { useCallback, useState } from "react";
import toast from "react-hot-toast";

import { useAuth } from "../../context/AuthContext";
import {
  cloudPrintUnavailableMessage,
  getCloudPrintCapability,
  type CloudPrintCapability,
} from "./hasDefaultCloudPrinter";
import type { PrintMethod, PrintMethodHandlers, PrintMethodKind } from "./printMethodTypes";

type Options = {
  tenantId: number;
  warehouseId?: number | null;
  /** Explicit WMS Stanowisko; overrides session packing_station_id when set. */
  workstationId?: number | null;
  printerKind?: PrintMethodKind;
};

function resolveWorkstationId(
  explicit: number | null | undefined,
  fromSession: number | null | undefined,
): number | null {
  for (const value of [explicit, fromSession]) {
    if (value != null && Number.isFinite(Number(value)) && Number(value) >= 1) {
      return Math.floor(Number(value));
    }
  }
  return null;
}

/**
 * Shared print entrypoint: skip dialog only when Sasist Agent is ready
 * for the assigned workstation (Agent online + printer mapping).
 * Otherwise open PrintMethodDialog (Agent / browser / PDF; QZ only in DEV).
 */
export function usePrintMethodFlow({
  tenantId,
  warehouseId,
  workstationId,
  printerKind = "a4",
}: Options) {
  const { user } = useAuth();
  const sessionWorkstationId = user?.wms_profile?.packing_station_id ?? null;
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
        const resolvedWorkstationId = resolveWorkstationId(workstationId, sessionWorkstationId);
        const capability = await getCloudPrintCapability(
          tenantId,
          warehouseId,
          printerKind,
          resolvedWorkstationId,
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
    [pending, printerKind, tenantId, warehouseId, workstationId, sessionWorkstationId],
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
    /** @deprecated QZ is DEV-only; always treat Agent as preferred in production. */
    preferSasistAgent: true as boolean | null,
    requestPrint,
    confirmMethod,
    close,
  };
}
