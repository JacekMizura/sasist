/**
 * Pakowanie — notatki: filtr widoczności + bramka popupu (regresja ustawień).
 */
import { describe, expect, it } from "vitest";
import type { WmsOperationalNoteBriefApi, WmsPackingOrderLineApi } from "../../../api/wmsPackingApi";
import {
  decideAfterNotesPopupDismiss,
  decideFullyPackedNotesGate,
  filterPackingOperationalNotes,
  isSingleUnitPackingOrder,
  shouldOpenPackingNotesPopup,
} from "./packingNotes";

function note(
  partial: Partial<WmsOperationalNoteBriefApi> & Pick<WmsOperationalNoteBriefApi, "id" | "content">,
): WmsOperationalNoteBriefApi {
  return {
    show_in_packing: false,
    show_in_picking: false,
    ...partial,
  };
}

function lines(rows: Array<{ qty: number; packed?: number }>): WmsPackingOrderLineApi[] {
  return rows.map((r, i) => ({
    order_item_id: i + 1,
    product_id: 10 + i,
    quantity: r.qty,
    quantity_required: r.qty,
    quantity_packed: r.packed ?? 0,
    product_name: `P${i}`,
    ean: `EAN${i}`,
  }));
}

describe("filterPackingOperationalNotes / showAllNotes", () => {
  const packingNote = note({ id: 1, content: "Widoczna w pakowaniu", show_in_packing: true });
  const otherNote = note({ id: 2, content: "Tylko picking", show_in_picking: true, show_in_packing: false });

  it("OFF → tylko notatki z widocznością WMS – pakowanie", () => {
    expect(filterPackingOperationalNotes([packingNote, otherNote], false)).toEqual([packingNote]);
  });

  it("ON → wszystkie notatki zamówienia z treścią", () => {
    expect(filterPackingOperationalNotes([packingNote, otherNote], true)).toEqual([packingNote, otherNote]);
  });

  it("pomija puste treści", () => {
    expect(filterPackingOperationalNotes([note({ id: 3, content: "  ", show_in_packing: true })], true)).toEqual([]);
  });
});

describe("shouldOpenPackingNotesPopup", () => {
  const n = [note({ id: 1, content: "X", show_in_packing: true })];

  it("A: Popup OFF → nie otwieraj", () => {
    expect(
      shouldOpenPackingNotesPopup({
        requireNotesPopup: false,
        visibleNotes: n,
        alreadyAcknowledged: false,
      }),
    ).toBe(false);
  });

  it("B: Popup ON + brak notatek → nie otwieraj", () => {
    expect(
      shouldOpenPackingNotesPopup({
        requireNotesPopup: true,
        visibleNotes: [],
        alreadyAcknowledged: false,
      }),
    ).toBe(false);
  });

  it("C: Popup ON + notatka WMS – pakowanie → otwórz", () => {
    expect(
      shouldOpenPackingNotesPopup({
        requireNotesPopup: true,
        visibleNotes: n,
        alreadyAcknowledged: false,
      }),
    ).toBe(true);
  });
});

describe("Popup ON + notatka bez WMS – pakowanie (D)", () => {
  const hiddenFromPacking = note({ id: 9, content: "Ukryta", show_in_packing: false });

  it("showAllNotes OFF → brak widocznych → brak popupu", () => {
    const visible = filterPackingOperationalNotes([hiddenFromPacking], false);
    expect(visible).toEqual([]);
    expect(
      shouldOpenPackingNotesPopup({
        requireNotesPopup: true,
        visibleNotes: visible,
        alreadyAcknowledged: false,
      }),
    ).toBe(false);
  });

  it("showAllNotes ON → widoczna → popup", () => {
    const visible = filterPackingOperationalNotes([hiddenFromPacking], true);
    expect(visible).toEqual([hiddenFromPacking]);
    expect(
      shouldOpenPackingNotesPopup({
        requireNotesPopup: true,
        visibleNotes: visible,
        alreadyAcknowledged: false,
      }),
    ).toBe(true);
  });
});

