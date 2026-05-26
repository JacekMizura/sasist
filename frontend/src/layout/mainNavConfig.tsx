import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  Package,
  Warehouse,
  Activity,
  BarChart3,
  Tag,
  Settings,
  Cpu,
  Zap,
  Tablet,
  RotateCcw,
  MessageSquareWarning,
  ShoppingCart,
  Archive,
  Route,
  Printer,
  Recycle,
  Sliders,
  SlidersHorizontal,
  FolderOpen,
  Boxes,
  Factory,
  Truck,
  ShoppingBag,
  Layers,
  Users,
  Upload,
  UserCog,
  MessageSquare,
  FileText,
  Building2,
} from "lucide-react";

import { UI_STRINGS } from "../constants/uiStrings";
import { DOCUMENTS_NAV_SECTIONS } from "../pages/documents/documentsNavConfig";
import { navGroupHasActivePath } from "./navActive";

export type NavFlyoutLinkConfig = {
  path: string;
  label: string;
  Icon: LucideIcon;
  openInNewTab?: boolean;
  /** Optional "+" on the right: navigates here in one click (orders new, product new, …). */
  plusLinkTo?: string;
  plusLinkTitle?: string;
  /** When set, link is hidden unless the user has this permission (UX only; backend still enforces). */
  permission?: string;
  /**
   * When set, link is shown if the user has any of these permissions (OR). Super role always passes.
   * Takes precedence over `permission` when non-empty.
   */
  permissionsAny?: string[];
};

export type NavFlyoutSectionConfig = {
  /** Optional heading above the row (e.g. Sprzedaż, Magazynowe). */
  title?: string;
  items: NavFlyoutLinkConfig[];
};

export type NavCategoryConfig = {
  id: string;
  label: string;
  Icon: LucideIcon;
  /** Groups separated by dividers in the fly-out. */
  flyoutSections: NavFlyoutSectionConfig[];
  /**
   * When set, the sidebar category stays highlighted for any route under this prefix
   * (module uses in-page tabs instead of a long fly-out).
   */
  activePathPrefix?: string;
};

/** Direct link (no fly-out): opens WMS in a new tab. */
export const WMS_SIDEBAR_DIRECT = {
  id: "wms" as const,
  path: "/wms",
  label: UI_STRINGS.navigation.wmsTerminal,
  Icon: Tablet,
};

