import type {
  WmsReturnFinalizeLineIn,
  WmsReturnLineProcess,
  WmsReturnLineRead,
  WmsReturnLineSplitProcess,
} from "../types/wmsReturn";

export function encodeRejectReasonForSplitPayload(reasonId: string, otherText?: string | null): string {
  const rid = reasonId.trim();
  if (!rid) return "";
  const note = (otherText ?? "").trim();
  if (note) return `${rid} | notatka:${note.slice(0, 300)}`;
  return rid;
}

export function isRmzLineFullyResolved(ln: WmsReturnLineRead): boolean {
  const total = Math.max(0, Math.floor(Number(ln.quantity) || 0));
  if (total <= 0) return true;
  const a = Math.max(0, Number(ln.accepted_qty) || 0);
  const db = Math.max(0, Number(ln.damaged_b_qty) || 0);
  const dc = Math.max(0, Number(ln.damaged_c_qty) || 0);
  const r = Math.max(0, Number(ln.rejected_qty) || 0);
  const sum = a + db + dc + r;
  if (sum < total) return false;
  if (ln.decision == null && sum >= total) {
    if (r === total) return true;
    if (db + dc > 0) return true;
    if (a > 0) return true;
  }
  return ln.decision != null && sum >= total;
}

export function isFinalizeLineComplete(draft: WmsReturnFinalizeLineIn, lineQty: number): boolean {
  const total = Math.max(0, Math.floor(lineQty));
  const sum =
    Math.max(0, draft.accepted_qty) +
    Math.max(0, draft.damaged_b_qty) +
    Math.max(0, draft.damaged_c_qty) +
    Math.max(0, draft.rejected_qty);
  return sum >= total && sum > 0;
}

export function finalizeLineFromProcess(
  orderItemId: number,
  productId: number,
  lineQty: number,
  payload: WmsReturnLineProcess,
): WmsReturnFinalizeLineIn {
  const total = Math.max(1, Math.floor(lineQty));
  if (payload.decision === "OK") {
    return {
      order_item_id: orderItemId,
      product_id: productId,
      accepted_qty: total,
      damaged_qty: 0,
      damaged_b_qty: 0,
      damaged_c_qty: 0,
      rejected_qty: 0,
      condition: "A",
    };
  }
  if (payload.decision === "REJECTED") {
    const rid = (payload.damage_type ?? "").trim();
    const enc = encodeRejectReasonForSplitPayload(rid, payload.note ?? null);
    return {
      order_item_id: orderItemId,
      product_id: productId,
      accepted_qty: 0,
      damaged_qty: 0,
      damaged_b_qty: 0,
      damaged_c_qty: 0,
      rejected_qty: total,
      damage_type: enc ? `reject:${enc}` : null,
    };
  }
  const cls = payload.condition === "B" ? "B" : "C";
  const urls = payload.photo_urls ?? [];
  return {
    order_item_id: orderItemId,
    product_id: productId,
    accepted_qty: 0,
    damaged_qty: total,
    damaged_b_qty: cls === "B" ? total : 0,
    damaged_c_qty: cls === "C" ? total : 0,
    rejected_qty: 0,
    condition: cls,
    photo_urls: urls.length ? urls : undefined,
    damage_type: payload.damage_type ?? null,
    ...(urls.length
      ? {
          damage_entries: [
            {
              id: `panel-dmg-${orderItemId}-0`,
              qty: 1,
              condition: cls,
              damage_type: payload.damage_type ?? null,
              photo_urls: urls,
              note: payload.note ?? null,
            },
          ],
        }
      : {}),
  };
}

export function finalizeLineFromSplit(
  orderItemId: number,
  payload: WmsReturnLineSplitProcess,
): WmsReturnFinalizeLineIn {
  return {
    order_item_id: orderItemId,
    ...payload,
  };
}

export function finalizeLineFromRead(ln: WmsReturnLineRead): WmsReturnFinalizeLineIn {
  const damaged = Math.max(0, Number(ln.damaged_b_qty) || 0) + Math.max(0, Number(ln.damaged_c_qty) || 0);
  return {
    order_item_id: ln.order_item_id,
    product_id: ln.product_id,
    accepted_qty: Math.max(0, Number(ln.accepted_qty) || 0),
    damaged_qty: damaged,
    damaged_b_qty: Math.max(0, Number(ln.damaged_b_qty) || 0),
    damaged_c_qty: Math.max(0, Number(ln.damaged_c_qty) || 0),
    rejected_qty: Math.max(0, Number(ln.rejected_qty) || 0),
    condition: ln.condition ?? null,
    photo_urls: Array.isArray(ln.photo_urls) ? ln.photo_urls : undefined,
    damage_type: ln.damage_type ?? null,
    damage_entries: Array.isArray(ln.damage_entries)
      ? ln.damage_entries.map((e) => ({
          id: e.id,
          qty: e.qty,
          condition: e.condition,
          damage_type: e.damage_type ?? null,
          photo_urls: e.photo_urls ?? [],
          note: e.note ?? null,
        }))
      : undefined,
  };
}

export function mergeLineReadFromDraft(ln: WmsReturnLineRead, draft: WmsReturnFinalizeLineIn): WmsReturnLineRead {
  const total = Math.max(0, Math.floor(Number(ln.quantity) || 0));
  const a = draft.accepted_qty;
  const db = draft.damaged_b_qty;
  const dc = draft.damaged_c_qty;
  const r = draft.rejected_qty;
  let decision = ln.decision;
  if (a + db + dc + r >= total) {
    if (r === total) decision = "REJECTED";
    else if (db + dc > 0) decision = "DAMAGED";
    else if (a > 0) decision = "OK";
  }
  return {
    ...ln,
    accepted_qty: a,
    damaged_b_qty: db,
    damaged_c_qty: dc,
    rejected_qty: r,
    damaged_qty: db + dc,
    decision,
    condition: draft.condition ?? ln.condition,
    damage_type: draft.damage_type ?? ln.damage_type,
    photo_urls: draft.photo_urls ?? ln.photo_urls,
    damage_entries: draft.damage_entries ?? ln.damage_entries,
    processed_at: decision != null ? new Date().toISOString() : ln.processed_at,
  };
}
