/**
 * Destinations for Magazyn (SSOT flyout w mainNavConfig).
 */

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
  { title: "Flota", description: "Planowanie floty.", to: "/carts/optimizer" },
  { title: "BDO", description: "Opakowania i raport środowiskowy.", to: "/warehouse/bdo" },
  { title: "Szkody", description: "Rejestr szkód.", to: "/office/damages" },
  { title: "Protokoły szkód", description: "Protokoły szkód.", to: "/office/damage-reports" },
];
