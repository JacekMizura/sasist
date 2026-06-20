import { CompactLabelColorPicker } from "../label/CompactLabelColorPicker";
import { PanelStatusConfiguratorPreview, type PanelStatusConfiguratorPreviewProps } from "./PanelStatusConfiguratorPreview";
import {
  PanelStatusStructureTree,
  type PanelStatusStructureTreeGroup,
} from "./PanelStatusStructureTree";
import type { PanelSidebarMainGroup } from "../../utils/panelSidebarHierarchy";

type Props = {
  preview: PanelStatusConfiguratorPreviewProps;
  summary: { groups: PanelStatusStructureTreeGroup[] } | null;
  mainGroupLabels: Record<PanelSidebarMainGroup, string>;
  mainGroupOrder: PanelSidebarMainGroup[];
  highlightStatusId?: number | null;
  highlightDraft?: {
    name: string;
    main_group: PanelSidebarMainGroup;
    subgroup_name?: string | null;
  } | null;
  counterColorHex?: string | null;
  onCounterColorChange?: (hex: string | null) => void;
};

export function PanelStatusConfiguratorAside({
  preview,
  summary,
  mainGroupLabels,
  mainGroupOrder,
  highlightStatusId,
  highlightDraft,
  counterColorHex,
  onCounterColorChange,
}: Props) {
  return (
    <div className="space-y-5">
      <PanelStatusConfiguratorPreview {...preview} counterColorHex={counterColorHex} />
      {onCounterColorChange ? (
        <div>
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Kolor licznika
          </span>
          <div className="flex flex-wrap items-end gap-3">
            <CompactLabelColorPicker
              label="Kolor licznika (opcjonalnie)"
              value={counterColorHex ?? "#64748b"}
              onChange={(hex) => onCounterColorChange(hex)}
            />
            {counterColorHex ? (
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                onClick={() => onCounterColorChange(null)}
              >
                Domyślny
              </button>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Bez koloru licznik pozostaje neutralny (szary).</p>
        </div>
      ) : null}
      <PanelStatusStructureTree
        groups={summary?.groups ?? []}
        mainGroupLabels={mainGroupLabels}
        mainGroupOrder={mainGroupOrder}
        highlightStatusId={highlightStatusId}
        highlightDraft={highlightDraft}
      />
    </div>
  );
}
