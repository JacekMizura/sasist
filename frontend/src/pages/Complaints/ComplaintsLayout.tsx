import { Outlet, useLocation } from "react-router-dom";

import PageLayout from "../../components/layout/PageLayout";
import { ModuleListBreadcrumb } from "../../components/listPage/moduleList";

/**
 * Lista i szczegół reklamacji — breadcrumb jak w module Zwroty (nad listą),
 * szczegół ma własną nawigację.
 */
export default function ComplaintsLayout() {
  const { pathname } = useLocation();
  const isDetail = /^\/complaints\/\d+/.test(pathname);

  return (
    <PageLayout fullBleed>
      {!isDetail ? <ModuleListBreadcrumb items={[{ label: "Reklamacje" }]} /> : null}
      <Outlet />
    </PageLayout>
  );
}
