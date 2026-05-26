import type { WmsOrderTimelineEventApi, WmsPackingOrderCardApi } from "../../api/wmsPackingApi";
import { orderListSystemStatusLabel } from "../../utils/orderSystemStatusLabels";

export type WmsOrderHeaderOperational = {
  phase: "picking" | "ready_pack" | "packing" | "packed";
  badgeLabel: string;
  /** Fragmenty tekstu obok badge (np. „Wózek: W-12”, imię) — już sformatowane. */
  detailParts: string[];
  badgeTone: "blue" | "green";
};

const PICKING_FS = new Set(["PICKING", "PARTIAL", "MISSING", "NEEDS_DECISION"]);

function timelineUser(events: WmsOrderTimelineEventApi[] | undefined, eventType: string): string | null {
  if (!events?.length) return null;
  const want = eventType.trim().toUpperCase();
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const t = (e?.event_type ?? "").trim().toUpperCase();
    if (t === want) {
      const u = (e?.user_label ?? "").trim();
      if (u) return u;
    }
  }
  return null;
}

/** Status nagłówka OMS z ``wms_workflow_phase`` + znaczników zamówienia — bez porównywania picked vs ordered. */
export function deriveWmsOrderHeaderOperational(
  w: WmsPackingOrderCardApi | null,
  wmsLoading: boolean,
): WmsOrderHeaderOperational | null {
  if (!w || wmsLoading) return null;
  const tl = w.timeline ?? w.wms_timeline ?? [];
  const phase = (w.wms_workflow_phase ?? "").trim().toUpperCase();
  const fs = (w.wms_fulfillment_state ?? "").trim().toUpperCase();
  const vehicle = (w.wms_vehicle_label ?? "").trim() || (w.basket_code ?? "").trim() || null;
  const total = Number(w.total_quantity ?? 0);
  const packed = Number(w.packed_quantity ?? 0);
  const completed = Boolean(w.is_completed) || (total > 1e-9 && packed + 1e-6 >= total);

  const pickUser = timelineUser(tl, "PICKING_STARTED");
  const packStartUser = timelineUser(tl, "PACKING_STARTED");
  const packDoneUser = timelineUser(tl, "PACKED");
  const packingUser = packDoneUser || packStartUser;

  const vehicleParts = (): string[] => {
    const parts: string[] = [];
    if (vehicle) parts.push(`Wózek: ${vehicle}`);
    return parts;
  };

  if (phase === "PACKED" || completed) {
    return {
      phase: "packed",
      badgeLabel: "Spakowane",
      detailParts: packingUser ? [packingUser] : [],
      badgeTone: "green",
    };
  }

  if (phase === "PACKING") {
    return {
      phase: "packing",
      badgeLabel: "Pakowanie",
      detailParts: packingUser ? [packingUser] : [],
      badgeTone: "blue",
    };
  }

  if (phase === "READY_TO_PACK") {
    return {
      phase: "ready_pack",
      badgeLabel: "Gotowe do pakowania",
      detailParts: vehicleParts(),
      badgeTone: "blue",
    };
  }

  if (phase === "NEEDS_DECISION") {
    return {
      phase: "ready_pack",
      badgeLabel: orderListSystemStatusLabel("NEEDS_DECISION"),
      detailParts: vehicleParts(),
      badgeTone: "blue",
    };
  }

  if (phase === "MISSING") {
    return {
      phase: "ready_pack",
      badgeLabel: orderListSystemStatusLabel("MISSING"),
      detailParts: vehicleParts(),
      badgeTone: "blue",
    };
  }

  if (phase === "PICKING") {
    const parts = vehicleParts();
    if (pickUser) parts.push(pickUser);
    return {
      phase: "picking",
      badgeLabel: "Zbieranie",
      detailParts: parts,
      badgeTone: "blue",
    };
  }

  if (phase === "TO_PICK") {
    return {
      phase: "picking",
      badgeLabel: "Oczekuje na zbieranie",
      detailParts: [],
      badgeTone: "blue",
    };
  }

  /* Starszy backend bez ``wms_workflow_phase``: bez wyprowadzania „gotowe do pakowania” z ilości zebranych. */
  if (!phase) {
    if (completed) {
      return {
        phase: "packed",
        badgeLabel: "Spakowane",
        detailParts: packingUser ? [packingUser] : [],
        badgeTone: "green",
      };
    }
    if (fs === "MISSING" || fs === "NEEDS_DECISION") {
      return {
        phase: "ready_pack",
        badgeLabel: orderListSystemStatusLabel(fs),
        detailParts: vehicleParts(),
        badgeTone: "blue",
      };
    }
    if (fs === "READY_TO_PACK") {
      return {
        phase: "ready_pack",
        badgeLabel: "Gotowe do pakowania",
        detailParts: vehicleParts(),
        badgeTone: "blue",
      };
    }
    if (PICKING_FS.has(fs)) {
      const parts = vehicleParts();
      if (pickUser) parts.push(pickUser);
      return {
        phase: "picking",
        badgeLabel: "Zbieranie",
        detailParts: parts,
        badgeTone: "blue",
      };
    }
  }

  return null;
}
