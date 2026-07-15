import type { ReactNode } from "react";
import {
  Box,
  FileText,
  Package,
  ShoppingBasket,
  ShoppingCart,
  Warehouse,
} from "lucide-react";

export const TENANT_ID = 1;
export const PAGE_SIZE = 24;
export const UNGROUPED_ID = "__ungrouped__";

export const SORT_OPTIONS = [
  { value: "updated_at_desc", label: "Ostatnio edytowane" },
  { value: "name_asc", label: "Nazwa A–Z" },
  { value: "name_desc", label: "Nazwa Z–A" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];
export type ViewMode = "list" | "card";

export type TemplateRow = {
  id: number;
  tenant_id: number;
  group_id: number | null;
  name: string;
  template_type: string | null;
  template_json: string;
  created_at: string | null;
  updated_at: string | null;
};

export type TemplateWithMeta = TemplateRow & {
  widthMm?: number;
  heightMm?: number;
  is_default?: boolean;
};

export type GroupRow = {
  id: number;
  tenant_id: number;
  template_type: string;
  name: string;
  created_at: string | null;
  updated_at: string | null;
};

export function parseTemplateJson(templateJson: string): Record<string, unknown> {
  try {
    return JSON.parse(templateJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function formatEditedMeta(iso: string | null): string {
  if (!iso) return "Brak daty edycji";
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return "Edytowano dziś";
  return `Edytowano ${date.toLocaleDateString("pl-PL")}`;
}

export function getTypeIcon(type: string): ReactNode {
  switch (type) {
    case "location":
      return <Warehouse className="h-4 w-4" strokeWidth={2} aria-hidden />;
    case "cart":
      return <ShoppingCart className="h-4 w-4" strokeWidth={2} aria-hidden />;
    case "basket":
      return <ShoppingBasket className="h-4 w-4" strokeWidth={2} aria-hidden />;
    case "product":
      return <Package className="h-4 w-4" strokeWidth={2} aria-hidden />;
    case "order":
      return <Box className="h-4 w-4" strokeWidth={2} aria-hidden />;
    case "document_receipt":
    case "document_invoice":
    case "document_wz":
    case "document_correction":
      return <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />;
    default:
      return <Box className="h-4 w-4" strokeWidth={2} aria-hidden />;
  }
}

export function getCardPreviewSize(widthMm = 50, heightMm = 30): { width: number; height: number } {
  const safeHeight = Math.max(heightMm, 1);
  const ratio = widthMm / safeHeight;
  if (ratio >= 1.7) return { width: 304, height: 102 };
  if (ratio <= 1.1) return { width: 126, height: 126 };
  return { width: 244, height: 124 };
}

export function getListRowPreviewSize(
  widthMm = 50,
  heightMm = 30,
): { boxW: number; boxH: number; cw: number; ch: number } {
  const safeH = Math.max(heightMm, 1);
  const ratio = widthMm / safeH;
  const boxW = 112;
  const boxH = 72;
  if (ratio >= 1.65) return { boxW, boxH, cw: 100, ch: 38 };
  if (ratio <= 1.08) return { boxW, boxH, cw: 54, ch: 54 };
  return { boxW, boxH, cw: 90, ch: 48 };
}

export function getModalPreviewSize(widthMm = 50, heightMm = 30): { width: number; height: number } {
  const safeHeight = Math.max(heightMm, 1);
  const ratio = widthMm / safeHeight;
  const maxWidth = 760;
  const maxHeight = 360;
  const minWidth = 300;
  const minHeight = 180;

  let width = maxWidth;
  let height = Math.round(width / ratio);
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height * ratio);
  }
  width = Math.max(minWidth, width);
  height = Math.max(minHeight, height);
  return { width, height };
}
