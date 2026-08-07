/**
 * Product custom field groups — same idea as order automation groups (tenant-local registry).
 * Membership is persisted on each field via settings_json.group (display name).
 */

export type ProductCustomFieldGroup = {
  id: string;
  name: string;
  sortOrder: number;
};

const UNGROUPED = "Bez grupy";

export const PRODUCT_CUSTOM_FIELD_UNGROUPED = UNGROUPED;

function storageKey(tenantId: number): string {
  return `productCustomField.groups.v1:${tenantId}`;
}

export function loadProductCustomFieldGroups(tenantId: number): ProductCustomFieldGroup[] {
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProductCustomFieldGroup[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((g) => g && typeof g.id === "string" && typeof g.name === "string")
      .map((g, i) => ({
        id: g.id,
        name: String(g.name).trim() || `Grupa ${i + 1}`,
        sortOrder: Number.isFinite(g.sortOrder) ? Number(g.sortOrder) : (i + 1) * 10,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pl"));
  } catch {
    return [];
  }
}

export function saveProductCustomFieldGroups(tenantId: number, groups: ProductCustomFieldGroup[]): void {
  const normalized = groups
    .map((g, i) => ({
      id: g.id,
      name: g.name.trim(),
      sortOrder: Number.isFinite(g.sortOrder) ? g.sortOrder : (i + 1) * 10,
    }))
    .filter((g) => g.name && g.name !== UNGROUPED);
  localStorage.setItem(storageKey(tenantId), JSON.stringify(normalized));
}

export function newProductCustomFieldGroupId(): string {
  return `pcfg-${Math.random().toString(36).slice(2, 10)}`;
}

export function getFieldGroupName(settings: Record<string, unknown> | null | undefined): string {
  const raw = settings?.group;
  if (typeof raw !== "string") return UNGROUPED;
  const name = raw.trim();
  return name || UNGROUPED;
}

export function withFieldGroupName(
  settings: Record<string, unknown> | null | undefined,
  groupName: string | null,
): Record<string, unknown> {
  const next = { ...(settings ?? {}) };
  const cleaned = (groupName ?? "").trim();
  if (!cleaned || cleaned === UNGROUPED) {
    delete next.group;
  } else {
    next.group = cleaned;
  }
  return next;
}
