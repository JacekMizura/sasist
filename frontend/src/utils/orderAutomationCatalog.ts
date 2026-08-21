import type { AutomationEffectKind } from "../types/orderAutomation";

export type ConditionFieldDef = {
  key: string;
  label: string;
  category: string;
  valueKind: "status" | "text" | "number" | "multi";
  /** Backend evaluator supports this field at runtime. */
  backendSupported?: boolean;
  /** Shown in picker but disabled — not yet evaluable. */
  disabled?: boolean;
  disabledReason?: string;
};

/** Metadane pól warunków — bez listy statusów (statusy z API panelu). */
export const ORDER_AUTOMATION_CONDITION_FIELDS: ConditionFieldDef[] = [
  { key: "order_status", label: "Status zamówienia", category: "Zamówienie", valueKind: "multi", backendSupported: true },
  { key: "order_number", label: "Numer zamówienia", category: "Zamówienie", valueKind: "text", backendSupported: true },
  { key: "warehouse_id", label: "Magazyn", category: "Magazyn", valueKind: "multi", backendSupported: true },
  {
    key: "order_source",
    label: "Źródło zamówienia",
    category: "Zamówienie",
    valueKind: "multi",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    key: "order_tags",
    label: "Tagi",
    category: "Zamówienie",
    valueKind: "multi",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    key: "order_categories",
    label: "Kategorie",
    category: "Zamówienie",
    valueKind: "multi",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    key: "customer_email",
    label: "E-mail klienta",
    category: "Klient",
    valueKind: "text",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    key: "customer_group",
    label: "Grupa klienta",
    category: "Klient",
    valueKind: "text",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    key: "shipment_courier",
    label: "Przewoźnik",
    category: "Wysyłka",
    valueKind: "multi",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    key: "shipment_status",
    label: "Status przesyłki",
    category: "Wysyłka",
    valueKind: "multi",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    key: "payment_method",
    label: "Forma płatności",
    category: "Płatności",
    valueKind: "multi",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    key: "payment_status",
    label: "Status płatności",
    category: "Płatności",
    valueKind: "text",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    key: "order_total",
    label: "Wartość zamówienia",
    category: "Płatności",
    valueKind: "number",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    key: "product_sku",
    label: "SKU w zamówieniu",
    category: "Produkty",
    valueKind: "text",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    key: "document_type",
    label: "Typ dokumentu",
    category: "Dokumenty",
    valueKind: "text",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    key: "wms_stock_state",
    label: "Stan magazynowy WMS",
    category: "WMS",
    valueKind: "text",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    key: "allegro_account",
    label: "Konto Allegro",
    category: "Allegro",
    valueKind: "text",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    key: "integration_channel",
    label: "Kanał integracji",
    category: "Integracje",
    valueKind: "text",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    key: "custom_field",
    label: "Pole dodatkowe",
    category: "Pola własne",
    valueKind: "text",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
];

export const BACKEND_SUPPORTED_CONDITION_KEYS = new Set(
  ORDER_AUTOMATION_CONDITION_FIELDS.filter((f) => f.backendSupported).map((f) => f.key),
);

export const ORDER_AUTOMATION_OPERATOR_LABELS: Record<string, string> = {
  in: "jest jednym z",
  not_in: "nie jest jednym z",
  eq: "=",
  neq: "≠",
  contains: "zawiera",
};

/** Etykiety operatorów w UI reguły. */
export const ORDER_AUTOMATION_OPERATOR_UI: Record<string, string> = {
  in: "jest jednym z",
  not_in: "nie jest jednym z",
  eq: "jest równe",
  neq: "nie jest równe",
  contains: "zawiera",
};

export type EffectKindMeta = {
  kind: AutomationEffectKind;
  label: string;
  category: string;
  backendSupported?: boolean;
  disabled?: boolean;
  disabledReason?: string;
};

export const ORDER_AUTOMATION_EFFECT_KINDS: EffectKindMeta[] = [
  { kind: "change_status", label: "Zmień status", category: "Zamówienie", backendSupported: true },
  {
    kind: "send_message",
    label: "Wyślij wiadomość",
    category: "Komunikacja",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    kind: "generate_document",
    label: "Generuj dokument",
    category: "Dokumenty",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    kind: "assign_courier",
    label: "Przypisz kuriera",
    category: "Wysyłka",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    kind: "add_tag",
    label: "Dodaj tag",
    category: "Zamówienie",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    kind: "print",
    label: "Drukuj",
    category: "WMS",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
  {
    kind: "wms_action",
    label: "Akcja WMS",
    category: "WMS",
    disabled: true,
    disabledReason: "Jeszcze nieobsługiwane przez backend",
  },
];

export function conditionFieldLabel(key: string): string {
  return ORDER_AUTOMATION_CONDITION_FIELDS.find((f) => f.key === key)?.label ?? key;
}

export function effectKindLabel(kind: AutomationEffectKind): string {
  return ORDER_AUTOMATION_EFFECT_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}

/** Kolejność kategorii w pickerze warunków (krok 1 → pola). */
export const CONDITION_CATEGORY_ORDER = [
  "Zamówienie",
  "Klient",
  "Wysyłka",
  "Płatności",
  "Magazyn",
  "Produkty",
  "WMS",
  "Dokumenty",
  "Allegro",
  "Integracje",
  "Pola własne",
] as const;

export function conditionCategoryDisplayLabel(category: string): string {
  if (category === "Płatności") return "Płatność";
  return category;
}

export type AutomationPickerCategory = {
  id: string;
  label: string;
  items: { id: string; label: string; description?: string }[];
};

export function buildConditionCategorySteps(): AutomationPickerCategory[] {
  const byCat = new Map<string, AutomationPickerCategory["items"]>();
  for (const f of ORDER_AUTOMATION_CONDITION_FIELDS) {
    if (f.disabled) continue; // hide unsupported from active editor picker
    if (!byCat.has(f.category)) byCat.set(f.category, []);
    byCat.get(f.category)!.push({ id: f.key, label: f.label });
  }
  const out: AutomationPickerCategory[] = [];
  const seen = new Set<string>();
  for (const cat of CONDITION_CATEGORY_ORDER) {
    const items = byCat.get(cat);
    if (!items?.length) continue;
    out.push({ id: cat, label: conditionCategoryDisplayLabel(cat), items });
    seen.add(cat);
  }
  for (const [cat, items] of byCat.entries()) {
    if (seen.has(cat) || !items.length) continue;
    out.push({ id: cat, label: conditionCategoryDisplayLabel(cat), items });
  }
  return out;
}

/** Kolejność kategorii w pickerze akcji. */
export const EFFECT_CATEGORY_ORDER = ["Zamówienie", "Komunikacja", "Dokumenty", "Wysyłka", "WMS"] as const;

export function buildEffectCategorySteps(): AutomationPickerCategory[] {
  const byCat = new Map<string, AutomationPickerCategory["items"]>();
  for (const e of ORDER_AUTOMATION_EFFECT_KINDS) {
    if (e.disabled) continue;
    if (!byCat.has(e.category)) byCat.set(e.category, []);
    byCat.get(e.category)!.push({ id: e.kind, label: e.label });
  }
  const out: AutomationPickerCategory[] = [];
  const seen = new Set<string>();
  for (const cat of EFFECT_CATEGORY_ORDER) {
    const items = byCat.get(cat);
    if (!items?.length) continue;
    out.push({ id: cat, label: cat, items });
    seen.add(cat);
  }
  for (const [cat, items] of byCat.entries()) {
    if (seen.has(cat) || !items.length) continue;
    out.push({ id: cat, label: cat, items });
  }
  return out;
}
