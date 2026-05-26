/**
 * Jedna deterministyczna kolejność stanu linii OMS/WMS (GET /orders/{id}/wms-fulfillment)
 * dla badge „Kompletacja” i podświetleń — shortage z DB musi przeważyć nad „Oczekuje” / TO_PICK.
 */

export type OmsFulfillmentLineLike = {
  quantity: number;
  quantity_packed?: number;
  picked_quantity?: number;
  missing_quantity?: number;
  oms_line_status?: string | null;
  replaced_from_order_item_id?: number | null;
  replaced_from_product_name?: string | null;
  /** Linia REPLACED: nazwa nowego produktu z backendu. */
  replacement_new_product_name?: string | null;
};

export type OmsFulfillmentBadge = { label: string; className: string };

const EPS = 1e-6;

export function fmtOmsQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(Number(n) || 0);
}

function substituteLine(line: OmsFulfillmentLineLike): boolean {
  return (
    (line.replaced_from_order_item_id != null && line.replaced_from_order_item_id > 0) ||
    String(line.replaced_from_product_name ?? "").trim().length > 0
  );
}

/** Linia nie pokazywana w tabeli „kolejki” zbierania (usunięta z zamówienia). */
export function isOmsFulfillmentLineHidden(line: OmsFulfillmentLineLike): boolean {
  const ols = (line.oms_line_status ?? "").trim().toUpperCase();
  if (ols === "REPLACED") return false;
  const qty = Number(line.quantity ?? 0);
  return qty <= EPS;
}

/**
 * Priorytet (deterministyczny):
 * 1) REPLACED → archiwum po zamianie
 * 2) missing_quantity > 0 → brak (czerwony) — **przed** TO_PICK / „oczekuje”
 * 3) TO_PICK lub linia zamiennika → zbieranie zamiennika
 * 4) picked >= quantity → zielone / fiolet pakowanie
 * 5) częściowy pick
 * 6) domyślnie oczekuje
 */
export function resolveOmsFulfillmentLineBadge(line: OmsFulfillmentLineLike): OmsFulfillmentBadge {
  const ols = (line.oms_line_status ?? "").trim().toUpperCase();
  const qty = Number(line.quantity ?? 0);
  const miss = Number(line.missing_quantity ?? 0);
  const picked = Number(line.picked_quantity ?? 0);
  const packed = Number(line.quantity_packed ?? 0);
  const sub = substituteLine(line);

  if (ols === "REPLACED") {
    const newNm = String(line.replacement_new_product_name ?? "").trim();
    return {
      label: newNm ? `Zamieniono → ${newNm}` : "Zamieniono → nowy produkt",
      className: "border-indigo-300 bg-indigo-50 text-indigo-950",
    };
  }

  if (miss > EPS) {
    const ordered = Math.max(0, Math.round(qty));
    const missDisp =
      Math.abs(miss - Math.round(miss)) < 1e-5 ? String(Math.round(miss)) : miss.toFixed(2).replace(/\.?0+$/, "");
    return {
      label: `Brak ${missDisp}/${ordered}`,
      className: "border-red-300 bg-red-50 text-red-950",
    };
  }

  const oldSub = String(line.replaced_from_product_name ?? "").trim();
  /** REPLACED_WAITING_PICK — nie pokazuj „Dodano jako zamiennik” ani zielonego Zebrano przed faktycznym pickiem. */
  if (sub && qty > EPS && picked + EPS < qty) {
    return {
      label: oldSub ? `Do zebrania (zamiennik za ${oldSub})` : "Do zebrania (zamiennik)",
      className: "border-amber-300 bg-amber-50 text-amber-950",
    };
  }

  if (ols === "TO_PICK" && picked + EPS < qty) {
    return {
      label: "Oczekuje na zbieranie",
      className: "border-amber-300 bg-amber-50 text-amber-950",
    };
  }

  if (picked + EPS >= qty && qty > EPS) {
    if (packed + EPS < qty) {
      return { label: "Gotowe do pakowania", className: "border-violet-300 bg-violet-50 text-violet-950" };
    }
    return { label: "Zebrano", className: "border-emerald-300 bg-emerald-50 text-emerald-950" };
  }

  if (picked > EPS) {
    return {
      label: `Zbieranie (${Math.floor(picked)}/${qty})`,
      className: "border-slate-300 bg-slate-50 text-slate-800",
    };
  }

  return { label: "Oczekuje na zbieranie", className: "border-slate-200 bg-white text-slate-600" };
}

