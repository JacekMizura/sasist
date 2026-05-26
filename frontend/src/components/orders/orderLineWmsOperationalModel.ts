import type { WmsOrderTimelineEventApi } from "../../api/wmsPackingApi";

const EPS = 1e-6;

export function formatWmsLineQty(n: number): string {
  const x = Number(n) || 0;
  if (Math.abs(x - Math.round(x)) < 1e-5) return String(Math.round(x));
  return x.toLocaleString("pl-PL", { maximumFractionDigits: 2 });
}

function timelineUserForEventType(
  events: WmsOrderTimelineEventApi[] | undefined,
  eventType: string,
): string | null {
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

export type WmsLineOperationalModel = {
  quantity: number;
  pickedEff: number;
  packed: number;
  pickProgress01: number;
  packProgress01: number;
  pickLabel: string;
  packLabel: string;
  pickUser: string | null;
  packUser: string | null;
  pickTone: "muted" | "progress" | "done" | "shortage";
  packTone: "muted" | "progress" | "done";
};

export function buildWmsLineOperationalModel(args: {
  quantity: number;
  pickedQuantity: number;
  packedQuantity: number;
  pickedQuantityFinal?: number | null;
  wmsPickingLineStatus?: string | null;
  shortageLine?: boolean;
  timeline?: WmsOrderTimelineEventApi[] | null;
}): WmsLineOperationalModel {
  const q = Math.max(0, Number(args.quantity) || 0);
  const pickedRaw = Number(args.pickedQuantity) || 0;
  const pf =
    args.pickedQuantityFinal != null && Number.isFinite(Number(args.pickedQuantityFinal))
      ? Number(args.pickedQuantityFinal)
      : null;
  const pickedEff = pf != null ? pf : pickedRaw;
  const packed = Math.min(q, Number(args.packedQuantity) || 0);

  const tl = args.timeline ?? [];
  const pickUser = timelineUserForEventType(tl, "PICKING_STARTED");
  const packStartUser = timelineUserForEventType(tl, "PACKING_STARTED");
  const packDoneUser = timelineUserForEventType(tl, "PACKED");
  const packUser = packDoneUser || packStartUser;

  const wmsPick = (args.wmsPickingLineStatus ?? "").trim().toLowerCase();
  const shortageLine = Boolean(args.shortageLine);

  let pickLabel: string;
  let pickTone: WmsLineOperationalModel["pickTone"];
  if (q <= EPS) {
    pickLabel = "—";
    pickTone = "muted";
  } else if (shortageLine && pickedEff <= EPS && wmsPick === "missing") {
    pickLabel = "Brak na lok.";
    pickTone = "shortage";
  } else if (pickedEff + EPS >= q) {
    pickLabel = "Zebrano";
    pickTone = "done";
  } else if (pickedEff > EPS) {
    pickLabel = `W zbieraniu`;
    pickTone = "progress";
  } else {
    pickLabel = "Do zbierania";
    pickTone = "muted";
  }

  let packLabel: string;
  let packTone: WmsLineOperationalModel["packTone"];
  if (q <= EPS) {
    packLabel = "—";
    packTone = "muted";
  } else if (packed + EPS >= q) {
    packLabel = "Spakowano";
    packTone = "done";
  } else if (packed > EPS) {
    packLabel = "W pakowaniu";
    packTone = "progress";
  } else {
    packLabel = "Do pakowania";
    packTone = "muted";
  }

  const pickProgress01 = q > EPS ? Math.min(1, Math.max(0, pickedEff / q)) : 0;
  const packProgress01 = q > EPS ? Math.min(1, Math.max(0, packed / q)) : 0;

  return {
    quantity: q,
    pickedEff,
    packed,
    pickProgress01,
    packProgress01,
    pickLabel,
    packLabel,
    pickUser: pickedEff > EPS ? pickUser : null,
    packUser: packed > EPS ? packUser : null,
    pickTone,
    packTone,
  };
}
