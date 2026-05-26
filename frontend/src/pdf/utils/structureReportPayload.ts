import type { CustomRackTemplate, LayoutState } from "../../types/warehouse";
import {
  buildWarehouseStructureReportData,
  type WarehouseStructureReportData,
} from "../../reports/buildWarehouseStructureReportData";
import { buildStructurePdfMapPayload, type StructurePdfMapPayload } from "./buildStructurePdfViewModel";

export type WarehouseStructurePdfPayload = {
  data: WarehouseStructureReportData;
  map: StructurePdfMapPayload;
  exportDate: string;
};

export function buildWarehouseStructurePdfPayload(
  layout: LayoutState,
  customTemplates: CustomRackTemplate[]
): WarehouseStructurePdfPayload {
  return {
    data: buildWarehouseStructureReportData({ layout, customTemplates }),
    map: buildStructurePdfMapPayload(layout, customTemplates),
    exportDate: new Date().toLocaleString("pl-PL"),
  };
}
