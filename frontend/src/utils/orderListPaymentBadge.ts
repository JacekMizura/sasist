import type { CSSProperties } from "react";
import { normalizePanelStatusBg, pickReadableTextOnBackground } from "./panelStatusColor";

/**
 * Badge płatności na liście zamówień — `panel_payment_status` / `panel_payment_method` (import / panel).
 * Logika „paid / unpaid” jak backend `_panel_payment_bucket`; COD osobno (tekst metody lub statusu).
 */
export type OrderListPaymentBadgeResult = {
  label: string;
  className: string;
};

const COD_RE = /pobrani|cod|cash\s*on\s*delivery|przy\s*odbiorze|collect|za\s*pobraniem/i;
const PARTIAL_RE = /częściowo|czesciowo|partial|underpaid|niepełn|niepeln|opłac.*częśc|oplac.*czesc|part\s*paid/i;
const OVERPAY_RE = /nadpłat|nadplat|overpaid|nadwyżk|nadpłac|zwrot\s*na\s*kredyt/i;

function bucketLikeBackend(panelPaymentStatus: string): "paid" | "unpaid" | "unknown" {
  const ps = panelPaymentStatus.trim().toLowerCase();
  if (!ps) return "unknown";
  const paidKw = ["paid", "opłac", "oplac", "zapłac", "zaplac", "completed", "done", "yes", "tak", "1"];
  const unpaidKw = ["unpaid", "nieopłac", "nieoplac", "pending", "wait", "no", "nie", "0", "false"];
  if (PARTIAL_RE.test(ps)) return "unknown";
  if (OVERPAY_RE.test(ps)) return "unknown";
  if (paidKw.some((k) => ps.includes(k))) return "paid";
  if (unpaidKw.some((k) => ps.includes(k))) return "unpaid";
  return "unknown";
}

function hexRgb(hex: string): [number, number, number] | null {
  const s = normalizePanelStatusBg(hex);
  if (!/^#[0-9a-f]{6}$/.test(s)) return null;
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Ten sam wzorzec co status panelu: pasek w lewo + wypełnienie + kolor tekstu (kompaktowy pasek). */
export function orderListPaymentBadgeRowStyle(stripeHex: string, fillHex: string, barWidthPx = 4): CSSProperties {
  const stripe = normalizePanelStatusBg(stripeHex);
  const fill = normalizePanelStatusBg(fillHex);
  const rgb = hexRgb(fill);
  const backgroundColor = rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.88)` : fill;
  const color = pickReadableTextOnBackground(null, fill, 4.2);
  return {
    backgroundColor,
    borderLeft: `${barWidthPx}px solid ${stripe}`,
    color,
    boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.05), 0 1px 2px rgba(15,23,42,0.06)",
  };
}

export function deriveOrderListPaymentBadge(input: {
  panel_payment_status?: string | null;
  panel_payment_method?: string | null;
}): OrderListPaymentBadgeResult | null {
  const pm = (input.panel_payment_method ?? "").trim();
  const ps = (input.panel_payment_status ?? "").trim();
  const pmL = pm.toLowerCase();
  const psL = ps.toLowerCase();

  if (COD_RE.test(pmL) || COD_RE.test(psL)) {
    return {
      label: "Pobranie",
      className: "border-blue-200 bg-blue-100 text-blue-950",
    };
  }
  if (PARTIAL_RE.test(psL) || PARTIAL_RE.test(pmL)) {
    return { label: "Częściowo opłacone", className: "border-amber-200 bg-amber-100 text-amber-950" };
  }
  if (OVERPAY_RE.test(psL) || OVERPAY_RE.test(pmL)) {
    return { label: "Nadpłata", className: "border-violet-200 bg-violet-100 text-violet-950" };
  }

  const b = bucketLikeBackend(psL);
  if (b === "paid") {
    return { label: "Opłacone", className: "border-emerald-200 bg-emerald-100 text-emerald-950" };
  }
  if (b === "unpaid") {
    return { label: "Nieopłacone", className: "border-red-200 bg-red-100 text-red-950" };
  }

  if (ps.trim()) {
    const short = ps.trim().length > 26 ? `${ps.trim().slice(0, 26)}…` : ps.trim();
    return { label: short, className: "border-slate-200 bg-slate-50 text-slate-800" };
  }
  if (pm.trim()) {
    const short = pm.trim().length > 26 ? `${pm.trim().slice(0, 26)}…` : pm.trim();
    return { label: short, className: "border-slate-200 bg-slate-50 text-slate-800" };
  }
  return null;
}

/** Wiersz jak status systemowy (pasek + tło); bez „gołych” pilli. */
export function deriveOrderListPaymentBadgeRow(input: {
  panel_payment_status?: string | null;
  panel_payment_method?: string | null;
}): { label: string; style: CSSProperties } | null {
  const pm = (input.panel_payment_method ?? "").trim();
  const ps = (input.panel_payment_status ?? "").trim();
  const pmL = pm.toLowerCase();
  const psL = ps.toLowerCase();

  if (COD_RE.test(pmL) || COD_RE.test(psL)) {
    return {
      label: "Pobranie",
      style: orderListPaymentBadgeRowStyle("#2563eb", "#dbeafe", 4),
    };
  }
  if (PARTIAL_RE.test(psL) || PARTIAL_RE.test(pmL)) {
    return {
      label: "Częściowo opłacone",
      style: orderListPaymentBadgeRowStyle("#d97706", "#fef3c7", 4),
    };
  }
  if (OVERPAY_RE.test(psL) || OVERPAY_RE.test(pmL)) {
    return {
      label: "Nadpłata",
      style: orderListPaymentBadgeRowStyle("#7c3aed", "#ede9fe", 4),
    };
  }

  const b = bucketLikeBackend(psL);
  if (b === "paid") {
    return {
      label: "Opłacone",
      style: orderListPaymentBadgeRowStyle("#059669", "#d1fae5", 4),
    };
  }
  if (b === "unpaid") {
    return {
      label: "Nieopłacone",
      style: orderListPaymentBadgeRowStyle("#dc2626", "#fee2e2", 4),
    };
  }

  if (ps.trim()) {
    const short = ps.trim().length > 26 ? `${ps.trim().slice(0, 26)}…` : ps.trim();
    return { label: short, style: orderListPaymentBadgeRowStyle("#64748b", "#f8fafc", 4) };
  }
  if (pm.trim()) {
    const short = pm.trim().length > 26 ? `${pm.trim().slice(0, 26)}…` : pm.trim();
    return { label: short, style: orderListPaymentBadgeRowStyle("#64748b", "#f8fafc", 4) };
  }
  return null;
}
