import { Trash2 } from "lucide-react";

import type { OrderMultiModuleDef, OrderModuleCardProps } from "../types";

function DeleteCard(_props: OrderModuleCardProps<Record<string, never>>) {
  return (
    <p className="text-xs text-red-700">
      Zaznaczone zamówienia zostaną usunięte (lub zarchiwizowane, gdy mają powiązaną historię).
    </p>
  );
}

export const deleteModule: OrderMultiModuleDef<Record<string, never>> = {
  id: "delete",
  label: "Usunięcie",
  group: "Inne",
  stage: 1,
  icon: Trash2,
  defaultConfig: () => ({}),
  validate: () => null,
  Card: DeleteCard,
  toOps: () => [{ host: "delete" }],
};
