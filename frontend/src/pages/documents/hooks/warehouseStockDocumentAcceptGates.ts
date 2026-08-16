import type { StockDocumentRead } from "../../../api/stockDocumentsApi";

const TERMINAL_STATUS_TOKENS = new Set([
  "zakonczone",
  "posted",
  "completed",
  "closed",
  "cancelled",
  "canceled",
  "anulowane",
  "anulowany",
]);

/** Central SSOT: terminal warehouse document status → OMS read-only. */
export function isTerminalStockDocumentStatus(status: string | null | undefined): boolean {
  const st = String(status || "")
    .trim()
    .toLowerCase();
  return TERMINAL_STATUS_TOKENS.has(st);
}

/** @deprecated Prefer isTerminalStockDocumentStatus */
export function isTerminalWarehouseDocStatus(status: string | null | undefined): boolean {
  return isTerminalStockDocumentStatus(status);
}

/** WMS completed without OMS office post (`posted`). */
export function isWmsCompletedPzStatus(status: string | null | undefined): boolean {
  return (
    String(status || "")
      .trim()
      .toLowerCase() === "zakonczone"
  );
}

export function canShowPzMutationActions(opts: {
  status: string | null | undefined;
  isPzDetail: boolean;
}): boolean {
  if (isTerminalStockDocumentStatus(opts.status)) return false;
  const st = String(opts.status || "")
    .trim()
    .toLowerCase();
  return st === "draft" && opts.isPzDetail;
}

export function canPostAcceptPz(opts: {
  status: string | null | undefined;
  warehouseId: number | null | undefined;
}): boolean {
  if (isTerminalStockDocumentStatus(opts.status)) return false;
  const st = String(opts.status || "")
    .trim()
    .toLowerCase();
  return st === "draft" && opts.warehouseId != null && opts.warehouseId > 0;
}

/** Only full line-edit mode may PATCH items before accept. */
export function shouldPatchLinesBeforeAccept(editMode: string | null | undefined): boolean {
  return (editMode ?? "none") === "full";
}

/**
 * Pre-request gate for OMS accept.
 * Terminal statuses never PATCH / accept / post.
 */
export function resolveAcceptActionGate(
  detail: Pick<StockDocumentRead, "status" | "edit_mode" | "warehouse_id">,
): {
  ok: boolean;
  patchLines: boolean;
  message?: string;
} {
  const st = String(detail.status || "")
    .trim()
    .toLowerCase();
  const editMode = detail.edit_mode ?? "none";

  if (isTerminalStockDocumentStatus(st)) {
    if (st === "zakonczone") {
      return {
        ok: false,
        patchLines: false,
        message: "Dokument został zakończony w WMS — nie wymaga ponownego księgowania w OMS.",
      };
    }
    if (st === "anulowane" || st === "anulowany" || st === "cancelled" || st === "canceled") {
      return {
        ok: false,
        patchLines: false,
        message: "Dokument jest anulowany — tylko do odczytu.",
      };
    }
    return {
      ok: false,
      patchLines: false,
      message: "Dokument jest już zaksięgowany i tylko do odczytu.",
    };
  }
  if (st !== "draft") {
    return {
      ok: false,
      patchLines: false,
      message: "Tylko dokumenty w statusie roboczym można zatwierdzić.",
    };
  }
  if (detail.warehouse_id == null || detail.warehouse_id <= 0) {
    return {
      ok: false,
      patchLines: false,
      message:
        "Ustaw magazyn przyjęcia (np. w WMS → Przyjęcie lub domyślny magazyn organizacji), potem zatwierdź PZ tutaj.",
    };
  }
  if (editMode === "full") {
    return { ok: true, patchLines: true };
  }
  if (editMode === "metadata") {
    return { ok: true, patchLines: false };
  }
  return {
    ok: false,
    patchLines: false,
    message: "Dokument nie jest edytowalny — nie można zatwierdzić przyjęcia.",
  };
}

export function canDeleteWarehouseDocument(status: string | null | undefined): boolean {
  if (isTerminalStockDocumentStatus(status)) return false;
  return (
    String(status || "")
      .trim()
      .toLowerCase() === "draft"
  );
}

export function canScrollEditPencil(opts: {
  status: string | null | undefined;
  lineEditEnabled: boolean;
}): boolean {
  if (isTerminalStockDocumentStatus(opts.status)) return false;
  return opts.lineEditEnabled;
}
