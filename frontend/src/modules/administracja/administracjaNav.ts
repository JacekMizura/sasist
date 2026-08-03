/**
 * Stanowisko: Administracja magazynem
 * Wejście: /administracja-magazynem
 */

export const ADMINISTRACJA_ROOT = "/administracja-magazynem";

export type AdministracjaLink = {
  title: string;
  description: string;
  to: string;
};

export const ADMINISTRACJA_LINKS: AdministracjaLink[] = [
  {
    title: "Layout magazynu",
    description: "Projektant układu magazynu.",
    to: "/designer",
  },
  {
    title: "Regały",
    description: "Struktura regałów.",
    to: "/carts/racks",
  },
  {
    title: "Lokalizacje / wózki",
    description: "Wózki i jednostki floty.",
    to: "/carts/bulk",
  },
  {
    title: "Strefy",
    description: "Strefy magazynowe.",
    to: "/carts/zones",
  },
  {
    title: "Nośniki",
    description: "Słownik nośników.",
    to: "/carts/carriers",
  },
  {
    title: "Konfiguracja WMS",
    description: "Ustawienia procesów i stanowisk.",
    to: "/settings/wms",
  },
  {
    title: "Szablony etykiet",
    description: "Szablony etykiet magazynowych.",
    to: "/templates/labels",
  },
  {
    title: "Planer floty",
    description: "Konfiguracja i planowanie floty.",
    to: "/carts/optimizer",
  },
  {
    title: "BDO",
    description: "Opakowania i raport środowiskowy.",
    to: "/warehouse/bdo",
  },
  {
    title: "Inwentaryzacja (planowanie)",
    description: "Planowanie inwentaryzacji (nie terminal hali).",
    to: "/inventory-count/dashboard",
  },
  {
    title: "Szkody",
    description: "Rejestr szkód biurowych.",
    to: "/office/damages",
  },
  {
    title: "Protokoły szkód",
    description: "Protokoły szkód.",
    to: "/office/damage-reports",
  },
];
