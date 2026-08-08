import type { WmsOperationalNoteBriefApi, WmsPackingOrderDetailApi, WmsPackingOrderLineApi } from "../../../api/wmsPackingApi";
import { lineQuantityRequired } from "./packingHelpers";

/** Notatki widoczne w pakowaniu wg ustawienia „Pokaż wszystkie notatki”. */
export function filterPackingOperationalNotes(
  notes: WmsOperationalNoteBriefApi[] | null | undefined,
  showAllNotes: boolean,
): WmsOperationalNoteBriefApi[] {
  const list = Array.isArray(notes) ? notes : [];
  return list.filter((n) => {
    const content = (n.content ?? "").trim();
    if (!content) return false;
    if (showAllNotes) return true;
    return Boolean(n.show_in_packing);
  });
}

export function packingNotesAlertTitle(
  visibleNotes: WmsOperationalNoteBriefApi[],
  serverTitle?: string | null,
): string {
  if (visibleNotes.length === 0) return "";
  const t = (serverTitle ?? "").trim();
  return t || "UWAGA PAKOWANIE";
}

/** Zamówienie 1 linia × 1 szt. (fast path / lista skan). */
export function isSingleUnitPackingOrder(
  detail: Pick<WmsPackingOrderDetailApi, "lines"> | { lines: WmsPackingOrderLineApi[] },
): boolean {
  if (!detail.lines.length || detail.lines.length !== 1) return false;
  return lineQuantityRequired(detail.lines[0]) === 1;
}

export function shouldOpenPackingNotesPopup(opts: {
  requireNotesPopup: boolean;
  visibleNotes: WmsOperationalNoteBriefApi[];
  alreadyAcknowledged: boolean;
}): boolean {
  return (
    opts.requireNotesPopup &&
    !opts.alreadyAcknowledged &&
    opts.visibleNotes.length > 0
  );
}

/**
 * Co zrobić po zamknięciu popupu notatek, gdy wcześniej wstrzymano auto-advance.
 * Single-unit: nigdy nie kontynuuj automatyki — operator musi ponownie zeskanować/spakować.
 */
export type NotesPopupPendingAction = "none" | "show_proceed_cta" | "advance_to_carton_or_finish";

export function decideAfterNotesPopupDismiss(opts: {
  isSingleUnit: boolean;
  pendingAction: NotesPopupPendingAction;
}): {
  showProceedCta: boolean;
  advanceToCartonOrFinish: boolean;
} {
  if (opts.isSingleUnit) {
    return { showProceedCta: false, advanceToCartonOrFinish: false };
  }
  return {
    showProceedCta: opts.pendingAction === "show_proceed_cta",
    advanceToCartonOrFinish: opts.pendingAction === "advance_to_carton_or_finish",
  };
}

/**
 * Decyzja przy fully_packed gdy wymagany jest popup notatek (jeszcze nie potwierdzony).
 */
export function decideFullyPackedNotesGate(opts: {
  requireNotesPopup: boolean;
  visibleNotesCount: number;
  alreadyAcknowledged: boolean;
  fromListBootstrap: boolean;
  isSingleUnit: boolean;
}): {
  openNotesPopup: boolean;
  pendingAction: NotesPopupPendingAction;
  /** Standardowa ścieżka bez popupu (CTA lub advance). */
  followNormalFullyPackedPath: boolean;
} {
  const needPopup =
    opts.requireNotesPopup && opts.visibleNotesCount > 0 && !opts.alreadyAcknowledged;
  if (!needPopup) {
    return {
      openNotesPopup: false,
      pendingAction: "none",
      followNormalFullyPackedPath: true,
    };
  }
  if (opts.isSingleUnit) {
    // Wstrzymaj auto-akcje; po zamknięciu popupu bez CTA/advance — wymagany kolejny skan/pack.
    return {
      openNotesPopup: true,
      pendingAction: "none",
      followNormalFullyPackedPath: false,
    };
  }
  if (opts.fromListBootstrap) {
    return {
      openNotesPopup: true,
      pendingAction: "show_proceed_cta",
      followNormalFullyPackedPath: false,
    };
  }
  return {
    openNotesPopup: true,
    pendingAction: "advance_to_carton_or_finish",
    followNormalFullyPackedPath: false,
  };
}
