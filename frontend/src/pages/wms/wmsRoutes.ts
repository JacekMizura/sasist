import { ORDERS_OPERATIONS_UPDATED_EVENT } from "../../constants/wmsEvents";

/** Brak tras `/wms/carriers*` — nośniki obsługuje przyjęcie PZ (`receivingPz`) i inne flow operacyjne. */
export const WMS_ROUTES = {
  root: "/wms",
  /** Ekran startowy / launcher trybów WMS (pełna strona, nie modal). */
  menu: "/wms/menu",
  returns: "/wms/returns",
  /** Grid processing for one RMZ session. */
  returnsProcess: (returnId: number | string) => `/wms/returns/process/${returnId}`,
  complaintsProcess: (complaintId: number | string) => `/wms/returns/complaints/${complaintId}`,
  picking: "/wms/picking",
  pickingOrderType: "/wms/picking/order-type",
  pickingCart: "/wms/picking/cart",
  /** Lista produktów do zbiórki (po statusie i typie zamówień). */
  pickingProducts: "/wms/picking/products",
  /** Dogrywka zbierki — tylko linie do domknięcia po decyzji OMS (bez kohorty statusu zbierania). */
  pickingRecovery: (orderId: number | string) => `/wms/picking/recovery/${orderId}`,
  pickingRecoveryBatch: (batchId: number | string) => `/wms/picking/recovery/batch/${batchId}`,
  pickingProduct: (productId: number | string) => `/wms/picking/products/${productId}`,
  /** Hub: skan / przejście do produktu. */
  productPreviewRoot: "/wms/product-preview",
  /** Podgląd operacyjny produktu (bez cen i zamówień). */
  productPreview: (productId: number | string) => `/wms/product-preview/${productId}`,
  /** Legacy: kolejność lokalizacja → produkt (demo / stary flow). */
  pickingLocations: "/wms/picking/locations",
  packing: "/wms/packing",
  packingMode: "/wms/packing/mode",
  packingScanCart: "/wms/packing/scan-cart",
  packingOrders: "/wms/packing/orders",
  /** Ekran pakowania jednego zamówienia (skan EAN). */
  packingOrder: (orderId: number | string) => `/wms/packing/order/${orderId}`,
  /** Operator home — kolejka braków (scan → next action). */
  operatorHome: "/wms/braki",
  /**
   * @deprecated Hub kolejek wykonawczych — przekierowanie na Braki dla operatorów.
   * Głębokie linki task/relocation nadal działają.
   */
  operationalQueues: "/wms/operational-queues",
  /** Pulpit KPI — tylko supervisor (``WmsSupervisorDashboardGate``). */
  operationalDashboard: "/wms/operational-queues/dashboard",
  operationalTask: (taskId: number | string) => `/wms/operational-queues/task/${taskId}`,
  operationalRelocationTask: (taskId: number | string) =>
    `/wms/operational-queues/relocation/${taskId}`,
  /** Braki — lista / skan (bez tabeli), kanoniczny URL. */
  braki: (orderId?: number | null) =>
    orderId != null && Number.isFinite(Number(orderId)) && Number(orderId) > 0
      ? `/wms/braki?order_id=${Number(orderId)}`
      : "/wms/braki",
  /** @deprecated Używaj ``braki()`` — zostawione dla starych linków. */
  issues: "/wms/issues",
  /** Braki — ekran decyzyjny dla jednego zadania. */
  issueTask: (taskId: number | string) => `/wms/issues/task/${taskId}`,
  receiving: "/wms/receiving",
  /** Produkty z brakującymi danymi — operacyjny flow magazynowy (trasa po lokalizacjach). */
  productDataCompletion: "/wms/product-data-completion",
  /** @deprecated Przekierowanie do ``productDataCompletion``. */
  incompleteReceivingData: "/wms/receiving/incomplete-product-data",
  /** Szczegóły PZ — wyłącznie liczenie (``WmsReceivingCountPage``), segment ``pz`` jak w REST ``/wms/receiving/pz/{id}``. */
  receivingPz: (pzId: number | string) => `/wms/receiving/pz/${pzId}`,
  putaway: "/wms/putaway",
  /** Live operational runtime hub (Phase 5). */
  operations: "/wms/operations",
  operationsReplenishment: "/wms/operations/replenishment",
  operationsOperators: "/wms/operations/operators",
  operationsAlerts: "/wms/operations/alerts",
  operationsTasks: "/wms/operations/tasks",
  /** Sprzedaż bezpośrednia — terminal operacyjny (nie POS). */
  directSales: "/wms/direct-sales",
  mm: "/wms/mm",
  /** PM/MM draft — assign destination locations (not PZ receiving / putaway list). */
  mmRelocation: (docId: number | string) => `/wms/mm/relocation/${docId}`,
  mmRelocationItem: (docId: number | string, itemId: number | string) =>
    `/wms/mm/relocation/${docId}/item/${itemId}`,
  mmRelocationItemExecute: (docId: number | string, itemId: number | string) =>
    `/wms/mm/relocation/${docId}/item/${itemId}/execute`,
  putawayPz: (pzId: number | string) => `/wms/putaway/${pzId}`,
  /** Krok 2: produkt + sugerowane lokalizacje. */
  putawayItem: (pzId: number | string, itemId: number | string) => `/wms/putaway/${pzId}/item/${itemId}`,
  /** Krok 3: skan / wpisanie ilości po wyborze lokalizacji. */
  putawayItemExecute: (pzId: number | string, itemId: number | string) =>
    `/wms/putaway/${pzId}/item/${itemId}/execute`,
} as const;

export {
  ORDERS_OPERATIONS_UPDATED_EVENT,
  WMS_MM_UPDATED_EVENT,
  WMS_RECEIVING_UPDATED_EVENT,
  WMS_RELOCATION_FINALIZED_EVENT,
  WMS_SHORTAGES_UPDATED_EVENT,
} from "../../constants/wmsEvents";

export function dispatchOrdersOperationsUpdated(): void {
  window.dispatchEvent(new Event(ORDERS_OPERATIONS_UPDATED_EVENT));
}
