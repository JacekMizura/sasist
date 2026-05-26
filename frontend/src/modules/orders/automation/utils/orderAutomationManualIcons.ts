import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Bell,
  Bolt,
  Box,
  ClipboardList,
  Download,
  FileText,
  Flag,
  Mail,
  MessageSquare,
  Package,
  Play,
  Printer,
  RefreshCw,
  Send,
  Settings,
  ShoppingCart,
  Tag,
  Truck,
  Upload,
  Zap,
} from "lucide-react";

export type ManualIconEntry = {
  key: string;
  label: string;
  category: string;
  Icon: LucideIcon;
};

export const MANUAL_ACTION_ICON_CATALOG: ManualIconEntry[] = [
  { key: "Zap", label: "Błyskawica", category: "Ogólne", Icon: Zap },
  { key: "Bolt", label: "Piorun", category: "Ogólne", Icon: Bolt },
  { key: "Flag", label: "Flaga", category: "Ogólne", Icon: Flag },
  { key: "Play", label: "Start", category: "Ogólne", Icon: Play },
  { key: "Package", label: "Paczka", category: "Magazyn", Icon: Package },
  { key: "Box", label: "Karton", category: "Magazyn", Icon: Box },
  { key: "Archive", label: "Archiwum", category: "Magazyn", Icon: Archive },
  { key: "Truck", label: "Wysyłka", category: "Wysyłka", Icon: Truck },
  { key: "ShoppingCart", label: "Koszyk", category: "Zamówienie", Icon: ShoppingCart },
  { key: "ClipboardList", label: "Lista", category: "Zamówienie", Icon: ClipboardList },
  { key: "Mail", label: "E-mail", category: "Komunikacja", Icon: Mail },
  { key: "MessageSquare", label: "Wiadomość", category: "Komunikacja", Icon: MessageSquare },
  { key: "Send", label: "Wyślij", category: "Komunikacja", Icon: Send },
  { key: "Bell", label: "Powiadomienie", category: "Komunikacja", Icon: Bell },
  { key: "Printer", label: "Druk", category: "Dokumenty", Icon: Printer },
  { key: "FileText", label: "Dokument", category: "Dokumenty", Icon: FileText },
  { key: "Download", label: "Pobierz", category: "Dokumenty", Icon: Download },
  { key: "Tag", label: "Tag", category: "Zamówienie", Icon: Tag },
  { key: "RefreshCw", label: "Odśwież", category: "System", Icon: RefreshCw },
  { key: "Settings", label: "Ustawienia", category: "System", Icon: Settings },
  { key: "Upload", label: "Wgraj", category: "System", Icon: Upload },
];

export function getManualIconEntry(key: string): ManualIconEntry {
  return MANUAL_ACTION_ICON_CATALOG.find((x) => x.key === key) ?? MANUAL_ACTION_ICON_CATALOG[0]!;
}

export function getManualIconComponent(key: string): LucideIcon {
  return getManualIconEntry(key).Icon;
}
