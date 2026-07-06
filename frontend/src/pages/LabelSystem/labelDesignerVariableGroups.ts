import type { LabelVariable, VariableCategoryId } from "../../types/labelSystem";

export type VariableUiGroupId = "location" | "product" | "company" | "operator" | "system";

export type VariableUiGroup = {
  id: VariableUiGroupId;
  emoji: string;
  label: string;
  categoryIds: VariableCategoryId[];
};

export const VARIABLE_UI_GROUPS: VariableUiGroup[] = [
  {
    id: "location",
    emoji: "📍",
    label: "Lokalizacja",
    categoryIds: ["warehouse", "fleet"],
  },
  {
    id: "product",
    emoji: "📦",
    label: "Produkt",
    categoryIds: [
      "product_basic",
      "product_pricing",
      "product_logistics",
      "product_batch",
      "product_origin",
      "product_regulations",
      "product_media",
    ],
  },
  {
    id: "company",
    emoji: "🏢",
    label: "Firma",
    categoryIds: ["documents", "orders"],
  },
  {
    id: "operator",
    emoji: "👤",
    label: "Operator",
    categoryIds: ["cart", "basket"],
  },
  {
    id: "system",
    emoji: "⚙",
    label: "System",
    categoryIds: [],
  },
];

export function groupVariablesForDesigner(
  categories: Array<{ id: VariableCategoryId; label: string; items: LabelVariable[] }>,
): Array<{
  group: VariableUiGroup;
  items: Array<{ categoryId: VariableCategoryId; variable: LabelVariable }>;
}> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const assigned = new Set<VariableCategoryId>();

  const result = VARIABLE_UI_GROUPS.map((group) => {
    const items: Array<{ categoryId: VariableCategoryId; variable: LabelVariable }> = [];
    for (const catId of group.categoryIds) {
      const cat = byId.get(catId);
      if (!cat) continue;
      assigned.add(catId);
      for (const variable of cat.items) {
        items.push({ categoryId: catId, variable });
      }
    }
    return { group, items };
  }).filter((g) => g.items.length > 0);

  const leftovers: Array<{ categoryId: VariableCategoryId; variable: LabelVariable }> = [];
  for (const cat of categories) {
    if (assigned.has(cat.id)) continue;
    for (const variable of cat.items) {
      leftovers.push({ categoryId: cat.id, variable });
    }
  }
  if (leftovers.length > 0) {
    const systemGroup = VARIABLE_UI_GROUPS.find((g) => g.id === "system")!;
    result.push({ group: systemGroup, items: leftovers });
  }

  return result;
}
