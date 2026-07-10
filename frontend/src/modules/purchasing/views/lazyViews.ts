import { lazy } from "react";

export const PlanningDashboard = lazy(() => import("./PlanningDashboard"));
export const PurchasePlanView = lazy(() => import("./PurchasePlanView"));
export const PurchaseGeneratorView = lazy(() => import("./PurchaseGeneratorView"));
export const PurchaseOrdersView = lazy(() => import("./PurchaseOrdersView"));
export const ForecastView = lazy(() =>
  import("./ForecastView").then((module) => ({ default: module.default })),
);
export const SupplierScoreView = lazy(() => import("./SupplierScoreView"));
export const SupplierHistoryView = lazy(() => import("./SupplierHistoryView"));
export const PurchasingAlertsView = lazy(() => import("./PurchasingAlertsView"));
export const InventoryPriorityView = lazy(() => import("./InventoryPriorityView"));
export const AutoReplenishmentView = lazy(() => import("./AutoReplenishmentView"));
export const SavingsView = lazy(() => import("./SavingsView"));
