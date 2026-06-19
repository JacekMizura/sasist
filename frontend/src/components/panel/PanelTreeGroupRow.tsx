import { ChevronDown, ChevronRight } from "lucide-react";

import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import { PanelTreeCount } from "./PanelTreeCount";
import {
  PANEL_TREE_GROUP_FILTER_BTN_CLASS,
  PANEL_TREE_GROUP_LABEL_CLASS,
  PANEL_TREE_GROUP_TOGGLE_CLASS,
  panelTreeGroupBarHex,
  panelTreeGroupContainerClass,
} from "./panelStatusTreeStyles";

type Props = {
  label: string;
  count: number;
  mainGroup: OrderUiMainGroup;
  expanded: boolean;
  active: boolean;
  onFilter: () => void;
  onToggle: () => void;
};

export function PanelTreeGroupRow({ label, count, mainGroup, expanded, active, onFilter, onToggle }: Props) {
  return (
    <div className={panelTreeGroupContainerClass(active)}>
      <button type="button" onClick={onFilter} className={PANEL_TREE_GROUP_FILTER_BTN_CLASS}>
        <span
          className="mt-1 h-4 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: panelTreeGroupBarHex(mainGroup) }}
          aria-hidden
        />
        <span className={PANEL_TREE_GROUP_LABEL_CLASS}>{label}</span>
      </button>
      <button
        type="button"
        onClick={onToggle}
        className={PANEL_TREE_GROUP_TOGGLE_CLASS}
        aria-expanded={expanded}
        aria-label={expanded ? "Zwiń grupę" : "Rozwiń grupę"}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      <PanelTreeCount value={count} active={active} />
    </div>
  );
}
