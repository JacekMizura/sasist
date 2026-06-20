import type { OrderCustomFieldDto } from "../api/orderCustomFieldsApi";

/** Etykiety głównego typu — zgodne z selectem „Typ pola” w konfiguracji (skrócone na liście). */
export const ORDER_CUSTOM_FIELD_TYPE_LABELS: Record<string, string> = {
  TEXT: "Tekst",
  NUMBER: "Liczba",
  FILES: "Pliki",
  SELECT_SINGLE: "Lista",
  SELECT_MULTI: "Lista",
  SALES_DOCUMENT: "Dokument sprzedaży",
  SHIPPING_LABEL: "List przewozowy",
};

/** Etykiety trybu plików — identyczne jak w formularzu („Typ plików”). */
export const ORDER_CUSTOM_FIELD_FILES_MODE_LABELS: Record<string, string> = {
  documents: "Dokumenty",
  images: "Zdjęcia",
  both: "Zdjęcia i dokumenty",
};

/** Wiersz administracyjny — rozszerzenia widoczności na przyszłość (bez kolumn w UI). */
export type OrderCustomFieldAdminRow = {
  field: OrderCustomFieldDto;
  flags: {
    isActive: boolean;
    isRequired: boolean;
    visibleOnList: boolean;
    visibleOnForm: boolean;
    visibleInApi: boolean;
  };
};

export function mapOrderCustomFieldAdminRow(dto: OrderCustomFieldDto): OrderCustomFieldAdminRow {
  const future = (dto.settings_json?.future ?? {}) as Record<string, unknown>;
  return {
    field: dto,
    flags: {
      isActive: dto.is_active,
      isRequired: Boolean(future.required),
      visibleOnList: future.visible_on_list !== false,
      visibleOnForm: future.visible_on_form !== false,
      visibleInApi: future.visible_in_api !== false,
    },
  };
}

export function orderCustomFieldTypeLabel(type: string): string {
  return ORDER_CUSTOM_FIELD_TYPE_LABELS[type] ?? type;
}

function textFormatHint(subtype: string): string | null {
  if (subtype === "email") return "E-mail";
  if (subtype === "url") return "URL";
  return null;
}

function filesModeDisplayLabel(mode: string): string {
  const base = ORDER_CUSTOM_FIELD_FILES_MODE_LABELS[mode] ?? ORDER_CUSTOM_FIELD_FILES_MODE_LABELS.documents;
  if (mode === "documents") return `${base} (PDF)`;
  return base;
}

/**
 * Szczegół konfiguracji typu — to samo, co w sekcji „Konfiguracja pola” edytora.
 */
export function orderCustomFieldKindLabel(
  type: string,
  settings: Record<string, unknown> | null | undefined,
): string {
  const s = settings ?? {};
  switch (type) {
    case "SELECT_SINGLE":
      return "Jednokrotny wybór";
    case "SELECT_MULTI":
      return "Wielokrotny wybór";
    case "TEXT": {
      const text = s.text as { multiline?: boolean; subtype?: string } | undefined;
      const lengthLabel = text?.multiline ? "Długi tekst" : "Krótki tekst";
      const hint = textFormatHint(String(text?.subtype ?? "any"));
      return hint ? `${lengthLabel} · ${hint}` : lengthLabel;
    }
    case "NUMBER": {
      const decimals = (s.number as { decimals?: number | null } | undefined)?.decimals ?? 2;
      if (decimals === 0) return "Liczba całkowita";
      return `Liczba dziesiętna (${decimals})`;
    }
    case "FILES": {
      const mode = String((s.files as { mode?: string } | undefined)?.mode ?? "documents");
      return filesModeDisplayLabel(mode);
    }
    case "SALES_DOCUMENT":
      return "Powiązanie z dokumentem sprzedaży";
    case "SHIPPING_LABEL":
      return "Powiązanie z listem przewozowym";
    default:
      return "—";
  }
}

/** Ikona przypisana przez użytkownika (nie domyślna ikona typu). */
export function orderCustomFieldHasAssignedIcon(row: OrderCustomFieldDto): boolean {
  if (row.icon_file_id != null && row.icon_file_id > 0) return true;
  const ui = row.settings_json?.ui as Record<string, unknown> | undefined;
  if (typeof ui?.custom_icon_url === "string" && ui.custom_icon_url.trim() !== "") return true;
  if (typeof ui?.icon === "string" && ui.icon.trim() !== "") return true;
  return false;
}

export function orderCustomFieldCountLabel(count: number): string {
  if (count === 1) return "1 pole";
  if (count >= 2 && count <= 4) return `${count} pola`;
  return `${count} pól`;
}

export function orderCustomFieldMatchesSearch(row: OrderCustomFieldDto, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const settings = (row.settings_json ?? {}) as Record<string, unknown>;
  const blob = [
    row.id,
    row.name,
    row.slug,
    orderCustomFieldTypeLabel(row.type),
    orderCustomFieldKindLabel(row.type, settings),
  ]
    .join(" ")
    .toLowerCase();
  return blob.includes(q);
}
