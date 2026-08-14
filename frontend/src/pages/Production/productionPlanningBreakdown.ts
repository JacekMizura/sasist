/** Planning demand row breakdown — „Dlaczego taka ilość?” */

export type PlanningQtyBreakdownInput = {
  on_hand: number;
  in_pipeline: number;
  order_demand: number;
  forecast_demand: number;
  stock_replenishment_needed?: number | null;
  order_production_needed?: number | null;
  production_moq?: number | null;
  production_batch_multiple?: number | null;
  recommended_quantity: number;
  max_producible?: number | null;
};

export type PlanningQtyBreakdownLine = {
  key: string;
  label: string;
  value: number | string;
  /** Muted helper under the label (business clarification). */
  hint?: string;
};

/**
 * Demand engine (planning_service / combined_production_need):
 * - order_need = max(0, order_demand − on_hand − in_pipeline)
 * - forecast_need = max(0, cel_zapasu − on_hand − in_pipeline)
 * - combined_raw = max(0, order_demand + forecast_need − on_hand − in_pipeline)
 *               ≈ order_need + forecast_need (gdy pokrycie nie przekracza zamówień)
 * - recommended = MOQ / wielokrotność / limit materiałów(combined_raw)
 *
 * stock_replenishment_needed — osobna ścieżka uzupełnienia (free-stock pipeline), po MOQ.
 */
export function buildPlanningQtyBreakdown(row: PlanningQtyBreakdownInput): PlanningQtyBreakdownLine[] {
  const orderNeed = Number(row.order_production_needed ?? 0);
  const stockNeed = Number(row.stock_replenishment_needed ?? 0);
  const covering = Math.max(0, Number(row.order_demand ?? 0) - orderNeed);
  const sumParts = orderNeed + stockNeed;
  const recommended = Number(row.recommended_quantity ?? 0);

  const lines: PlanningQtyBreakdownLine[] = [
    {
      key: "order_demand",
      label: "Zapotrzebowanie z zamówień (brutto)",
      value: row.order_demand,
      hint: "Suma sztuk z otwartych zamówień — kolumna „Zamówienia” w tabeli",
    },
    {
      key: "covering",
      label: "Stan / produkcja pokrywająca zamówienia",
      value: covering,
      hint: "Odejmowane od brutto → „Zamówienia do pokrycia”",
    },
    {
      key: "order_need",
      label: "Zamówienia do pokrycia",
      value: orderNeed,
      hint: "Brutto − stan − w produkcji (to pokazuje „Na zamówienia”)",
    },
    {
      key: "stock_replenishment",
      label: "Uzupełnienie zapasu",
      value: stockNeed,
      hint: "Luka do celu zapasu (kolumna „Uzupełnienie”)",
    },
    { key: "on_hand", label: "Stan", value: row.on_hand },
    { key: "in_pipeline", label: "W produkcji", value: row.in_pipeline },
    { key: "forecast_demand", label: "Cel zapasu", value: row.forecast_demand },
  ];
  if (row.production_moq != null && Number(row.production_moq) > 0) {
    lines.push({ key: "moq", label: "MOQ", value: row.production_moq });
  }
  if (row.production_batch_multiple != null && Number(row.production_batch_multiple) > 0) {
    lines.push({ key: "multiple", label: "Wielokrotność partii", value: row.production_batch_multiple });
  }
  lines.push({
    key: "formula",
    label: "Wyliczenie",
    value: formatRecommendationFormula({
      orderNeed,
      stockNeed,
      sumParts,
      recommended,
      maxProducible: row.max_producible,
    }),
  });
  lines.push({ key: "recommended", label: "Rekomendowana ilość", value: recommended });
  return lines;
}

export function formatRecommendationFormula(opts: {
  orderNeed: number;
  stockNeed: number;
  sumParts: number;
  recommended: number;
  maxProducible?: number | null;
}): string {
  const o = roundDisp(opts.orderNeed);
  const s = roundDisp(opts.stockNeed);
  const sum = roundDisp(opts.sumParts);
  const rec = roundDisp(opts.recommended);
  // Engine: combined ≈ order_need + stock gap; then MOQ / multiple / material cap.
  const line = `Zamówienia do pokrycia: ${o} + uzupełnienie zapasu: ${s} = ${sum}`;
  if (Math.abs(opts.sumParts - opts.recommended) < 0.05) {
    return `${line} → rekomendacja: ${rec} szt.`;
  }
  const capped =
    opts.maxProducible != null &&
    Number.isFinite(Number(opts.maxProducible)) &&
    Number(opts.maxProducible) + 1e-6 < opts.sumParts;
  const why = capped ? "po limicie materiałów / MOQ" : "po MOQ / wielokrotności partii";
  return `${line} → ${why} → rekomendacja: ${rec} szt.`;
}

function roundDisp(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
  return (Math.round(n * 10) / 10).toFixed(1);
}
