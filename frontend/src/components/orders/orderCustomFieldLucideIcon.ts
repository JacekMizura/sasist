import type { LucideIcon } from "lucide-react";

import { getBackendPublicOrigin } from "../../config/apiBase";
import {
  AlignLeft,
  Bookmark,
  Box,
  Building2,
  Calendar,
  File,
  FileText,
  Flag,
  FolderOpen,
  Hash,
  Image,
  Link2,
  List,
  ListChecks,
  Mail,
  MapPin,
  Package,
  Paperclip,
  Phone,
  Receipt,
  Search,
  ShoppingCart,
  Star,
  Tag,
  Truck,
  Type,
  User,
  Wallet,
} from "lucide-react";

/** Ikony dostępne w pickerze — stabilne nazwy exportów Lucide. */
export const ORDER_CUSTOM_FIELD_LUCIDE_ICONS: Record<string, LucideIcon> = {
  FileText,
  Type,
  AlignLeft,
  Hash,
  List,
  ListChecks,
  Paperclip,
  Receipt,
  Package,
  Truck,
  Box,
  Tag,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Image,
  File,
  FolderOpen,
  Link2,
  Bookmark,
  Flag,
  Star,
  Search,
  ShoppingCart,
  Wallet,
  Building2,
};

export const ORDER_CUSTOM_FIELD_ICON_KEYS = Object.keys(ORDER_CUSTOM_FIELD_LUCIDE_ICONS).sort();

export function getLucideIconByKey(key: string | null | undefined): LucideIcon | null {
  if (!key) return null;
  return ORDER_CUSTOM_FIELD_LUCIDE_ICONS[key] ?? null;
}

/** Domyślna ikona dla typu backend (gdy użytkownik nie wybierze własnej). */
export function defaultLucideIconKeyForBackendType(type: string): string {
  switch (type) {
    case "TEXT":
      return "FileText";
    case "NUMBER":
      return "Hash";
    case "SELECT_SINGLE":
    case "SELECT_MULTI":
      return "List";
    case "FILES":
      return "Paperclip";
    case "SALES_DOCUMENT":
      return "Receipt";
    case "SHIPPING_LABEL":
      return "Package";
    default:
      return "FileText";
  }
}

export function resolveOrderCustomFieldIcon(
  type: string,
  settings: Record<string, unknown> | null | undefined,
): LucideIcon {
  const raw = (settings?.ui as { icon?: string | null } | undefined)?.icon;
  const key = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
  const Icon = getLucideIconByKey(key);
  if (Icon) return Icon;
  const fallbackName = defaultLucideIconKeyForBackendType(type);
  return ORDER_CUSTOM_FIELD_LUCIDE_ICONS[fallbackName] ?? FileText;
}

/** Pełny URL do wyświetlenia obrazka (upload lub zewnętrzny https). */
export function resolvePublicAssetUrl(pathOrUrl: string): string {
  const s = (pathOrUrl || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  const origin = getBackendPublicOrigin();
  if (!origin) return s;
  return `${origin}${s.startsWith("/") ? "" : "/"}${s}`;
}

export type OrderCustomFieldGlyphResolved =
  | { kind: "image"; src: string }
  | { kind: "lucide"; Icon: LucideIcon };

/**
 * Własna ikona (PNG/SVG/WEBP lub URL zewnętrzny w ``settings.ui.custom_icon_url``)
 * ma pierwszeństwo przed Lucide.
 */
export function resolveOrderCustomFieldGlyph(
  type: string,
  settings: Record<string, unknown> | null | undefined,
): OrderCustomFieldGlyphResolved {
  const ui = settings?.ui as { custom_icon_url?: string | null } | undefined;
  const rawUrl = typeof ui?.custom_icon_url === "string" ? ui.custom_icon_url.trim() : "";
  if (rawUrl) {
    return { kind: "image", src: resolvePublicAssetUrl(rawUrl) };
  }
  const Icon = resolveOrderCustomFieldIcon(type, settings);
  return { kind: "lucide", Icon };
}
