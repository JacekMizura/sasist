import type { OrderUiMainGroup } from "../types/orderUiStatus";

/**
 * Kolejność grup głównych na panelu zamówień — identyczna jak w {@link OrdersPanelStatusSidebar}
 * i operacyjnym sidebarze WMS.
 */
export const MAIN_PANEL_GROUP_ORDER: readonly OrderUiMainGroup[] = ["NEW", "IN_PROGRESS", "DONE"];
