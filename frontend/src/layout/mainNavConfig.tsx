import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  Package,
  Warehouse,
  BarChart3,
  Tag,
  LayoutTemplate,
  Settings,
  Settings2,
  Cpu,
  Zap,
  Tablet,
  RotateCcw,
  MessageSquareWarning,
  ShoppingBag,
  SlidersHorizontal,
  FolderOpen,
  Boxes,
  Factory,
  Truck,
  Layers,
  Ruler,
  Shapes,
  Users,
  Key,
  Building2,
  Plug,
  Download,
  Upload,
  MessageSquare,
  FileText,
  TriangleAlert,
  Route,
  Recycle,
  ListOrdered,
  LayoutDashboard,
  CalendarRange,
} from "lucide-react";

import { UI_STRINGS } from "../constants/uiStrings";
import { getLabel } from "../labels/labelStore";
import { DOCUMENTS_MAIN_FLYOUT_SECTIONS } from "../pages/documents/documentsNavConfig";
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
  /** Visible only for SUPER_ADMIN (super_admin / superadmin). */
  superRoleOnly?: boolean;
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
  /** Show › chevron — category opens a right fly-out panel (Magazyn / Ustawienia). */
  opensSideFlyout?: boolean;
  /**
   * Direct sidebar link (no fly-out). Used for top-level modules like Ustawienia WMS.
   * When set, click navigates here; hover does not open a panel.
   */
  directPath?: string;
};

/** WMS entry CTA at bottom of sidebar (not a menu row). */
export const WMS_SIDEBAR_DIRECT = {
  id: "wms" as const,
  path: "/wms/menu",
  label: "Praca na hali (WMS)",
  Icon: Tablet,
};

export type NavSidebarSectionId = "sales" | "operations";

export type NavSidebarSectionConfig = {
  id: NavSidebarSectionId;
  label: string;
  /** Categories in this section (order = sidebar order). */
  categoryIds: string[];
};

/**
 * ERP sidebar grouping — SPRZEDAŻ / OPERACJE.
 * Kategorie z opensSideFlyout używają NavFlyoutPanel (jak Zamówienia / Szablony / Ustawienia).
 */
export const NAV_SIDEBAR_SECTIONS: NavSidebarSectionConfig[] = [
  {
    id: "sales",
    label: "Sprzedaż",
    categoryIds: ["orders", "customers", "assortment", "documents"],
  },
  {
    id: "operations",
    label: "Operacje",
    categoryIds: [
      "analizy",
      "purchasing",
      "templates",
      "warehouse",
      "settings",
    ],
  },
];

