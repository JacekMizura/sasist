import { ChevronDown, ChevronRight, Lock } from "lucide-react";

import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import { PanelTreeCount } from "./PanelTreeCount";
import {
  PANEL_TREE_GROUP_DOT_CLASS,
  PANEL_TREE_GROUP_FILTER_BTN_CLASS,
  PANEL_TREE_GROUP_LABEL_CLASS,
  PANEL_TREE_GROUP_LOCK_CLASS,
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
  const accent = panelTreeGroupBarHex(mainGroup);

  return (
    <div className={panelTreeGroupContainerClass(active)}>
      <button type="button" onClick={onFilter} className={PANEL_TREE_GROUP_FILTER_BTN_CLASS}>
        <span className={PANEL_TREE_GROUP_DOT_CLASS} style={{ backgroundColor: accent }} aria-hidden />
        <span className={PANEL_TREE_GROUP_LABEL_CLASS}>{label}</span>
        <Lock className={PANEL_TREE_GROUP_LOCK_CLASS} strokeWidth={2} aria-hidden />
      </button>
      <PanelTreeCount value={count} active={active} colorHex={accent} variant="solid" />
      <button
        type="button"
        onClick={onToggle}
        className={PANEL_TREE_GROUP_TOGGLE_CLASS}
        aria-expanded={expanded}
        aria-label={expanded ? "Zwiń grupę" : "Rozwiń grupę"}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
    </div>
  );
}
