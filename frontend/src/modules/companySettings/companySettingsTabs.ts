import type { TabsNavItem } from "../../components/layout/TabsNav";

export const COMPANY_SETTINGS_TABS: TabsNavItem[] = [
  { path: "/settings/company", label: "Dane firmy", end: true },
  { path: "/settings/company/warehouses", label: "Magazyny" },
  { path: "/settings/company/tenants", label: "Firmy i przypisania" },
  { path: "/settings/company/branding", label: "Branding" },
];

export type CompanySettingsTabMeta = {
  title: string;
  description: string;
};

export function resolveCompanySettingsTabMeta(pathname: string): CompanySettingsTabMeta {
  if (pathname.includes("/warehouses")) {
    return {
      title: "Magazyny",
      description: "Lista magazynów, magazyn domyślny i strategia realizacji zamówień.",
    };
  }
  if (pathname.includes("/tenants")) {
    return {
      title: "Firmy i przypisania",
      description: "Firmy w systemie, przypisania magazynów, role i ustawienia domyślne.",
    };
  }
  if (pathname.includes("/branding")) {
    return {
      title: "Branding",
      description: "Logo firmy i podgląd wyglądu w interfejsie systemu.",
    };
  }
  return {
    title: "Dane firmy",
    description: "Profil organizacji — dane rejestrowe, adres i kontakt rozliczeniowy.",
  };
}
