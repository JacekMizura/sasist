import { Download } from "lucide-react";

import type { OrderMultiModuleDef, OrderModuleCardProps } from "../types";

function ExportCard(_props: OrderModuleCardProps<Record<string, never>>) {
  return (
    <p className="text-xs text-slate-600">Po wykonaniu multiakcji otworzy się okno eksportu zamówień.</p>
  );
}

export const exportModule: OrderMultiModuleDef<Record<string, never>> = {
  id: "export",
  label: "Eksport",
  group: "Inne",
  stage: 1,
  icon: Download,
  defaultConfig: () => ({}),
  validate: () => null,
  Card: ExportCard,
  toOps: () => [{ host: "export" }],
};
