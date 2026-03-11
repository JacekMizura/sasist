import { useMemo } from "react";
import type { LayoutState, RackState, CustomRackTemplate } from "../../types/warehouse";
import { UI_STRINGS } from "../../constants/uiStrings";

export interface UseDesignerTemplateSummaryParams {
  layout: LayoutState;
  customTemplates: CustomRackTemplate[];
}

export function useDesignerTemplateSummary(params: UseDesignerTemplateSummaryParams) {
  const { layout, customTemplates } = params;

  const summaryByTemplate = useMemo(() => {
    const keyToRacks = new Map<string, RackState[]>();
    for (const r of layout.racks) {
      const key = r.templateId ?? "__preset__";
      if (!keyToRacks.has(key)) keyToRacks.set(key, []);
      keyToRacks.get(key)!.push(r);
    }
    return Array.from(keyToRacks.entries()).map(([templateKey, racks]) => {
      const first = racks[0]!;
      const template = templateKey !== "__preset__" ? customTemplates.find((t) => t.id === templateKey) : null;
      const templateName = template?.name ?? UI_STRINGS.warehouse.summary.presetLabel;
      const color = template?.color ?? first.color ?? "#3b82f6";
      const totalRacks = racks.length;
      const totalBins = racks.reduce((n, r) => n + (r.bins?.length ?? 0), 0);
      const reserveCount = racks.reduce((n, r) => n + (r.bins?.filter((b) => b.storage_type === "reserve").length ?? 0), 0);
      const capacityDm3 = racks.reduce((sum, r) => sum + (r.total_capacity_dm3 ?? r.bins.reduce((s, b) => s + (b.volume_dm3 ?? 0), 0)), 0);
      return {
        templateKey,
        templateName,
        color,
        width_cm: first.width_cm,
        depth_cm: first.length_cm,
        height_cm: first.height_cm,
        totalRacks,
        totalBins,
        reserveCount,
        capacityDm3,
      };
    });
  }, [layout.racks, customTemplates]);

  return { summaryByTemplate };
}
