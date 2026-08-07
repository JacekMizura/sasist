import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import {
  listOrderCustomFields,
  putOrderCustomFieldValues,
} from "../../../api/orderCustomFieldsApi";
import { executeOrderBulkActions } from "../orderList/executeOrderBulkActions";
import type { BulkActionConfig, BulkActionRow } from "../orderList/bulkMultiActionTypes";
import { customFieldConfigToPayload, type CustomFieldConfig } from "./modules/customFieldModule";
import { getOrderMultiModule } from "./registry";
import type {
  OrderMultiActionRow,
  OrderMultiBulkOp,
  OrderMultiConfigBag,
  OrderMultiCustomFieldOp,
  OrderMultiHostAction,
  OrderMultiOp,
  OrderMultiSelection,
} from "./types";

export type ExecuteOrderMultiActionsResult = {
  errors: string[];
  hostActions: OrderMultiHostAction[];
};

function isHostOp(op: OrderMultiOp): op is { host: OrderMultiHostAction } {
  return "host" in op;
}

function isCustomFieldOp(op: OrderMultiOp): op is OrderMultiCustomFieldOp {
  return "customField" in op;
}

function mergeBulkConfig(base: BulkActionConfig, partial: Partial<BulkActionConfig>): BulkActionConfig {
  return { ...base, ...partial };
}

function bulkRow(moduleId: string, op: OrderMultiBulkOp): BulkActionRow {
  return {
    id: `${moduleId}-${op.kind}-${Date.now()}`,
    kind: op.kind,
    expanded: true,
  };
}

function resolveExplicitOrderIds(selection: OrderMultiSelection): number[] | null {
  if (selection.mode !== "explicit_ids") return null;
  return selection.orderIds.map((s) => Number(s)).filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Runs stacked order module cards in order. Collects partial errors and host-side follow-ups.
 */
export async function executeOrderMultiActions(input: {
  tenantId: number;
  warehouseId?: number | null;
  selection: OrderMultiSelection;
  rows: OrderMultiActionRow[];
  config: OrderMultiConfigBag;
}): Promise<ExecuteOrderMultiActionsResult> {
  const errors: string[] = [];
  const hostActions: OrderMultiHostAction[] = [];

  for (const row of input.rows) {
    const mod = getOrderMultiModule(row.moduleId);
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

    let ops: OrderMultiOp[] = [];
    try {
      ops = mod.toOps(cfg);
    } catch (e) {
      errors.push(`${mod.label}: ${extractApiErrorMessage(e, "Nie udało się zbudować operacji.")}`);
      continue;
    }

    for (const op of ops) {
      if (isHostOp(op)) {
        hostActions.push(op.host);
        continue;
      }

      if (isCustomFieldOp(op)) {
        const orderIds = resolveExplicitOrderIds(input.selection);
        if (!orderIds || orderIds.length === 0) {
          errors.push(
            `${mod.label}: wymaga zaznaczenia konkretnych zamówień (nie „wszystkie z filtra”).`,
          );
          continue;
        }
        const wh = input.warehouseId ?? null;
        if (wh == null || wh < 1) {
          errors.push(`${mod.label}: wymagany magazyn realizacji.`);
          continue;
        }
        try {
          const defs = await listOrderCustomFields({
            tenant_id: input.tenantId,
            warehouse_id: wh,
            active_only: true,
          });
          const field = defs.find((d) => d.id === op.customField.fieldId);
          if (!field) {
            errors.push(`${mod.label}: nie znaleziono definicji pola.`);
            continue;
          }
          if (!["TEXT", "NUMBER", "SELECT_SINGLE", "SELECT_MULTI"].includes(String(field.type))) {
            errors.push(`${mod.label}: typ pola nieobsługiwany w multiakcjach.`);
            continue;
          }
          const draftCfg: CustomFieldConfig = {
            fieldId: op.customField.fieldId,
            stringValue: op.customField.stringValue,
            numberValue: op.customField.numberValue,
            optionId: op.customField.optionId,
            multiOptionIds: op.customField.multiOptionIds,
          };
          const payload = customFieldConfigToPayload(field, draftCfg);
          for (const oid of orderIds) {
            await putOrderCustomFieldValues(oid, [payload]);
          }
        } catch (e) {
          errors.push(`${mod.label}: ${extractApiErrorMessage(e, "Aktualizacja nie powiodła się.")}`);
        }
        continue;
      }

      const actionConfig = mergeBulkConfig({}, op.config);
      try {
        const { errors: bulkErrors } = await executeOrderBulkActions({
          tenantId: input.tenantId,
          warehouseId: input.warehouseId,
          selection: input.selection,
          rows: [bulkRow(row.moduleId, op)],
          config: actionConfig,
        });
        if (bulkErrors.length) {
          errors.push(...bulkErrors.map((e) => `${mod.label}: ${e}`));
        }
      } catch (e) {
        errors.push(`${mod.label}: ${extractApiErrorMessage(e, "Aktualizacja nie powiodła się.")}`);
      }
    }
  }

  return { errors, hostActions };
}
