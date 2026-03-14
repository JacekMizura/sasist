import type {
  LabelTemplate,
  TemplateElement,
  LabelElement,
  VariableCategoryId,
  LabelVariable,
} from "../../../types/labelSystem";
import { UI_STRINGS } from "../../../constants/uiStrings";
import { ElementProperties } from "./ElementProperties";
import { snapToGrid } from "../utils/grid";

export type LabelInspectorPanelProps = {
  template: LabelTemplate;
  selected: TemplateElement | null;
  updateElement: (id: string, patch: Partial<TemplateElement>) => void;
  deleteElement: (id: string) => void;
  collapsedCategories: Record<string, boolean>;
  setCollapsedCategories: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  variableCategories: Array<{ id: VariableCategoryId; label: string; items: LabelVariable[] }>;
  /** When selected is inside a repeater, pass repeater.template.elements for correct layer (z-index) sibling comparison. */
  siblingElementsForLayer?: TemplateElement[];
  /** When false, render inner content only (no aside wrapper). Used when panel is inside a shared sidebar. */
  wrapInAside?: boolean;
};

export function LabelInspectorPanel({
  template,
  selected,
  updateElement,
  deleteElement,
  collapsedCategories,
  setCollapsedCategories,
  variableCategories,
  siblingElementsForLayer,
  wrapInAside = true,
}: LabelInspectorPanelProps) {
  const layerSiblings = siblingElementsForLayer ?? template.elements;
  const content = (
    <>
      <div>
        <h3 className="text-xs font-black uppercase tracking-wide text-slate-600 mb-2">{UI_STRINGS.labels.panel.variables}</h3>
        <p className="text-[11px] text-slate-500 leading-relaxed mb-2">
          Przeciągnij zmienną na etykietę. Zmienne kodów kreskowych utworzą element kodu kreskowego.
        </p>
        <div className="space-y-2">
          {variableCategories.map((cat) => {
            const isCollapsed = collapsedCategories[cat.id];
            const categoryLabel = (UI_STRINGS.labels.categories as Record<string, string>)[cat.id] ?? cat.label;
            return (
              <div key={cat.id} className="rounded-xl border border-slate-100 bg-slate-50/80 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCollapsedCategories((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                  className="w-full flex items-center justify-between px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-100/80"
                >
                  <span>{categoryLabel}</span>
                  <span className="text-slate-400">{isCollapsed ? "▶" : "▼"}</span>
                </button>
                {!isCollapsed && (
                  <div className="px-2 pb-2 flex flex-col gap-1">
                    {cat.items.map((v) => (
                      <div
                        key={v.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/x-label-variable", v.token);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        className="px-3 py-2 rounded-lg bg-white border border-slate-100 text-[11px] font-mono text-slate-700 hover:bg-slate-100 hover:border-cyan-200 cursor-grab active:cursor-grabbing"
                        title={`Przeciągnij na etykietę: ${v.token}`}
                      >
                        {v.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3">
        {selected ? (
          <>
            {selected && "width" in selected && (
              <div className="mb-2">
                <span className="text-[10px] text-slate-500 uppercase block mb-1">Wyrównaj</span>
                <div className="flex flex-wrap gap-1">
                  <button type="button" title="Align left" className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600" onClick={() => updateElement(selected.id, { x: snapToGrid(0) })}>⬅</button>
                  <button type="button" title="Align center" className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600" onClick={() => updateElement(selected.id, { x: snapToGrid(Math.max(0, (template.widthMm - selected.width) / 2)) })}>↔</button>
                  <button type="button" title="Align right" className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600" onClick={() => updateElement(selected.id, { x: snapToGrid(Math.max(0, template.widthMm - selected.width)) })}>➡</button>
                  <button type="button" title="Align top" className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600" onClick={() => updateElement(selected.id, { y: snapToGrid(0) })}>⬆</button>
                  <button type="button" title="Align middle" className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600" onClick={() => updateElement(selected.id, { y: snapToGrid(Math.max(0, (template.heightMm - selected.height) / 2)) })}>↕</button>
                  <button type="button" title="Align bottom" className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600" onClick={() => updateElement(selected.id, { y: snapToGrid(Math.max(0, template.heightMm - selected.height)) })}>⬇</button>
                </div>
              </div>
            )}
            {selected && selected.type !== "group" && selected.type !== "repeater" && (
              <div className="mb-2">
                <span className="text-[10px] text-slate-500 uppercase block mb-1">Warstwa</span>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    title={UI_STRINGS.warehouse.visuals.toFront}
                    className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[10px]"
                    onClick={() => {
                      const allZ = layerSiblings.map((e) => (e as { zIndex?: number }).zIndex ?? 0);
                      updateElement(selected.id, { zIndex: (allZ.length ? Math.max(...allZ) : 0) + 1 });
                    }}
                  >
                    {UI_STRINGS.warehouse.visuals.toFront}
                  </button>
                  <button
                    type="button"
                    title={UI_STRINGS.warehouse.visuals.bringForward}
                    className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[10px]"
                    onClick={() => updateElement(selected.id, { zIndex: ((selected as LabelElement).zIndex ?? 0) + 1 })}
                  >
                    {UI_STRINGS.warehouse.visuals.bringForward}
                  </button>
                  <button
                    type="button"
                    title={UI_STRINGS.warehouse.visuals.sendBackward}
                    className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[10px]"
                    onClick={() => updateElement(selected.id, { zIndex: ((selected as LabelElement).zIndex ?? 0) - 1 })}
                  >
                    {UI_STRINGS.warehouse.visuals.sendBackward}
                  </button>
                  <button
                    type="button"
                    title={UI_STRINGS.warehouse.visuals.toBack}
                    className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[10px]"
                    onClick={() => {
                      const allZ = layerSiblings.map((e) => (e as { zIndex?: number }).zIndex ?? 0);
                      updateElement(selected.id, { zIndex: (allZ.length ? Math.min(...allZ) : 0) - 1 });
                    }}
                  >
                    {UI_STRINGS.warehouse.visuals.toBack}
                  </button>
                </div>
              </div>
            )}
            <h3 className="text-xs font-bold text-slate-600 mb-2">{UI_STRINGS.labels.panel.elementProperties}</h3>
            <ElementProperties
              element={selected}
              labelWidthMm={template.widthMm}
              labelHeightMm={template.heightMm}
              onUpdate={(patch) => updateElement(selected.id, patch)}
              onDelete={() => deleteElement(selected.id)}
              variableCategories={variableCategories}
            />
          </>
        ) : (
          <p className="text-xs text-slate-500">{UI_STRINGS.labels.panel.clickToEdit}</p>
        )}
      </div>
    </>
  );
  return wrapInAside ? (
    <aside className="w-72 shrink-0 flex flex-col gap-3 p-3 bg-white border-l border-[#E2E8F0] overflow-y-auto">
      {content}
    </aside>
  ) : (
    content
  );
}
