import { patchOrder } from "../../../api/ordersApi";
import { patchOrderUiStatus } from "../../../api/orderUiStatusApi";
import { postOrdersBulkPanelStatus } from "../../../api/panelBulkStatusApi";
import { postOrdersBulkPatch } from "../../../api/ordersBulkApi";
import type { OrderBulkListFiltersPayload } from "../../../utils/orderListBulkFilters";
import { getOrderListBulkActionPolicy, type OrderListBulkActionKind } from "../../../lib/warehouseOperationPolicy";
import type { BulkActionConfig, BulkActionKind, BulkActionRow } from "./bulkMultiActionTypes";

export type ExecuteOrderBulkActionsResult = {
  errors: string[];
};

export type OrderListBulkSelectionArg =
  | { mode: "explicit_ids"; orderIds: string[] }
  | { mode: "filtered_query"; filters: OrderBulkListFiltersPayload };

function bulkKindFromAction(kind: BulkActionKind): OrderListBulkActionKind {
  switch (kind) {
    case "change_status":
      return "change_status";
    case "issue_document":
      return "issue_document";
    case "set_priority":
      return "set_priority";
    case "change_shipping":
      return "change_shipping";
    case "add_note":
      return "add_note";
    default:
      return "change_status";
  }
}

async function runOne(
  orderId: number,
  kind: BulkActionKind,
  cfg: BulkActionConfig,
  tenantId: number,
  warehouseId: number | null,
): Promise<void> {
  switch (kind) {
    case "change_status": {
      const raw = (cfg.change_status?.statusId ?? "").trim();
      const subId = raw === "" || raw === "__clear__" ? null : Number(raw);
      if (raw !== "" && raw !== "__clear__" && Number.isNaN(subId)) {
        throw new Error("Nie wybrano statusu panelu.");
      }
      await patchOrderUiStatus(orderId, tenantId, warehouseId, subId);
      return;
    }
    case "issue_document": {
      const dt = cfg.issue_document?.documentType;
      if (!dt) throw new Error("Wybierz typ dokumentu.");
      await patchOrder(orderId, { document_type: dt });
      return;
    }
    case "set_priority": {
      await patchOrder(orderId, { priority_color: cfg.set_priority?.priorityColor ?? null });
      return;
    }
    case "change_shipping": {
      const sm = (cfg.change_shipping?.shippingMethodId ?? "").trim();
      await patchOrder(orderId, { shipping_method_id: sm || null });
      return;
    }
    case "add_note": {
      const text = (cfg.add_note?.text ?? "").trim();
      if (!text) throw new Error("Wpisz treść notatki.");
      await patchOrder(orderId, { internal_note_append: text });
      return;
    }
    case "send_message":
      throw new Error("Wysyłka wiadomości — w przygotowaniu.");
    case "generate_label":
      throw new Error("Generowanie etykiety — w przygotowaniu.");
    default:
      throw new Error("Nieobsługiwana akcja.");
  }
}

/**
 * Bulk OMS actions. ``warehouseId`` is optional context — never required for ORDER_WORKFLOW
 * (including ``filtered_query`` / „wszystkie z filtra”).
 */
export async function executeOrderBulkActions(input: {
  tenantId: number;
  warehouseId?: number | null;
  selection: OrderListBulkSelectionArg;
  rows: BulkActionRow[];
  config: BulkActionConfig;
}): Promise<ExecuteOrderBulkActionsResult> {
  const errors: string[] = [];
  const kinds = input.rows.map((r) => r.kind);
  const warehouseId = input.warehouseId ?? null;

  for (const kind of kinds) {
    const policy = getOrderListBulkActionPolicy(bulkKindFromAction(kind));
    if (policy.requiresWarehouse && (warehouseId == null || warehouseId < 1)) {
      return { errors: [policy.reason] };
    }
  }

  if (input.selection.mode === "filtered_query") {
    const { filters } = input.selection;
    for (const kind of kinds) {
      try {
        switch (kind) {
          case "change_status": {
            const raw = (input.config.change_status?.statusId ?? "").trim();
            const st = raw === "__clear__" ? "" : raw;
            if (st === "" && raw !== "__clear__") {
              throw new Error("Nie wybrano statusu panelu.");
            }
            await postOrdersBulkPanelStatus(input.tenantId, warehouseId, {
              selection_mode: "filtered_query",
              filters,
              status: st,
            });
            break;
          }
          case "issue_document": {
            const dt = input.config.issue_document?.documentType;
            if (!dt) throw new Error("Wybierz typ dokumentu.");
            await postOrdersBulkPatch({
              tenant_id: input.tenantId,
              warehouse_id: warehouseId,
              selection: { mode: "filtered_query", filters },
              document_type: dt,
            });
            break;
          }
          case "set_priority": {
            await postOrdersBulkPatch({
              tenant_id: input.tenantId,
              warehouse_id: warehouseId,
              selection: { mode: "filtered_query", filters },
              priority_color: input.config.set_priority?.priorityColor ?? null,
            });
            break;
          }
          case "change_shipping": {
            const sm = (input.config.change_shipping?.shippingMethodId ?? "").trim();
            if (!sm) throw new Error("Wybierz metodę dostawy.");
            await postOrdersBulkPatch({
              tenant_id: input.tenantId,
              warehouse_id: warehouseId,
              selection: { mode: "filtered_query", filters },
              shipping_method_id: sm,
            });
            break;
          }
          case "add_note": {
            const text = (input.config.add_note?.text ?? "").trim();
            if (!text) throw new Error("Wpisz treść notatki.");
            await postOrdersBulkPatch({
              tenant_id: input.tenantId,
              warehouse_id: warehouseId,
              selection: { mode: "filtered_query", filters },
              internal_note_append: text,
            });
            break;
          }
          default:
            throw new Error("Ta akcja przy zaznaczeniu „pasujące do filtrów” nie jest jeszcze obsługiwana z serwera.");
        }
      } catch (e) {
        const msg =
          e && typeof e === "object" && "response" in e
            ? String((e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? "")
            : e instanceof Error
              ? e.message
              : String(e);
        errors.push(`${kind}: ${msg || "błąd"}`);
      }
    }
    return { errors };
  }

  const orderIds = input.selection.orderIds;
  for (const oidStr of orderIds) {
    const oid = parseInt(oidStr, 10);
    if (!Number.isFinite(oid)) continue;
    for (const kind of kinds) {
      try {
        await runOne(oid, kind, input.config, input.tenantId, warehouseId);
      } catch (e) {
        const msg =
          e && typeof e === "object" && "response" in e
            ? String((e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? "")
            : e instanceof Error
              ? e.message
              : String(e);
        errors.push(`Zamówienie #${oid} — ${kind}: ${msg || "błąd"}`);
      }
    }
  }
  return { errors };
}