/**
 * Badge tylko dla kolumny „Kompletacja” — bez marketingowej plakietki „Dodano jako zamiennik…”
 * (zamiennik jest opisany w kolumnie produktu: niebieski znacznik + „Zamiast: …”).
 */
export function resolveOmsFulfillmentCompletionBadge(line: OmsFulfillmentLineLike): OmsFulfillmentBadge {
  const ols = (line.oms_line_status ?? "").trim().toUpperCase();
  const qty = Number(line.quantity ?? 0);
  const miss = Number(line.missing_quantity ?? 0);
  const picked = Number(line.picked_quantity ?? 0);
  const packed = Number(line.quantity_packed ?? 0);
  const sub = substituteLine(line);

  if (ols === "REPLACED") {
    return { label: "Archiwum", className: "border-slate-200 bg-slate-100 text-slate-500" };
  }

  if (miss > EPS) {
    const ordered = Math.max(0, Math.round(qty));
    const missDisp =
      Math.abs(miss - Math.round(miss)) < 1e-5 ? String(Math.round(miss)) : miss.toFixed(2).replace(/\.?0+$/, "");
    return {
      label: `Brak ${missDisp}/${ordered}`,
      className: "border-red-300 bg-red-50 text-red-950",
    };
  }

  const packedFull = qty > EPS && packed + EPS >= qty;
  const pickedFull = qty > EPS && picked + EPS >= qty;

  if (sub && qty > EPS && picked + EPS < qty) {
    return { label: "Do zebrania (zamiennik)", className: "border-amber-300 bg-amber-50 text-amber-950" };
  }

  if (packedFull) {
    return { label: "Zebrano", className: "border-emerald-300 bg-emerald-50 text-emerald-950" };
  }
  if (pickedFull) {
    return { label: "Gotowe do pakowania", className: "border-violet-300 bg-violet-50 text-violet-950" };
  }
  if (picked > EPS) {
    return { label: "W zbieraniu", className: "border-sky-300 bg-sky-50 text-sky-950" };
  }

  if (ols === "TO_PICK" && sub) {
    return { label: "Do pakowania (zamiennik)", className: "border-amber-300 bg-amber-50 text-amber-950" };
  }
  if (ols === "TO_PICK") {
    return { label: "Oczekuje na zbieranie", className: "border-amber-200 bg-amber-50 text-amber-950" };
  }
  return { label: "Do pakowania", className: "border-slate-300 bg-slate-100 text-slate-800" };
}

/** Czy linia to aktywny zamiennik (qty > 0, ślad po poprzedniku). */
export function isOmsFulfillmentSubstituteIn(line: OmsFulfillmentLineLike): boolean {
  const qty = Number(line.quantity ?? 0);
  if (qty <= EPS) return false;
  return substituteLine(line);
}

/** Czy linia to wycofany produkt po zamianie (archiwum w tabeli historii). */
export function isOmsFulfillmentReplacedOut(line: OmsFulfillmentLineLike, orderItemQuantity: number): boolean {
  const ols = (line.oms_line_status ?? "").trim().toUpperCase();
  const q = Number(orderItemQuantity ?? 0);
  return ols === "REPLACED" && q <= EPS;
}

/** Gdy brak linii WMS, użyj statusu z rekordu zamówienia (OrderItem). */
export function isOrderItemReplacedArchiveRow(
  wm: OmsFulfillmentLineLike | undefined,
  orderItemOmsStatus: string | null | undefined,
  orderItemQuantity: number,
): boolean {
  const q = Number(orderItemQuantity ?? 0);
  if (q > EPS) return false;
  const ols = (wm?.oms_line_status ?? orderItemOmsStatus ?? "").trim().toUpperCase();
  return ols === "REPLACED";
}

/** Wiersz tabeli: czerwone tło gdy jest operacyjny brak (jak w kolejce zbierania). */
export function omsFulfillmentRowToneClass(line: OmsFulfillmentLineLike): string {
  const miss = Number(line.missing_quantity ?? 0);
  if (miss > EPS) return "border-t border-red-200 bg-red-50/50";
  const ols = (line.oms_line_status ?? "").trim().toUpperCase();
  if (ols === "REPLACED") return "border-t border-indigo-100 bg-indigo-50/20";
  return "border-t border-slate-100";
}
