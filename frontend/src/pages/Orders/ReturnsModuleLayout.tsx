import { Outlet, useLocation } from "react-router-dom";

import { ModuleListBreadcrumb } from "../../components/listPage/moduleList";
import { useWarehouse } from "../../context/WarehouseContext";

import ReturnsModuleTabsStrip, { isReturnsModuleDetailPath } from "./ReturnsModuleTabsStrip";

export type ReturnsModuleOutletContext = {
  warehouseId: number | null;
};

const RETURNS_MODULE_BREADCRUMB = [
  { label: "Zamówienia", to: "/orders/list" },
  { label: "Zwroty" },
] as const;

/**
 * Wspólny shell modułu Zwroty: breadcrumb → zakładki → treść outletu.
 * Szczegół RMZ (`/orders/returns/:id`) ma własną ścieżkę nawigacji w widoku szczegółu.
 */
export default function ReturnsModuleLayout() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { pathname } = useLocation();
  const isDetailPage = isReturnsModuleDetailPath(pathname);

  return (
    <>
      {!isDetailPage ? (
        <>
          <ModuleListBreadcrumb items={[...RETURNS_MODULE_BREADCRUMB]} />
          <ReturnsModuleTabsStrip />
        </>
      ) : null}
      <Outlet context={{ warehouseId } satisfies ReturnsModuleOutletContext} />
    </>
  );
}
