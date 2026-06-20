import { Archive, Copy, Eye, Pencil } from "lucide-react";

import {
  productionListActionsInnerClass,
  productionRowActionBtn,
  productionRowActionBtnDanger,
} from "../productionRowActionTokens";

export type ProductionRowIconAction = {
  id: string;
  label: string;
  icon: "view" | "edit" | "duplicate" | "archive";
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
};

const ICONS = {
  view: Eye,
  edit: Pencil,
  duplicate: Copy,
  archive: Archive,
} as const;

type Props = {
  actions: ProductionRowIconAction[];
};

export function ProductionRowIconActions({ actions }: Props) {
  if (actions.length === 0) return null;

  return (
    <div className={productionListActionsInnerClass}>
      {actions.map((action) => {
        const Icon = ICONS[action.icon];
        const btnClass = action.danger ? productionRowActionBtnDanger : productionRowActionBtn;
        return (
          <button
            key={action.id}
            type="button"
            title={action.label}
            aria-label={action.label}
            disabled={action.disabled}
            className={btnClass}
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
            }}
          >
            <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
