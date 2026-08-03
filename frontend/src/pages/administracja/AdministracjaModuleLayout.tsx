import { Outlet } from "react-router-dom";
import PageLayout from "../../components/layout/PageLayout";

/** Pełnoprawny moduł L1 — Administracja magazynem (nie flyout). */
export default function AdministracjaModuleLayout() {
  return (
    <PageLayout fullBleed>
      <Outlet />
    </PageLayout>
  );
}