/** Categories that open a hover fly-out. Order follows {@link NAV_SIDEBAR_SECTIONS}. */
export function buildNavFlyoutCategories(): NavCategoryConfig[] {
  return [
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
            path: "/categories",
            label: UI_STRINGS.navigation.categories,
            Icon: FolderOpen,
            plusLinkTo: "/categories",
            plusLinkTitle: UI_STRINGS.navigation.addCategory,
          },
          {
            path: "/size-tables",
            label: UI_STRINGS.navigation.sizeTables,
            Icon: Ruler,
          },
          {
            path: "/variants",
            label: UI_STRINGS.navigation.variants,
            Icon: Shapes,
            plusLinkTo: "/variants/new",
            plusLinkTitle: UI_STRINGS.navigation.addVariantGroup,
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
          {
            path: "/production",
            label: "Produkcja",
            Icon: ClipboardList,
          },
        ],
      },
    ],
  },
  {
    id: "warehouse",
    label: "Magazyn",
    Icon: Warehouse,
    opensSideFlyout: true,
    flyoutSections: [
      {
        items: [
          { path: "/designer", label: "Layout magazynu", Icon: Warehouse },
          { path: "/carts/racks", label: "Regały", Icon: Boxes },
          { path: "/carts/zones", label: "Strefy", Icon: Layers },
          { path: "/carts/carriers", label: "Nośniki", Icon: Package },
          { path: "/inventory-count/dashboard", label: "Inwentaryzacja", Icon: ClipboardList },
          { path: "/settings/wms", label: "Konfiguracja WMS", Icon: Settings2 },
          { path: "/carts/optimizer", label: "Flota", Icon: Route },
          { path: "/warehouse/bdo", label: "BDO", Icon: Recycle },
          { path: "/office/damages", label: "Szkody", Icon: TriangleAlert },
          { path: "/office/damage-reports", label: "Protokoły szkód", Icon: FileText },
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
    id: "analizy",
    label: "Zarządzanie",
    Icon: BarChart3,
    opensSideFlyout: true,
    activePathPrefix: "/zarzadzanie-magazynem",
    flyoutSections: [
      {
        items: [
          {
            path: "/zarzadzanie-magazynem/pulpit",
            label: "Pulpit kierownika",
            Icon: LayoutDashboard,
          },
          {
            path: "/zarzadzanie-magazynem/kolejnosc-dostaw",
            label: "Kolejność dostaw",
            Icon: ListOrdered,
          },
          {
            path: "/zarzadzanie-magazynem/raporty",
            label: "Raporty",
            Icon: BarChart3,
          },
          {
            path: "/zarzadzanie-magazynem/plan-zmian",
            label: "Plan zmian",
            Icon: CalendarRange,
          },
        ],
      },
    ],
  },
  {
    id: "templates",
    label: UI_STRINGS.navigation.templatesHub,
    Icon: LayoutTemplate,
    opensSideFlyout: true,
    activePathPrefix: "/templates",
    flyoutSections: [
      {
        items: [
          {
            path: "/templates/labels",
            label: UI_STRINGS.navigation.labelSystem,
            Icon: Tag,
          },
          {
            path: "/templates/print",
            label: "Szablony wydruków",
            Icon: FileText,
          },
          {
            path: "/templates/messages",
            label: "Szablony wiadomości",
            Icon: MessageSquare,
          },
          {
            path: "/templates/exports",
            label: "Eksporty",
            Icon: Download,
          },
        ],
      },
    ],
  },
  {
    id: "documents",
    label: UI_STRINGS.navigation.documentsCategory,
    Icon: FolderOpen,
    flyoutSections: DOCUMENTS_MAIN_FLYOUT_SECTIONS.map((sec) => ({
      title: sec.title,
      items: sec.items.map((i) => ({ path: i.path, label: i.label, Icon: i.Icon })),
    })),
  },
  {
    id: "settings",
    label: UI_STRINGS.navigation.settingsCategory,
    Icon: Settings,
    opensSideFlyout: true,
    flyoutSections: [
      {
        items: [
          {
            path: "/settings/company",
            label: "Ogólne",
            Icon: Building2,
            permissionsAny: ["settings.users", "settings.company"],
          },
          {
            path: "/settings/administrators",
            label: "Użytkownicy",
            Icon: Users,
            permissionsAny: ["settings.users"],
          },
          {
            path: "/settings/integrations",
            label: "Integracje",
            Icon: Plug,
            permissionsAny: ["settings.users"],
          },
          {
            path: "/settings/api-keys",
            label: "Klucze API",
            Icon: Key,
            permissionsAny: ["settings.users"],
          },
          {
            path: "/settings/import",
            label: "Import",
            Icon: Upload,
            permissionsAny: ["settings.users"],
          },
          {
            path: "/settings/shipping-methods",
            label: UI_STRINGS.navigation.shippingMethods,
            Icon: Truck,
            permissionsAny: ["settings.users", "settings.company"],
          },
          {
            path: "/settings/sales/stock-pools",
            label: "Pule stanów",
            Icon: Layers,
            permissionsAny: ["settings.users", "settings.company"],
          },
          {
            path: "/system",
            label: UI_STRINGS.navigation.system,
            Icon: Cpu,
          },
          {
            path: "/system/labels",
            label: getLabel("system.tab.labels", "Słownik aplikacji"),
            Icon: SlidersHorizontal,
            superRoleOnly: true,
          },
        ],
      },
    ],
  },
];
}

/** Snapshot at module load — prefer {@link buildNavFlyoutCategories} in React render. */
export const NAV_FLYOUT_CATEGORIES: NavCategoryConfig[] = buildNavFlyoutCategories();

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
    if (pathname.startsWith("/designer") || pathname.startsWith("/warehouse-designer")) return true;
    if (pathname.startsWith("/carts/")) return true;
    if (pathname.startsWith("/warehouse/bdo")) return true;
    if (pathname.startsWith("/office/damages") || pathname.startsWith("/office/damage-reports")) return true;
    if (pathname === "/inventory-count" || pathname.startsWith("/inventory-count/")) return true;
    if (pathname === "/settings/wms" || pathname.startsWith("/settings/wms/")) return true;
    return navGroupHasActivePath(pathname, categoryFlyoutPaths(category));
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
    if (pathname === "/production" || pathname.startsWith("/production/")) return true;
  }
  if (category.id === "settings") {
    // Konfiguracja WMS należy do Magazynu — nie podświetlaj Ogólnych.
    if (pathname === "/settings/wms" || pathname.startsWith("/settings/wms/")) return false;
    // Templates category owns exports / document templates / message templates.
    if (pathname.startsWith("/templates")) return false;
    if (pathname.startsWith("/settings")) return true;
    if (pathname === "/system" || pathname.startsWith("/system/")) return true;
  }
  if (category.id === "templates") {
    if (pathname.startsWith("/templates")) return true;
    if (pathname.startsWith("/labels") || pathname.startsWith("/system-etykiet")) return true;
    if (pathname.startsWith("/admin/print-templates")) return true;
    if (pathname.startsWith("/settings/document-templates")) return true;
    if (pathname.startsWith("/admin/message-templates")) return true;
    if (pathname.startsWith("/settings/exports")) return true;
  }
  if (category.id === "analizy") {
    if (pathname === "/zarzadzanie-magazynem" || pathname.startsWith("/zarzadzanie-magazynem/")) return true;
    if (pathname === "/pulpit-kierownika" || pathname.startsWith("/pulpit-kierownika/")) return true;
    if (pathname === "/analytics" || pathname.startsWith("/analytics/")) return true;
    if (pathname === "/centrum-operacyjne" || pathname.startsWith("/centrum-operacyjne/")) return true;
    if (pathname === "/optymalizacja" || pathname.startsWith("/optymalizacja/")) return true;
    if (pathname.startsWith("/wms/supply-flow")) return true;
    if (pathname.startsWith("/wms/operations")) return true;
    return false;
  }
  if (category.id === "documents") {
    if (pathname.startsWith("/documents")) return true;
  }
  return navGroupHasActivePath(pathname, categoryFlyoutPaths(category));
}
