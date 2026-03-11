import { NavLink, Outlet } from "react-router-dom";
import PageLayout from "../../components/layout/PageLayout";

export default function OrdersLayout() {
  return (
    <PageLayout
      title="Zamówienia"
      actions={
        <nav className="flex gap-2">
          <NavLink
            to="/orders/list"
            end
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`
            }
          >
            Lista
          </NavLink>
          <NavLink
            to="/orders/import"
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`
            }
          >
            Import
          </NavLink>
        </nav>
      }
    >
      <Outlet />
    </PageLayout>
  );
}
