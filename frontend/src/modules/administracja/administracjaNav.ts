/**
 * Destinations for Administracja magazynem (flyout sidebara — SSOT w mainNavConfig).
 * Plik pomocniczy dla testów / odwołań; nawigacja UI = NavFlyoutPanel.
 */

export const ADMINISTRACJA_ROOT = "/administracja-magazynem";

export type AdministracjaLink = {
  title: string;
  description: string;
  to: string;
};

export const ADMINISTRACJA_LINKS: AdministracjaLink[] = [
  { title: "Layout magazynu", description: "Projektant układu magazynu.", to: "/designer" },
  { title: "Regały", description: "Struktura regałów.", to: "/carts/racks" },
  { title: "Strefy", description: "Strefy magazynowe.", to: "/carts/zones" },
  { title: "Nośniki", description: "Słownik nośników.", to: "/carts/carriers" },
  { title: "Konfiguracja WMS", description: "Ustawienia procesów i stanowisk.", to: "/settings/wms" },
  { title: "Szablony etykiet", description: "Szablony etykiet magazynowych.", to: "/templates/labels" },
  { title: "Flota", description: "Konfiguracja i planowanie floty.", to: "/carts/optimizer" },
  { title: "BDO", description: "Opakowania i raport środowiskowy.", to: "/warehouse/bdo" },
  { title: "Szkody", description: "Rejestr szkód biurowych.", to: "/office/damages" },
  { title: "Protokoły szkód", description: "Protokoły szkód.", to: "/office/damage-reports" },
];
