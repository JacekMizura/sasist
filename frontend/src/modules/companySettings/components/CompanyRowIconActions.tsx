import { Archive, Pencil, Star } from "lucide-react";

import {
  productionListActionsInnerClass,
  productionRowActionBtn,
  productionRowActionBtnDanger,
} from "../../../pages/Production/productionRowActionTokens";

export type CompanyRowIconAction = {
  id: string;
  label: string;
  icon: "edit" | "default" | "archive";
  onClick?: () => void;
  disabled?: boolean;
};

const ICONS = {
  edit: Pencil,
  default: Star,
  archive: Archive,
} as const;

type Props = {
  actions: CompanyRowIconAction[];
};

export function CompanyRowIconActions({ actions }: Props) {
  if (actions.length === 0) return null;

  return (
    <div className={productionListActionsInnerClass}>
      {actions.map((action) => {
        const Icon = ICONS[action.icon];
        const btnClass = action.icon === "archive" ? productionRowActionBtnDanger : productionRowActionBtn;
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
              action.onClick?.();
            }}
          >
            <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
