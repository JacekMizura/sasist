import type { OrderCustomFieldDto } from "../api/orderCustomFieldsApi";

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
  const m: Record<string, string> = {
    TEXT: "Tekst",
    NUMBER: "Liczba",
    FILES: "Załącznik",
    SELECT_SINGLE: "Lista",
    SELECT_MULTI: "Lista",
    SALES_DOCUMENT: "Dokument sprzedaży",
    SHIPPING_LABEL: "List przewozowy",
  };
  return m[type] ?? type;
}

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
      const multiline = Boolean((s.text as { multiline?: boolean } | undefined)?.multiline);
      return multiline ? "Długi tekst" : "Krótki tekst";
    }
    case "NUMBER": {
      const decimals = (s.number as { decimals?: number | null } | undefined)?.decimals ?? 2;
      return decimals === 0 ? "Integer" : "Decimal";
    }
    case "FILES": {
      const mode = String((s.files as { mode?: string } | undefined)?.mode ?? "documents");
      if (mode === "images") return "JPG/PNG";
      if (mode === "both") return "Dowolny plik";
      return "PDF";
    }
    case "SALES_DOCUMENT":
    case "SHIPPING_LABEL":
      return "—";
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
  const blob = `${row.id} ${row.name} ${row.slug} ${orderCustomFieldTypeLabel(row.type)}`.toLowerCase();
  return blob.includes(q);
}
