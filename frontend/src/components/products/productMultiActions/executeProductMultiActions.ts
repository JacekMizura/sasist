import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { bulkUpdateProducts } from "../../../api/productsBulkApi";
import { getProductMultiModule } from "./registry";
import type {
  ProductBulkOp,
  ProductMultiActionRow,
  ProductMultiConfigBag,
  ProductMultiSelection,
} from "./types";

export type ExecuteProductMultiActionsResult = {
  updatedTotal: number;
  errors: string[];
};

function selectionPayload(selection: ProductMultiSelection, op: ProductBulkOp) {
  if (selection.mode === "explicit_ids") {
    return {
      selection_mode: "explicit_ids" as const,
      product_ids: selection.productIds,
      action: op.action,
      value: op.value,
    };
  }
  return {
    selection_mode: "filtered_query" as const,
    filters: selection.filters,
    action: op.action,
    value: op.value,
  };
}

/**
 * Runs stacked module cards in order. Collects partial errors (does not fail-fast).
 */
export async function executeProductMultiActions(input: {
  tenantId: number;
  selection: ProductMultiSelection;
  rows: ProductMultiActionRow[];
  config: ProductMultiConfigBag;
}): Promise<ExecuteProductMultiActionsResult> {
  const errors: string[] = [];
  let updatedTotal = 0;

  for (const row of input.rows) {
    const mod = getProductMultiModule(row.moduleId);
    if (!mod) {
      errors.push(`Nieznany moduł: ${row.moduleId}`);
      continue;
    }
    const cfg = input.config[row.moduleId] ?? mod.defaultConfig();
    const validation = mod.validate(cfg);
    if (validation) {
      errors.push(`${mod.label}: ${validation}`);
      continue;
    }
    let ops: ProductBulkOp[] = [];
    try {
      ops = mod.toOps(cfg);
    } catch (e) {
      errors.push(`${mod.label}: ${extractApiErrorMessage(e, "Nie udało się zbudować operacji.")}`);
      continue;
    }
    for (const op of ops) {
      try {
        const res = await bulkUpdateProducts(input.tenantId, selectionPayload(input.selection, op));
        updatedTotal += res.updated ?? 0;
      } catch (e) {
        errors.push(
          `${mod.label} (${op.action}): ${extractApiErrorMessage(e, "Aktualizacja nie powiodła się.")}`,
        );
      }
    }
  }

  return { updatedTotal, errors };
}
