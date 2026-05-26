import { Outlet, useLocation } from "react-router-dom";

import PageLayout from "../../components/layout/PageLayout";
import { PageModuleHeader } from "../../components/layout/PageModuleHeader";

export default function OrdersLayout() {
  const { pathname } = useLocation();
  const isReturnsSection = pathname.startsWith("/orders/returns");
  const orderNumericDetail = /^\/orders\/\d+$/.test(pathname);

  const listShell = (
    <PageLayout fullBleed>
      <Outlet />
    </PageLayout>
  );

  /** Szczegół zamówienia (numeric id) */
  if (orderNumericDetail) {
    return listShell;
  }

  if (pathname === "/orders/list" || pathname.startsWith("/orders/custom-fields") || pathname.startsWith("/orders/automation")) {
    return listShell;
  }

  /** Zwroty */
  if (isReturnsSection) {
    return listShell;
  }

  /** Reklamacja z `/orders/complaints/:id` */
  if (pathname.startsWith("/orders/complaints")) {
    return listShell;
  }

  /** `/orders/new`, import redirect, etc. */
  return (
    <PageLayout>
      <PageModuleHeader title="Zamówienia" />
      <Outlet />
    </PageLayout>
  );
}
