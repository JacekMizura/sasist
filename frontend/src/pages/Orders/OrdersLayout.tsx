import { NavLink, Outlet } from "react-router-dom";

export default function OrdersLayout() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6 border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-semibold text-gray-800">Zamówienia</h1>
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
      </div>
      <Outlet />
    </div>
  );
}