/** Categories that open a hover fly-out (excludes WMS — see `WMS_SIDEBAR_DIRECT`). */
export const NAV_FLYOUT_CATEGORIES: NavCategoryConfig[] = [
  {
    id: "orders",
    label: UI_STRINGS.navigation.groups.orders,
    Icon: ClipboardList,
    flyoutSections: [
      {
        items: [
          {
            path: "/orders/list",
            label: UI_STRINGS.navigation.orders,
            Icon: ClipboardList,
            plusLinkTo: "/orders/new",
            plusLinkTitle: "Dodaj zamówienie",
          },
          {
            path: "/orders/returns",
            label: UI_STRINGS.navigation.returns,
            Icon: RotateCcw,
            plusLinkTo: "/wms/returns",
            plusLinkTitle: "Nowy zwrot (WMS)",
          },
          {
            path: "/orders/custom-fields",
            label: "Dodatkowe pola",
            Icon: SlidersHorizontal,
            plusLinkTo: "/orders/custom-fields/new",
            plusLinkTitle: "Nowe pole dodatkowe",
          },
          {
            path: "/complaints",
            label: UI_STRINGS.navigation.complaints,
            Icon: MessageSquareWarning,
            plusLinkTo: "/complaints?new=1",
            plusLinkTitle: "Nowa reklamacja",
          },
          {
            path: "/orders/automation/orders",
            label: "Akcje automatyczne",
            Icon: Zap,
            permission: "settings.automation",
          },
        ],
      },
    ],
  },
  {
    id: "customers",
    label: UI_STRINGS.navigation.groups.customers,
    Icon: Users,
    flyoutSections: [
      {
        items: [
          {
            path: "/customers",
            label: UI_STRINGS.navigation.customersList,
            Icon: Users,
            plusLinkTo: "/customers/new",
            plusLinkTitle: UI_STRINGS.navigation.addCustomer,
          },
        ],
      },
    ],
  },
  {
    id: "assortment",
    label: UI_STRINGS.navigation.assortment,
    Icon: Package,
    flyoutSections: [
      {
        items: [
          {
            path: "/products/list",
            label: UI_STRINGS.navigation.products,
            Icon: Package,
            plusLinkTo: "/products/new",
            plusLinkTitle: UI_STRINGS.navigation.addProduct,
          },         
          {
            path: "/bundles",
            label: UI_STRINGS.navigation.bundles,
            Icon: Boxes,
            plusLinkTo: "/bundles/new",
            plusLinkTitle: UI_STRINGS.navigation.addBundle,
          },
          {
            path: "/manufacturers",
            label: UI_STRINGS.navigation.manufacturers,
            Icon: Factory,
            plusLinkTo: "/manufacturers/new",
            plusLinkTitle: UI_STRINGS.navigation.addManufacturer,
          },
          {
            path: "/suppliers",
            label: UI_STRINGS.navigation.suppliers,
            Icon: Truck,
            plusLinkTo: "/suppliers/new",
            plusLinkTitle: UI_STRINGS.navigation.addSupplier,
          },
          {
            path: "/goods-orders",
            label: "Zamówienia towaru",
            Icon: ShoppingBag,
            plusLinkTo: "/goods-orders/new",
            plusLinkTitle: "Dodaj zamówienie towaru",
          },
          {
            path: "/warehouse-materials/cartons",
            label: UI_STRINGS.navigation.warehouseMaterials,
            Icon: Layers,
          },
          {
            path: "/products/profitability",
            label: "Rentowność produktów",
            Icon: BarChart3,
          },
        ],
      },
    ],
  },
  {
    id: "warehouse",
    label: UI_STRINGS.navigation.groups.warehouse,
    Icon: Warehouse,
    flyoutSections: [
      {
        items: [
          { path: "/designer", label: UI_STRINGS.navigation.warehouseDesigner, Icon: Warehouse },
          { path: "/carts/bulk", label: UI_STRINGS.navigation.carts, Icon: ShoppingCart },
          { path: "/carts/racks", label: "Regały", Icon: Boxes },
          { path: "/carts/zones", label: "Strefy", Icon: Layers },
          { path: "/carts/carriers", label: UI_STRINGS.navigation.warehouseCarriers, Icon: Package },
          { path: "/inventory", label: UI_STRINGS.navigation.inventory, Icon: Archive },
          { path: "/optimizer", label: UI_STRINGS.navigation.fleetPlanner, Icon: Route },
          { path: "/warehouse/bdo", label: UI_STRINGS.navigation.warehouseBdo, Icon: Recycle },
        ],
      },
    ],
  },
  {
    id: "purchasing",
    label: UI_STRINGS.navigation.purchasingCategory,
    Icon: ShoppingBag,
    activePathPrefix: "/purchasing",
    flyoutSections: [
      {
        items: [
          {
            path: "/purchasing/dashboard",
            label: UI_STRINGS.navigation.purchasingDashboard,
            Icon: BarChart3,
          },
        ],
      },
    ],
  },
  {
    id: "analytics",
    label: UI_STRINGS.navigation.analysis,
    Icon: BarChart3,
    activePathPrefix: "/analytics",
    flyoutSections: [
      {
        items: [
          { path: "/analytics/dashboard", label: "Dashboard", Icon: BarChart3 },
          { path: "/analytics/inventory-value", label: "Analityka", Icon: BarChart3 },
          { path: "/analytics/warehouse-operations", label: "Centrum operacyjne", Icon: Activity },
          { path: "/analytics/pick-path-simulation", label: "Symulacje", Icon: Zap },
          { path: "/analytics/slotting", label: "Optymalizacja", Icon: SlidersHorizontal },
          { path: "/analytics/warehouse-map", label: "Mapy", Icon: Warehouse },
        ],
      },
    ],
  },
  {
    id: "labels",
    label: UI_STRINGS.navigation.labelSystem,
    Icon: Tag,
    flyoutSections: [{ items: [{ path: "/labels", label: UI_STRINGS.navigation.labelSystem, Icon: Tag }] }],
  },
  {
    id: "documents",
    label: UI_STRINGS.navigation.documentsCategory,
    Icon: FolderOpen,
    flyoutSections: DOCUMENTS_NAV_SECTIONS.map((sec) => ({
      title: sec.title,
      items: sec.items.map((i) => ({ path: i.path, label: i.label, Icon: i.Icon })),
    })),
  },
  {
    id: "settings",
    label: UI_STRINGS.navigation.settingsCategory,
    Icon: Settings,
    flyoutSections: [
      {
        items: [
          {
            path: "/settings/administrators",
            label: UI_STRINGS.navigation.administratorsNav,
            Icon: UserCog,
            permission: "settings.users",
            plusLinkTo: "/settings/administrators/new",
            plusLinkTitle: "Dodaj użytkownika",
          },
          {
            path: "/settings/company",
            label: "Firma",
            Icon: Building2,
            permissionsAny: ["settings.users", "settings.company"],
          },
        ],
      },
      {
        items: [{ path: "/settings/printers", label: UI_STRINGS.navigation.printersNav, Icon: Printer }],
      },
      {
        items: [
          { path: "/settings/import", label: "Import", Icon: Upload },
          { path: "/settings/exports", label: "Eksport", Icon: FolderOpen },
          { path: "/admin/message-templates", label: "Szablony wiadomości", Icon: MessageSquare },
          { path: "/admin/print-templates", label: "Szablony wydruków", Icon: FileText },
        ],
      },
      {
        items: [
          { path: "/settings/wms", label: UI_STRINGS.navigation.wmsSettings, Icon: Sliders },
          {
            path: "/settings/shipping-methods",
            label: UI_STRINGS.navigation.shippingMethods,
            Icon: Truck,
          },
        ],
      },
    ],
  },
  {
    id: "system",
    label: UI_STRINGS.navigation.system,
    Icon: Cpu,
    flyoutSections: [{ items: [{ path: "/system", label: UI_STRINGS.navigation.system, Icon: Cpu }] }],
  },
];

