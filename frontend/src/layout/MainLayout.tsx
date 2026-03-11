import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Package,
  Archive,
  ClipboardList,
  ShoppingCart,
  Route,
  ListChecks,
  Warehouse,
  Tag,
  BarChart3,
  Settings,
  Cpu,
} from "lucide-react";
import { UI_STRINGS } from "../constants/uiStrings";
import GlobalScanSearch from "../components/search/GlobalScanSearch";
import { AnalyticsIcon } from "../icons";

const ICON_SIZE = 20;

/** Sidebar items. Analiza is a single entry (module tabs inside the page, like Wózki). */
const SIDEBAR_ITEMS: { path: string; label: string; icon: React.ReactNode }[] = [
  { path: "/dashboard", label: UI_STRINGS.navigation.dashboard, icon: <Home size={ICON_SIZE} className="shrink-0" /> },
  { path: "/products/list", label: UI_STRINGS.navigation.products, icon: <Package size={ICON_SIZE} className="shrink-0" /> },
  { path: "/inventory", label: UI_STRINGS.navigation.inventory, icon: <Archive size={ICON_SIZE} className="shrink-0" /> },
  { path: "/orders/list", label: UI_STRINGS.navigation.orders, icon: <ClipboardList size={ICON_SIZE} className="shrink-0" /> },
  { path: "/carts", label: UI_STRINGS.navigation.carts, icon: <ShoppingCart size={ICON_SIZE} className="shrink-0" /> },
  { path: "/optimizer", label: UI_STRINGS.navigation.fleetPlanner, icon: <Route size={ICON_SIZE} className="shrink-0" /> },
  { path: "/waves", label: UI_STRINGS.navigation.pickingWaves, icon: <ListChecks size={ICON_SIZE} className="shrink-0" /> },
  { path: "/designer", label: UI_STRINGS.navigation.warehouseDesigner, icon: <Warehouse size={ICON_SIZE} className="shrink-0" /> },
  { path: "/labels", label: UI_STRINGS.navigation.labelSystem, icon: <Tag size={ICON_SIZE} className="shrink-0" /> },
  { path: "/analytics", label: UI_STRINGS.navigation.analysis, icon: <AnalyticsIcon size={ICON_SIZE} className="shrink-0" /> },
  { path: "/setup", label: UI_STRINGS.navigation.setup, icon: <Settings size={ICON_SIZE} className="shrink-0" /> },
  { path: "/system", label: "System", icon: <Cpu size={ICON_SIZE} className="shrink-0" /> },
];

function getIsNavActive(pathname: string, path: string): boolean {
  if (path === "/labels") return pathname.startsWith("/labels") || pathname.startsWith("/system-etykiet");
  if (path === "/designer") return pathname.startsWith("/designer") || pathname.startsWith("/warehouse-designer");
  if (path === "/carts") return pathname === "/carts" || pathname.startsWith("/carts/");
  if (path === "/analytics") return pathname === "/analytics" || pathname.startsWith("/analytics/");
  if (path === "/system") return pathname.startsWith("/system") || pathname.startsWith("/changelog");
  if (path === "/dashboard") return pathname === "/dashboard";
  if (path === "/products/list") return pathname.startsWith("/products");
  if (path === "/orders/list") return pathname.startsWith("/orders");
  if (path === "/inventory") return pathname === "/inventory";
  if (path === "/setup") return pathname === "/setup";
  return pathname === path || pathname.startsWith(path + "/");
}

function NavLink({
  path,
  label,
  icon,
  pathname,
  className = "",
}: {
  path: string;
  label: string;
  icon?: React.ReactNode;
  pathname: string;
  className?: string;
}) {
  const isActive = getIsNavActive(pathname, path);
  const linkClass =
    `flex items-center gap-3 py-2.5 px-3.5 rounded-lg font-medium transition-colors [&_svg]:shrink-0 ${
      isActive
        ? "bg-blue-600 text-white"
        : "text-slate-500 hover:text-slate-700 hover:bg-[#f3f6fb]"
    } ${className}`.trim();
  return (
    <Link to={path} className={linkClass} style={{ gap: "12px" }}>
      {icon && (
        <span className="[&_svg]:w-5 [&_svg]:h-5 [&_svg]:min-w-[20px] [&_svg]:min-h-[20px] [&_svg]:text-current">
          {icon}
        </span>
      )}
      {label}
    </Link>
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div className="flex h-screen bg-slate-100">
      <aside className="w-60 bg-white rounded-r-xl shadow-md border-r border-slate-100 p-6 flex flex-col shrink-0">
        <h2 className="text-xl font-bold mb-8 text-slate-800">{UI_STRINGS.app.title}</h2>
        <nav className="flex flex-col gap-1 text-sm flex-1 overflow-y-auto">
          {SIDEBAR_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              path={item.path}
              label={item.label}
              icon={item.icon}
              pathname={pathname}
            />
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="shrink-0 flex items-center gap-4 px-6 py-3 bg-white border-b border-slate-200">
          <GlobalScanSearch />
          <span className="text-xs text-slate-400 hidden sm:inline">Ctrl+K</span>
        </header>
        <div className="flex-1 overflow-y-auto p-10">
          {children}
        </div>
      </div>
    </div>
  );
}
