/**
 * Central warehouse requirement policy — OMS workflow vs WMS/stock ops.
 *
 * Use {@link getOperationPolicy} / {@link requiresWarehouse} everywhere instead of
 * ad-hoc `if (!selectedWarehouse)` checks.
 */

/** Domain context of an operation (future-proof classification). */
export enum OperationContext {
  NONE = "NONE",
  ORDER_WORKFLOW = "ORDER_WORKFLOW",
  INVENTORY = "INVENTORY",
  LOCATION = "LOCATION",
  DOCUMENT = "DOCUMENT",
  RESERVATION = "RESERVATION",
  PRODUCTION = "PRODUCTION",
}

/** Canonical operation ids used by FE + BE policy (keep in sync with warehouse_operation_policy.py). */
export type WarehouseOperation =
  // ORDER_WORKFLOW — no warehouse
  | "order.change_panel_status"
  | "order.change_status"
  | "order.change_customer"
  | "order.change_tags"
  | "order.remove_tags"
  | "order.set_priority"
  | "order.add_note"
  | "order.delete_note"
  | "order.change_payment_status"
  | "order.change_shipping"
  | "order.issue_document_type"
  | "order.edit"
  | "order.export"
  | "order.print_documents"
  | "order.custom_field_value"
  | "order.delete_orders"
  // DOCUMENT (warehouse / fiscal stock docs) — warehouse required
  | "document.create_warehouse"
  | "document.delete_warehouse"
  // RESERVATION
  | "reservation.create"
  | "reservation.release"
  | "reservation.delete"
  // INVENTORY / WMS stock
  | "wms.picking"
  | "wms.picking_bulk"
  | "wms.packing"
  | "wms.receiving"
  | "wms.putaway"
  | "wms.putaway_bulk"
  | "wms.mm"
  | "wms.inventory_count"
  | "wms.relocation"
  | "wms.returns_terminal"
  | "wms.delete_picking_batch"
  // LOCATION
  | "location.create"
  | "location.update"
  | "location.delete"
  | "location.move_stock"
  // PRODUCTION
  | "production.execute"
  | "production.reserve_materials"
  | "admin.warehouse_settings";

export type OperationPolicy = {
  requiresWarehouse: boolean;
  context: OperationContext;
  reason: string;
};