export function categoryFlyoutPaths(category: NavCategoryConfig): string[] {
  return category.flyoutSections.flatMap((s) => s.items.map((l) => l.path));
}

export function isCategoryActive(category: NavCategoryConfig, pathname: string): boolean {
  const prefix = category.activePathPrefix?.trim();
  if (prefix) {
    const p = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
    if (pathname === p || pathname.startsWith(`${p}/`)) return true;
  }
  if (category.id === "warehouse") {
    if (pathname.startsWith("/warehouse/bdo")) return true;
    if (pathname.startsWith("/carts/carriers")) return true;
  }
  if (category.id === "orders") {
    if (pathname.startsWith("/orders/automation")) return true;
  }
  if (category.id === "assortment") {
    if (pathname.startsWith("/bundles")) return true;
    if (pathname.startsWith("/manufacturers")) return true;
    if (pathname.startsWith("/suppliers")) return true;
    if (pathname.startsWith("/goods-orders")) return true;
    if (pathname.startsWith("/warehouse-materials")) return true;
  }
  if (category.id === "settings") {
    if (pathname.startsWith("/settings")) return true;
    if (pathname.startsWith("/admin/message-templates")) return true;
    if (pathname.startsWith("/admin/print-templates")) return true;
  }
  if (category.id === "documents") {
    if (pathname.startsWith("/documents")) return true;
  }
  return navGroupHasActivePath(pathname, categoryFlyoutPaths(category));
}