describe("decideFullyPackedNotesGate — blokada flow (E/F/G/H)", () => {
  it("E: popup blokuje dalszy flow (nie followNormal)", () => {
    const g = decideFullyPackedNotesGate({
      requireNotesPopup: true,
      visibleNotesCount: 1,
      alreadyAcknowledged: false,
      fromListBootstrap: false,
      isSingleUnit: false,
    });
    expect(g.openNotesPopup).toBe(true);
    expect(g.followNormalFullyPackedPath).toBe(false);
    expect(g.pendingAction).toBe("advance_to_carton_or_finish");
  });

  it("F: zamknięcie nie uruchamia automatyki drugi raz — pending single = none", () => {
    const g = decideFullyPackedNotesGate({
      requireNotesPopup: true,
      visibleNotesCount: 1,
      alreadyAcknowledged: false,
      fromListBootstrap: true,
      isSingleUnit: true,
    });
    expect(g.openNotesPopup).toBe(true);
    expect(g.pendingAction).toBe("none");
    const after = decideAfterNotesPopupDismiss({
      isSingleUnit: true,
      pendingAction: g.pendingAction,
    });
    expect(after.advanceToCartonOrFinish).toBe(false);
    expect(after.showProceedCta).toBe(false);
  });

  it("G: 1 szt. z notatką — popup, bez auto-advance po dismiss", () => {
    expect(isSingleUnitPackingOrder({ lines: lines([{ qty: 1, packed: 1 }]) })).toBe(true);
    const g = decideFullyPackedNotesGate({
      requireNotesPopup: true,
      visibleNotesCount: 1,
      alreadyAcknowledged: false,
      fromListBootstrap: true,
      isSingleUnit: true,
    });
    expect(g.openNotesPopup).toBe(true);
    expect(g.followNormalFullyPackedPath).toBe(false);
    const after = decideAfterNotesPopupDismiss({ isSingleUnit: true, pendingAction: g.pendingAction });
    expect(after.advanceToCartonOrFinish).toBe(false);
    expect(after.showProceedCta).toBe(false);
  });

  it("H: wieloelementowe — po dismiss można kontynuować (CTA lub advance)", () => {
    expect(isSingleUnitPackingOrder({ lines: lines([{ qty: 1 }, { qty: 2 }]) })).toBe(false);
    const fromList = decideFullyPackedNotesGate({
      requireNotesPopup: true,
      visibleNotesCount: 1,
      alreadyAcknowledged: false,
      fromListBootstrap: true,
      isSingleUnit: false,
    });
    expect(fromList.pendingAction).toBe("show_proceed_cta");
    expect(
      decideAfterNotesPopupDismiss({ isSingleUnit: false, pendingAction: fromList.pendingAction }).showProceedCta,
    ).toBe(true);

    const inOrder = decideFullyPackedNotesGate({
      requireNotesPopup: true,
      visibleNotesCount: 1,
      alreadyAcknowledged: false,
      fromListBootstrap: false,
      isSingleUnit: false,
    });
    expect(inOrder.pendingAction).toBe("advance_to_carton_or_finish");
    expect(
      decideAfterNotesPopupDismiss({ isSingleUnit: false, pendingAction: inOrder.pendingAction })
        .advanceToCartonOrFinish,
    ).toBe(true);
  });

  it("już potwierdzone → normalna ścieżka (bez drugiego popupu / automatyki z dismiss)", () => {
    const g = decideFullyPackedNotesGate({
      requireNotesPopup: true,
      visibleNotesCount: 1,
      alreadyAcknowledged: true,
      fromListBootstrap: false,
      isSingleUnit: true,
    });
    expect(g.openNotesPopup).toBe(false);
    expect(g.followNormalFullyPackedPath).toBe(true);
  });
});
