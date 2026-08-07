import { PackageOpen } from "lucide-react";

import type { OrderMultiModuleDef, OrderModuleCardProps } from "../types";

function PackingQueueCard(_props: OrderModuleCardProps<Record<string, never>>) {
  return (
    <p className="text-xs text-slate-600">
      Po wykonaniu multiakcji zostaniesz przekierowany do kolejki pakowania WMS.
    </p>
  );
}

export const packingQueueModule: OrderMultiModuleDef<Record<string, never>> = {
  id: "packing_queue",
  label: "Dodanie do kolejki pakowania",
  group: "Magazyn",
  stage: 1,
  icon: PackageOpen,
  defaultConfig: () => ({}),
  validate: () => null,
  Card: PackingQueueCard,
  toOps: () => [{ host: "packing_queue" }],
};
