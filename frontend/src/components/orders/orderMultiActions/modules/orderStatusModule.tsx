import { ToggleLeft } from "lucide-react";

import { PanelStatusHierarchyPicker } from "../../../panel/PanelStatusHierarchyPicker";
import type { OrderMultiModuleDef, OrderModuleCardProps } from "../types";
import { pmaLab } from "../uiTokens";

export type OrderStatusConfig = {
  statusId: string;
};

function OrderStatusCard({ config, onChange, cardContext, disabled }: OrderModuleCardProps<OrderStatusConfig>) {
  const selectedStatusId = (() => {
    const raw = config.statusId ?? "";
    if (raw === "__clear__") return null;
    if (raw.trim() === "") return undefined;
    const n = Number(raw);
    return Number.isNaN(n) ? undefined : n;
  })();

  return (
    <div>
      <span className={pmaLab}>Status panelu</span>
      <div className="mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <PanelStatusHierarchyPicker
          panelSummary={cardContext.panelSummary}
          panelSubgroups={cardContext.panelSubgroups}
          disabled={disabled}
          showClearOption
          clearLabel="Usuń etykietę panelu"
          selectedStatusId={selectedStatusId}
          onPick={(id) =>
            onChange({
              statusId: id == null ? "__clear__" : String(id),
            })
          }
          listMaxHeightClass="max-h-[min(40vh,16rem)]"
        />
      </div>
    </div>
  );
}

export const orderStatusModule: OrderMultiModuleDef<OrderStatusConfig> = {
  id: "order_status",
  label: "Status zamówienia",
  group: "Statusy",
  stage: 1,
  icon: ToggleLeft,
  defaultConfig: () => ({ statusId: "" }),
  validate: (cfg) => {
    const sid = (cfg.statusId ?? "").trim();
    if (sid === "") return "Wybierz status lub opcję wyczyszczenia.";
    return null;
  },
  Card: OrderStatusCard,
  toOps: (cfg) => [
    {
      kind: "change_status",
      config: { change_status: { statusId: cfg.statusId } },
    },
  ],
};
