import type { AfterProductionAction, ProductionExecutionMethod } from "../../../api/wmsProductionConfigApi";

export function productionExecutionMethodLabel(method: ProductionExecutionMethod): string {
  return method === "PRINT" ? "Wydruk zlecenia" : "WMS";
}

export function afterProductionActionLabel(action: AfterProductionAction): string {
  return action === "OPEN_PACKING" ? "Przejdź do pakowania" : "Zmień status";
}
