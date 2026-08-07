import type { FamilyAttribute, FamilyAttributeValue, FamilyDisplayType } from "../../../api/productFamiliesApi";

export type DraftValue = {
  key: string;
  id?: number;
  name: string;
  color_hex: string;
};

export type DraftAttr = {
  key: string;
  id?: number;
  name: string;
  display_type: FamilyDisplayType;
  show_in_filters: boolean;
  sort_alpha: boolean;
  values: DraftValue[];
};

export function newKey() {
  return `k-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyValue(): DraftValue {
  return { key: newKey(), name: "", color_hex: "" };
}

export function emptyAttr(): DraftAttr {
  return {
    key: newKey(),
    name: "",
    display_type: "text",
    show_in_filters: false,
    sort_alpha: false,
    values: [emptyValue()],
  };
}

export function fromApiAttributes(attrs: FamilyAttribute[]): DraftAttr[] {
  if (!attrs.length) return [emptyAttr()];
  return attrs.map((ax) => ({
    key: `a-${ax.id ?? newKey()}`,
    id: ax.id,
    name: ax.name,
    display_type: (ax.display_type as FamilyDisplayType) || "text",
    show_in_filters: !!ax.show_in_filters,
    sort_alpha: !!ax.sort_alpha,
    values: (ax.values?.length ? ax.values : [{ name: "" } as FamilyAttributeValue]).map((v) => ({
      key: `v-${v.id ?? newKey()}`,
      id: v.id,
      name: v.name || "",
      color_hex: v.color_hex || "",
    })),
  }));
}

/** Live cartesian product size from named values (draft). */
export function draftCombinationCount(attrs: DraftAttr[]): number {
  const counts = attrs
    .filter((a) => a.name.trim())
    .map((a) => a.values.filter((v) => v.name.trim()).length)
    .filter((n) => n > 0);
  if (!counts.length) return 0;
  return counts.reduce((acc, n) => acc * n, 1);
}

export function draftAttributeCount(attrs: DraftAttr[]): number {
  return attrs.filter((a) => a.name.trim()).length;
}

export function displayTypeLabel(t: FamilyDisplayType): string {
  if (t === "color") return "Kolor";
  if (t === "image") return "Grafika";
  return "Tekst";
}
