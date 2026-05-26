/**
 * UI grouping for granular keys — labels PL; keys must match backend `permission_catalog.PERMISSION_KEYS`.
 */
export type PermissionGroup = {
  id: string;
  title: string;
  keys: { key: string; label: string }[];
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "orders",
    title: "Zamówienia",
    keys: [
      { key: "orders.list", label: "Lista zamówień" },
      { key: "orders.detail", label: "Szczegóły zamówienia" },
      { key: "orders.edit", label: "Edycja" },
      { key: "orders.pack", label: "Pakowanie" },
      { key: "orders.pick", label: "Kompletacja" },
    ],
  },
  {
    id: "warehouse",
    title: "Magazyn",
    keys: [
      { key: "warehouse.operations", label: "Operacje magazynowe" },
      { key: "warehouse.inventory", label: "Inwentaryzacje" },
      { key: "warehouse.relocations", label: "Przesunięcia" },
      { key: "warehouse.stock", label: "Stany" },
    ],
  },
  {
    id: "products",
    title: "Produkty",
    keys: [
      { key: "products.view", label: "Podgląd" },
      { key: "products.edit", label: "Edycja danych" },
      { key: "products.pricing", label: "Edycja cen" },
      { key: "products.stock_edit", label: "Edycja stanów" },
    ],
  },
  {
    id: "settings",
    title: "Ustawienia",
    keys: [
      { key: "settings.statuses", label: "Statusy" },
      { key: "settings.users", label: "Administratorzy" },
      { key: "settings.company", label: "Firma — profil i branding" },
      { key: "settings.automation", label: "Automatyzacja" },
    ],
  },
  {
    id: "complaints",
    title: "Reklamacje",
    keys: [{ key: "complaints.manage", label: "Obsługa reklamacji" }],
  },
  {
    id: "audit",
    title: "Audyt",
    keys: [{ key: "audit.view", label: "Podgląd logów audytu" }],
  },
];
