import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Columns3,
  Download,
  FileText,
  Landmark,
  Library,
  Package,
  Receipt,
  ScrollText,
  Truck,
} from "lucide-react";

export type DocumentsNavItem = {
  path: string;
  label: string;
  Icon: LucideIcon;
};

export type DocumentsNavSection = {
  title?: string;
  items: DocumentsNavItem[];
};

/** Left rail + main-nav fly-out: single source of truth for document destinations. */
export const DOCUMENTS_NAV_SECTIONS: DocumentsNavSection[] = [
  {
    title: "Sprzedaż",
    items: [
      { path: "/documents/sales/invoices", label: "Faktury", Icon: FileText },
      { path: "/documents/sales/receipts", label: "Paragony", Icon: Receipt },
    ],
  },
  {
    title: "Korekty",
    items: [{ path: "/documents/correcting", label: "Korekty sprzedaży", Icon: ScrollText }],
  },
  {
    title: "Magazynowe",
    items: [
      { path: "/documents/warehouse/pz", label: "PZ", Icon: Package },
      { path: "/documents/warehouse/wz", label: "WZ", Icon: Truck },
      { path: "/documents/warehouse/mm", label: "MM", Icon: ArrowLeftRight },
    ],
  },
  {
    items: [
      { path: "/documents/exports", label: "Eksporty", Icon: Download },
      { path: "/documents/series", label: "Serie dokumentów", Icon: Library },
      { path: "/documents/custom-fields", label: "Pola własne", Icon: Columns3 },
      { path: "/documents/ksef", label: "Konta KSeF", Icon: Landmark },
    ],
  },
];

export function documentsNavFlatPaths(): string[] {
  return DOCUMENTS_NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.path));
}
