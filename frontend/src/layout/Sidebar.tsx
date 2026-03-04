import { NavLink } from "react-router-dom";
import { UI_STRINGS } from "../constants/uiStrings";

const menu = [
  { name: UI_STRINGS.navigation.dashboard, path: "/" },
  { name: UI_STRINGS.navigation.orders, path: "/orders" },
  { name: UI_STRINGS.navigation.products, path: "/products" },
  { name: UI_STRINGS.navigation.carts, path: "/carts" },
  { name: UI_STRINGS.navigation.import, path: "/import" },
];

export default function Sidebar() {
  return (
    <div className="w-64 bg-white border-r border-slate-100 shadow-md rounded-r-xl flex flex-col">
      <div className="p-6 text-xl font-bold border-b border-slate-100 text-slate-800">
        {UI_STRINGS.app.titleSaaS}
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {menu.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `block px-4 py-2 rounded-xl text-sm font-medium ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`
            }
          >
            {item.name}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