const POLICY: Record<WarehouseOperation, OperationPolicy> = {
  "order.change_panel_status": {
    requiresWarehouse: false,
    context: OperationContext.ORDER_WORKFLOW,
    reason: "Status panelu to workflow OMS, nie operacja na stanach.",
  },
  "order.change_status": {
    requiresWarehouse: false,
    context: OperationContext.ORDER_WORKFLOW,
    reason: "Status zamówienia to workflow OMS.",
  },
  "order.change_customer": {
    requiresWarehouse: false,
    context: OperationContext.ORDER_WORKFLOW,
    reason: "Dane klienta nie zależą od magazynu.",
  },
  "order.change_tags": {
    requiresWarehouse: false,
    context: OperationContext.ORDER_WORKFLOW,
    reason: "Tagi to metadane zamówienia.",
  },
  "order.remove_tags": {
    requiresWarehouse: false,
    context: OperationContext.ORDER_WORKFLOW,
    reason: "Usuwanie tagów to metadane zamówienia.",
  },
  "order.set_priority": {
    requiresWarehouse: false,
    context: OperationContext.ORDER_WORKFLOW,
    reason: "Priorytet to atrybut workflow.",
  },
  "order.add_note": {
    requiresWarehouse: false,
    context: OperationContext.ORDER_WORKFLOW,
    reason: "Notatka nie modyfikuje stanów.",
  },
  "order.delete_note": {
    requiresWarehouse: false,
    context: OperationContext.ORDER_WORKFLOW,
    reason: "Usuwanie notatki nie modyfikuje stanów.",
  },
  "order.change_payment_status": {
    requiresWarehouse: false,
    context: OperationContext.ORDER_WORKFLOW,
    reason: "Status płatności to workflow OMS.",
  },
  "order.change_shipping": {
    requiresWarehouse: false,
    context: OperationContext.ORDER_WORKFLOW,
    reason: "Metoda dostawy to atrybut zamówienia.",
  },
  "order.issue_document_type": {
    requiresWarehouse: false,
    context: OperationContext.ORDER_WORKFLOW,
    reason: "Ustawienie typu dokumentu (flaga), nie wystawienie dokumentu magazynowego.",
  },
  "order.edit": {
    requiresWarehouse: false,
    context: OperationContext.ORDER_WORKFLOW,
    reason: "Edycja pól OMS bez ruchu towaru.",
  },
  "order.export": {
    requiresWarehouse: false,
    context: OperationContext.ORDER_WORKFLOW,
    reason: "Eksport danych jest operacją biurową.",
  },
  "order.print_documents": {
    requiresWarehouse: false,
    context: OperationContext.ORDER_WORKFLOW,
    reason: "Druk etykiet/dokumentów handlowych nie wymaga aktywnego magazynu WMS.",
  },
  "order.custom_field_value": {
    requiresWarehouse: false,
    context: OperationContext.ORDER_WORKFLOW,
    reason: "Pola dodatkowe to metadane zamówienia.",
  },
  "order.delete_orders": {
    requiresWarehouse: false,
    context: OperationContext.ORDER_WORKFLOW,
    reason: "Usuwanie/archiwizacja rekordu zamówienia to operacja administracyjna OMS, nie ruch towaru.",
  },

  "document.create_warehouse": {
    requiresWarehouse: true,
    context: OperationContext.DOCUMENT,
    reason: "Dokument magazynowy (PZ/WZ/MM) jest zawsze w kontekście magazynu.",
  },
  "document.delete_warehouse": {
    requiresWarehouse: true,
    context: OperationContext.DOCUMENT,
    reason: "Usuwanie dokumentu magazynowego wymaga magazynu dokumentu.",
  },

  "reservation.create": {
    requiresWarehouse: true,
    context: OperationContext.RESERVATION,
    reason: "Rezerwacja blokuje stany w magazynie.",
  },
  "reservation.release": {
    requiresWarehouse: true,
    context: OperationContext.RESERVATION,
    reason: "Zwolnienie rezerwacji dotyczy stanów magazynowych.",
  },
  "reservation.delete": {
    requiresWarehouse: true,
    context: OperationContext.RESERVATION,
    reason: "Usuwanie rezerwacji dotyczy stanów magazynowych.",
  },

  "wms.picking": {
    requiresWarehouse: true,
    context: OperationContext.INVENTORY,
    reason: "Zbieranie schodzi ze stanów lokalizacji.",
  },
  "wms.picking_bulk": {
    requiresWarehouse: true,
    context: OperationContext.INVENTORY,
    reason: "Masowe zbieranie to proces WMS na stanach.",
  },
  "wms.packing": {
    requiresWarehouse: true,
    context: OperationContext.INVENTORY,
    reason: "Pakowanie operuje na zebranych stanach / nośnikach.",
  },
  "wms.receiving": {
    requiresWarehouse: true,
    context: OperationContext.INVENTORY,
    reason: "Przyjęcie zwiększa stany magazynowe.",
  },
  "wms.putaway": {
    requiresWarehouse: true,
    context: OperationContext.LOCATION,
    reason: "Rozlokowanie umieszcza towar na lokalizacjach.",
  },
  "wms.putaway_bulk": {
    requiresWarehouse: true,
    context: OperationContext.LOCATION,
    reason: "Masowe rozlokowanie to proces WMS na lokalizacjach.",
  },
  "wms.mm": {
    requiresWarehouse: true,
    context: OperationContext.LOCATION,
    reason: "Przesunięcie MM zmienia lokalizacje i stany.",
  },
  "wms.inventory_count": {
    requiresWarehouse: true,
    context: OperationContext.INVENTORY,
    reason: "Inwentaryzacja koryguje stany.",
  },
  "wms.relocation": {
    requiresWarehouse: true,
    context: OperationContext.LOCATION,
    reason: "Rozlokowanie nośników to operacja lokalizacyjna.",
  },
  "wms.returns_terminal": {
    requiresWarehouse: true,
    context: OperationContext.INVENTORY,
    reason: "Terminal zwrotów przyjmuje towar na stany.",
  },
  "wms.delete_picking_batch": {
    requiresWarehouse: true,
    context: OperationContext.INVENTORY,
    reason: "Usuwanie zbioru zbierania dotyczy artefaktów WMS w magazynie.",
  },

  "location.create": {
    requiresWarehouse: true,
    context: OperationContext.LOCATION,
    reason: "Lokalizacja należy do magazynu.",
  },
  "location.update": {
    requiresWarehouse: true,
    context: OperationContext.LOCATION,
    reason: "Edycja lokalizacji w magazynie.",
  },
  "location.delete": {
    requiresWarehouse: true,
    context: OperationContext.LOCATION,
    reason: "Usuwanie lokalizacji w magazynie.",
  },
  "location.move_stock": {
    requiresWarehouse: true,
    context: OperationContext.LOCATION,
    reason: "Ruch towaru między lokalizacjami.",
  },

  "production.execute": {
    requiresWarehouse: true,
    context: OperationContext.PRODUCTION,
    reason: "Wykonanie produkcji zużywa/przyjmuje stany.",
  },
  "production.reserve_materials": {
    requiresWarehouse: true,
    context: OperationContext.PRODUCTION,
    reason: "Rezerwacja surowców na produkcję.",
  },
  "admin.warehouse_settings": {
    requiresWarehouse: true,
    context: OperationContext.NONE,
    reason: "Konfiguracja jest per magazyn.",
  },
};

