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
};

export type PlanningQtyBreakdownLine = {
  key: string;
  label: string;
  value: number | string;
};

export function buildPlanningQtyBreakdown(row: PlanningQtyBreakdownInput): PlanningQtyBreakdownLine[] {
  const lines: PlanningQtyBreakdownLine[] = [
    { key: "on_hand", label: "Stan", value: row.on_hand },
    { key: "in_pipeline", label: "W produkcji", value: row.in_pipeline },
    { key: "order_demand", label: "Zamówienia", value: row.order_demand },
    { key: "forecast_demand", label: "Cel zapasu", value: row.forecast_demand },
    {
      key: "stock_replenishment",
      label: "Uzupełnienie magazynu",
      value: row.stock_replenishment_needed ?? 0,
    },
  ];
  if (row.production_moq != null && Number(row.production_moq) > 0) {
    lines.push({ key: "moq", label: "MOQ", value: row.production_moq });
  }
  if (row.production_batch_multiple != null && Number(row.production_batch_multiple) > 0) {
    lines.push({ key: "multiple", label: "Wielokrotność partii", value: row.production_batch_multiple });
  }
  lines.push({ key: "recommended", label: "Rekomendowana ilość", value: row.recommended_quantity });
  return lines;
}
