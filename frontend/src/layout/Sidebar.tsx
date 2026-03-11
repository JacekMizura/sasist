import { NavLink } from "react-router-dom";
import { UI_STRINGS } from "../constants/uiStrings";
import { WarehouseIcon, CartIcon, type IconProps } from "../icons";

type MenuItem = {
  name: string;
  path: string;
  Icon?: React.ComponentType<IconProps> | null;
};

const menu: MenuItem[] = [
  { name: UI_STRINGS.navigation.dashboard, path: "/", Icon: WarehouseIcon },
  { name: UI_STRINGS.navigation.orders, path: "/orders" },
  { name: UI_STRINGS.navigation.products, path: "/products" },
  { name: UI_STRINGS.navigation.carts, path: "/carts", Icon: CartIcon },
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
              `flex items-center gap-3 px-4 py-2 rounded-xl text-sm font-medium ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`
            }
          >
            {item.Icon && <item.Icon size={20} className="shrink-0" aria-hidden />}
            {item.name}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
