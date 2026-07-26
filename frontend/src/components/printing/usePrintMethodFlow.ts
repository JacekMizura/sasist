import { useCallback, useState } from "react";
import toast from "react-hot-toast";

import { hasDefaultCloudPrinter } from "./hasDefaultCloudPrinter";
import type { PrintMethod, PrintMethodHandlers, PrintMethodKind } from "./printMethodTypes";

type Options = {
  tenantId: number;
  warehouseId?: number | null;
  /** Which Cloud Print default to check (documents/cards → a4). */
  printerKind?: PrintMethodKind;
};

/**
 * Shared print entrypoint: skip dialog when a default Cloud printer exists,
 * otherwise open PrintMethodDialog.
 */
export function usePrintMethodFlow({ tenantId, warehouseId, printerKind = "a4" }: Options) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [handlers, setHandlers] = useState<PrintMethodHandlers | null>(null);

  const close = useCallback(() => {
    if (pending) return;
    setOpen(false);
    setHandlers(null);
  }, [pending]);

  const runMethod = useCallback(async (method: PrintMethod, h: PrintMethodHandlers) => {
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
  }, []);

  /**
   * Call from any "Drukuj" CTA. If a default Cloud printer is configured,
   * runs Cloud Print immediately; otherwise opens the method dialog.
   */
  const requestPrint = useCallback(
    async (next: PrintMethodHandlers) => {
      if (pending) return;
      setPending(true);
      try {
        const hasDefault = await hasDefaultCloudPrinter(tenantId, warehouseId, printerKind);
        if (hasDefault) {
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
    requestPrint,
    confirmMethod,
    close,
  };
}
