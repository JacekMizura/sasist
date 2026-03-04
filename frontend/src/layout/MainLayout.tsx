import { Link } from "react-router-dom";
import { UI_STRINGS } from "../constants/uiStrings";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-slate-100">
      {/* SIDEBAR */}
      <div className="w-60 bg-white rounded-r-xl shadow-md border-r border-slate-100 p-6">
        <h2 className="text-xl font-bold mb-8 text-slate-800">{UI_STRINGS.app.title}</h2>

        <nav className="flex flex-col gap-4 text-sm">
          <Link to="/dashboard" className="hover:text-blue-600 text-slate-700">
            {UI_STRINGS.navigation.dashboard}
          </Link>
          <Link to="/products/list" className="hover:text-blue-600 text-slate-700">
            {UI_STRINGS.navigation.products}
          </Link>
          <Link to="/orders/list" className="hover:text-blue-600 text-slate-700">
            {UI_STRINGS.navigation.orders}
          </Link>
          <Link to="/carts" className="hover:text-blue-600 text-slate-700">
            {UI_STRINGS.navigation.carts}
          </Link>
          <Link to="/optimizer" className="hover:text-blue-600 text-slate-700">
            {UI_STRINGS.navigation.fleetPlanner}
          </Link>
          <Link to="/designer" className="hover:text-blue-600 text-slate-700">
            {UI_STRINGS.navigation.warehouseDesigner}
          </Link>
          <Link to="/labels" className="hover:text-blue-600 text-slate-700">
            {UI_STRINGS.navigation.labelSystem}
          </Link>
          <Link to="/setup" className="hover:text-blue-600 text-slate-700">
            {UI_STRINGS.navigation.setup}
          </Link>
        </nav>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto p-10">
        {children}
      </div>
    </div>
  );
}
