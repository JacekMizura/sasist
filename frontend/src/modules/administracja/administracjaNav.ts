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
  { title: "Wózki", description: "Wózki i wózki z koszykami.", to: "/carts/bulk" },
  { title: "Strefa sortująca", description: "Kompletacja, sortowanie i konsolidacja.", to: "/carts/racks" },
  { title: "Nośniki", description: "Słownik nośników.", to: "/carts/carriers" },
  { title: "Inwentaryzacja", description: "Planowanie inwentaryzacji ERP.", to: "/inventory-count/dashboard" },
  { title: "Ustawienia WMS", description: "Ustawienia procesów i stanowisk.", to: "/settings/wms" },
  { title: "Planer floty", description: "Planowanie floty.", to: "/carts/optimizer" },
  { title: "BDO", description: "Opakowania i raport środowiskowy.", to: "/warehouse/bdo" },
  { title: "Szkody", description: "Rejestr szkód.", to: "/office/damages" },
  { title: "Protokoły szkód", description: "Protokoły szkód.", to: "/office/damage-reports" },
];
