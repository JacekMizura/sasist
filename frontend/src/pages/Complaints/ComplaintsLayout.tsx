import { Outlet } from "react-router-dom";

import PageLayout from "../../components/layout/PageLayout";

/**
 * Lista i szczegół reklamacji włączają własny nagłówek (jak Order detail / lista zamówień).
 * Brak duplikatu „Reklamacje” nad breadcrumbem.
 */
export default function ComplaintsLayout() {
  return (
    <PageLayout fullBleed>
      <Outlet />
    </PageLayout>
  );
}
