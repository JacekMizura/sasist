import type { AfterProductionAction, ProductionExecutionMethod } from "../../../api/wmsProductionConfigApi";

export function productionExecutionMethodLabel(method: ProductionExecutionMethod): string {
  return method === "PRINT" ? "Wydruk zlecenia" : "Terminal WMS";
}

export function afterProductionActionLabel(action: AfterProductionAction): string {
  return action === "OPEN_PACKING" ? "Otwórz pakowanie" : "Tylko zmień status";
}

export const PRODUCTION_TRIGGER_SCOPE_NOTE =
  "Zamówienia jednoelementowe — każda pozycja z jednym produktem może uruchomić osobne zlecenie produkcyjne.";
