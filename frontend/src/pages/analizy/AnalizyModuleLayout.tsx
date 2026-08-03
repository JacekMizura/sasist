import { Outlet } from "react-router-dom";
import PageLayout from "../../components/layout/PageLayout";

/** Shell stron Zarządzania — bez zakładek (nawigacja = flyout sidebara, jak Zamówienia). */
export default function AnalizyModuleLayout() {
  return (
    <PageLayout fullBleed>
      <Outlet />
    </PageLayout>
  );
}
