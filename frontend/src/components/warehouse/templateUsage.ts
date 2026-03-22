import type { CustomRackTemplate, LayoutState, RackType } from "../../types/warehouse";

export type TemplateUsageData = {
  templatesForSidebar: CustomRackTemplate[];
  usageCountById: Map<string, number>;
  usedTemplates: CustomRackTemplate[];
  availableTemplates: CustomRackTemplate[];
};

export function buildTemplateUsageData(
  layout: LayoutState,
  customTemplates: CustomRackTemplate[],
  showOnlyCatalog: boolean,
  rackTypeFilter?: RackType
): TemplateUsageData {
  const filteredTemplates =
    rackTypeFilter == null
      ? customTemplates
      : customTemplates.filter((t) => (t.rack_type ?? "warehouse") === rackTypeFilter);

  const usedTemplateIds = new Set(
    layout.racks
      .filter((r) => rackTypeFilter == null || (r.rack_type ?? "warehouse") === rackTypeFilter)
      .map((r) => r.templateId)
      .filter((id): id is string => Boolean(id))
  );

  const templatesForSidebar = showOnlyCatalog
    ? filteredTemplates.filter((t) => usedTemplateIds.has(t.id))
    : filteredTemplates;

  const usageCountById = new Map<string, number>();
  for (const t of templatesForSidebar) {
    usageCountById.set(
      t.id,
      layout.racks.filter((r) => r.templateId === t.id).length
    );
  }

  const usedTemplates = templatesForSidebar.filter(
    (t) => (usageCountById.get(t.id) ?? 0) > 0
  );
  const availableTemplates = templatesForSidebar.filter(
    (t) => (usageCountById.get(t.id) ?? 0) === 0
  );

  return { templatesForSidebar, usageCountById, usedTemplates, availableTemplates };
}
