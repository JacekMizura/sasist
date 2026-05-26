import type { StockDocumentItemRead } from "../api/stockDocumentsApi";
import { carrierSplitLabel, toReceivingCountValue } from "../pages/wms/wmsReceivingLineGroups";

export type ReceivingBreakdownRow = {
  key: string;
  label: string;
  display: string;
  units: number;
};

const SALEABLE = "SALEABLE";

function isSaleableLine(it: StockDocumentItemRead): boolean {
  const d = (it.stock_disposition ?? SALEABLE).trim().toUpperCase() || SALEABLE;
  return d === SALEABLE;
}

function damagedLabel(it: StockDocumentItemRead): string {
  const d = (it.stock_disposition ?? "").trim().toUpperCase();
  if (d === "REJECTED_STOCK" || d === "SCRAP") return "USZKODZONE";
  if (d === "OUTLET_B") return "Outlet B";
  if (d === "SERVICE_C") return "Serwis C";
  if (d === "QUARANTINE") return "Kwarantanna";
  return d ? d.replace(/_/g, " ") : "USZKODZONE";
}

function fmtUnits(n: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 }).format(n);
}

export type ReceivingAcceptedSummary = {
  /** Saleable received only. */
  totalAccepted: number;
  totalDamaged: number;
  /** Saleable + damaged (header „Przyjęto”). */
  totalAllReceived: number;
  rows: ReceivingBreakdownRow[];
  damagedRows: ReceivingBreakdownRow[];
  /** Saleable breakdown + aggregated Wada row for compact cards. */
  displayRows: ReceivingBreakdownRow[];
};

/**
 * Source-aware breakdown: Sztuki — N szt. | Karton — N szt. | PAL-xxx — N szt.
 */
function isDamagedLine(it: StockDocumentItemRead): boolean {
  return !isSaleableLine(it);
}

export function buildReceivingAcceptedSummary(
  siblings: StockDocumentItemRead[],
  cartonSize: number,
): ReceivingAcceptedSummary {
  const saleable = siblings.filter((s) => toReceivingCountValue(s.received_quantity) > 0 && isSaleableLine(s));
  const damaged = siblings.filter((s) => toReceivingCountValue(s.received_quantity) > 0 && isDamagedLine(s));

  const pack = Math.max(1, Math.floor(cartonSize) || 1);
  let totalCartons = 0;
  let totalLoose = 0;
  for (const s of saleable) {
    totalCartons += Math.max(0, Math.floor(Number(s.cartons_count) || 0));
    totalLoose += Math.max(0, Math.floor(Number(s.loose_units_count) || 0));
  }

  const rows: ReceivingBreakdownRow[] = [];

  if (totalLoose > 0) {
    rows.push({
      key: "loose",
      label: "Sztuki",
      display: `Sztuki — ${fmtUnits(totalLoose)} szt.`,
      units: totalLoose,
    });
  }

  if (totalCartons > 0) {
    const units = totalCartons * pack;
    // Uproszczona etykieta bez ilości przed słowem
    const kartLabel = totalCartons === 1 ? "Karton" : "Kartony";
    
    rows.push({
      key: "cartons",
      label: kartLabel,
      display: `${kartLabel} — ${fmtUnits(units)} szt.`,
      units,
    });
  }

  for (const s of saleable) {
    const code = carrierSplitLabel(s);
    if (code === "Luzem" || code === "Sztuki") continue;
    
    const qty = toReceivingCountValue(s.received_quantity);
    if (qty <= 0) continue;
    rows.push({
      key: `carrier-${s.id}`,
      label: code,
      display: `${code} — ${fmtUnits(qty)} szt.`,
      units: qty,
    });
  }

  const totalAccepted = saleable.reduce((sum, s) => sum + toReceivingCountValue(s.received_quantity), 0);
  const totalDamaged = damaged.reduce((sum, s) => sum + toReceivingCountValue(s.received_quantity), 0);

  const damagedRows: ReceivingBreakdownRow[] = [];
  let damagedUnits = 0;
  for (const s of damaged) {
    const qty = toReceivingCountValue(s.received_quantity);
    if (qty <= 0) continue;
    damagedUnits += qty;
    const label = damagedLabel(s);
    damagedRows.push({
      key: `damaged-${s.id}`,
      label,
      display: `${label} — ${fmtUnits(qty)} szt.`,
      units: qty,
    });
  }

  const displayRows: ReceivingBreakdownRow[] = [...rows];
  if (damagedUnits > 0) {
    displayRows.push({
      key: "damaged-total",
      label: "Wada",
      display: `Wada — ${fmtUnits(damagedUnits)} szt.`,
      units: damagedUnits,
    });
  }

  return {
    totalAccepted,
    totalDamaged: damagedUnits,
    totalAllReceived: totalAccepted + damagedUnits,
    rows,
    damagedRows,
    displayRows,
  };
}

export function isDamagedStockDisposition(disposition: string | null | undefined): boolean {
  const d = (disposition ?? "SALEABLE").trim().toUpperCase() || "SALEABLE";
  return d !== "SALEABLE";
}