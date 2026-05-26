import { Outlet, useLocation } from "react-router-dom";

import PageLayout from "../../components/layout/PageLayout";

/** Pełnoekranowa edycja / tworzenie — bez zewnętrznych zakładek modułu (jak produkt: edit vs lista). */
const ADMIN_EDIT_SUBPATH = /^\/settings\/administrators\/(?:new|\d+(?:\/edytuj)?)$/;

export default function AdministratorsLayout() {
  const { pathname } = useLocation();

  if (ADMIN_EDIT_SUBPATH.test(pathname)) {
    return (
      <PageLayout fullBleed>
        <Outlet />
      </PageLayout>
    );
  }

  return (
    <PageLayout fullBleed cardClassName="relative min-h-[600px] w-full">
      <Outlet />
    </PageLayout>
  );
}
