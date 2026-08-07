import type { LucideIcon } from "lucide-react";

import type { OrderModuleCardProps, OrderMultiModuleDef, OrderMultiModuleId } from "../types";

export function createStubOrderModule(
  id: OrderMultiModuleId,
  label: string,
  group: string,
  icon?: LucideIcon,
  message = "W przygotowaniu.",
): OrderMultiModuleDef<Record<string, never>> {
  function StubCard(_props: OrderModuleCardProps<Record<string, never>>) {
    return <p className="text-xs text-amber-800">{message}</p>;
  }

  return {
    id,
    label,
    group,
    stage: 1,
    icon,
    defaultConfig: () => ({}),
    validate: () => message,
    Card: StubCard,
    toOps: () => {
      throw new Error(`${label} — w przygotowaniu.`);
    },
  };
}
