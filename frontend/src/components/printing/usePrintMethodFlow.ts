import { useCallback, useState } from "react";
import toast from "react-hot-toast";

import {
  cloudPrintUnavailableMessage,
  getCloudPrintCapability,
  type CloudPrintCapability,
} from "./hasDefaultCloudPrinter";
import type { PrintMethod, PrintMethodHandlers, PrintMethodKind } from "./printMethodTypes";

type Options = {
  tenantId: number;
  warehouseId?: number | null;
  /** Which Cloud Print default to check (documents/cards → a4). */
  printerKind?: PrintMethodKind;
};

/**
 * Shared print entrypoint: skip dialog only when Cloud Print is actually ready
 * (default printer + online agent). Otherwise open PrintMethodDialog.
 */
export function usePrintMethodFlow({ tenantId, warehouseId, printerKind = "a4" }: Options) {
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
    if (method === "cloud" && cloudCapability && !cloudCapability.ready) {
      toast.error(cloudPrintUnavailableMessage(cloudCapability));
      return;
    }
    setPending(true);
    try {
      if (method === "browser") await h.onBrowserPrint();
      else if (method === "cloud") await h.onCloudPrint();
      else await h.onDownloadPdf();
      setOpen(false);
      setHandlers(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Nie udało się wykonać wydruku.";
      toast.error(message);
    } finally {
      setPending(false);
    }
  }, [cloudCapability]);

  /**
   * Call from any "Drukuj" CTA.
   * Auto Cloud Print only when capability.ready; otherwise open the method dialog
   * (including when a default printer points at an offline agent).
   */
  const requestPrint = useCallback(
    async (next: PrintMethodHandlers) => {
      if (pending) return;
      setPending(true);
      try {
        const capability = await getCloudPrintCapability(tenantId, warehouseId, printerKind);
        setCloudCapability(capability);
        if (capability.ready) {
          await next.onCloudPrint();
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
    requestPrint,
    confirmMethod,
    close,
  };
}