/** Full policy for an operation. */
export function getOperationPolicy(operation: WarehouseOperation): OperationPolicy {
  return POLICY[operation];
}

/** Convenience: whether warehouse context is mandatory. */
export function requiresWarehouse(operation: WarehouseOperation): boolean {
  return getOperationPolicy(operation).requiresWarehouse;
}

/** Alias for callers that think in “context” terms. */
export function requiresWarehouseForContext(context: OperationContext): boolean {
  switch (context) {
    case OperationContext.NONE:
    case OperationContext.ORDER_WORKFLOW:
      return false;
    case OperationContext.INVENTORY:
    case OperationContext.LOCATION:
    case OperationContext.DOCUMENT:
    case OperationContext.RESERVATION:
    case OperationContext.PRODUCTION:
      return true;
    default:
      return false;
  }
}

/** @deprecated use WarehouseOperation */
export type WarehouseOperationType = WarehouseOperation;

/** Order-list bulk / quick action kinds → canonical operations. */
export type OrderListBulkActionKind =
  | "change_status"
  | "issue_document"
  | "set_priority"
  | "change_shipping"
  | "add_note"
  | "change_payment_status"
  | "custom_field_value"
  | "delete"
  | "export"
  | "print"
  | "change_tags"
  | "remove_tags";

export function orderListBulkActionToOperation(kind: OrderListBulkActionKind): WarehouseOperation {
  switch (kind) {
    case "delete":
      return "order.delete_orders";
    case "change_status":
      return "order.change_panel_status";
    case "issue_document":
      return "order.issue_document_type";
    case "set_priority":
      return "order.set_priority";
    case "change_shipping":
      return "order.change_shipping";
    case "add_note":
      return "order.add_note";
    case "change_payment_status":
      return "order.change_payment_status";
    case "custom_field_value":
      return "order.custom_field_value";
    case "export":
      return "order.export";
    case "print":
      return "order.print_documents";
    case "change_tags":
      return "order.change_tags";
    case "remove_tags":
      return "order.remove_tags";
    default:
      return "order.edit";
  }
}

export function getOrderListBulkActionPolicy(kind: OrderListBulkActionKind): OperationPolicy {
  return getOperationPolicy(orderListBulkActionToOperation(kind));
}

export function orderListBulkActionRequiresWarehouse(kind: OrderListBulkActionKind): boolean {
  return getOrderListBulkActionPolicy(kind).requiresWarehouse;
}

export const WAREHOUSE_REQUIRED_FOR_STOCK_OP_MESSAGE =
  "Wybierz magazyn realizacji, aby wykonać tę operację magazynową.";

/** @deprecated filtered_query / „wszystkie z filtra” nie wymusza magazynu dla workflow OMS */
export const WAREHOUSE_REQUIRED_FOR_FILTERED_QUERY_MESSAGE = WAREHOUSE_REQUIRED_FOR_STOCK_OP_MESSAGE;

/** Rows for audit / docs. */
export function listOperationPolicies(): Array<{ operation: WarehouseOperation } & OperationPolicy> {
  return (Object.keys(POLICY) as WarehouseOperation[]).map((operation) => ({
    operation,
    ...POLICY[operation],
  }));
}
