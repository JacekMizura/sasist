import type {
  LabelTemplate,
  TemplateElement,
  LabelElement,
  VariableCategoryId,
  LabelVariable,
  TemplateType,
} from "../../../types/labelSystem";
import { useMemo, useState } from "react";
import { UI_STRINGS } from "../../../constants/uiStrings";
import { LABEL_VARIABLE_CATEGORIES } from "../../../types/labelSystem";
import {
  filterWarehouseVariablesForGroupedLocation,
  groupedElementSlotArrowLabel,
  partitionGroupedWarehouseItems,
} from "../../../labelSystem/locationGroupedVariables";
import { ElementProperties } from "./ElementProperties";
import { snapToGrid } from "../utils/grid";
import { Search, SlidersHorizontal } from "lucide-react";

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
  /** Sample / preview record so condition fields list only keys present at runtime. */
  conditionFieldRecord?: Record<string, unknown> | null;
  templateType?: TemplateType | null;
  /** Location + merged CSV: warehouse palette shows slot titles (Piętro 1…) + token. */
  groupedLocationPalette?: boolean;
  /** Split layout for tabbed right panel: full (default) | variables | properties only. */
  mode?: "full" | "variables" | "properties";
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
  conditionFieldRecord,
  templateType,
  groupedLocationPalette = false,
  mode = "full",
}: LabelInspectorPanelProps) {
  const [variableSearch, setVariableSearch] = useState("");
  const [variableCreateAs, setVariableCreateAs] = useState<"text" | "barcode" | "qr">("text");
  const layerSiblings = siblingElementsForLayer ?? template.elements;
  const showVars = mode === "full" || mode === "variables";
  const showProps = mode === "full" || mode === "properties";
  const hasSearch = variableSearch.trim().length > 0;
  const searchNeedle = variableSearch.trim().toLowerCase();

  const filteredCategories = useMemo(
    () =>
      variableCategories
        .map((cat) => ({
          ...cat,
          items: cat.items.filter((v) => {
            if (!hasSearch) return true;
            return (
              v.label.toLowerCase().includes(searchNeedle) ||
              v.token.toLowerCase().includes(searchNeedle) ||
              v.id.toLowerCase().includes(searchNeedle)
            );
          }),
        }))
        .filter((cat) => cat.items.length > 0),
    [variableCategories, hasSearch, searchNeedle],
  );

  const getVarGlyph = (token: string): string => {
    const bare = token.replace(/[{}]/g, "").toLowerCase();
    if (bare.includes("barcode") || bare.includes("ean")) return "|||";
    if (bare === "image") return "IMG";
    return "T";
  };

  const startVariableDrag = (
    e: React.DragEvent,
    token: string,
    dataset?: string,
  ) => {
    const payload = { name: token, dataset, createAs: variableCreateAs };
    e.dataTransfer.setData("application/x-label-variable", JSON.stringify(payload));
    e.dataTransfer.setData("text/plain", token);
    e.dataTransfer.effectAllowed = "copy";
  };

  const variablesBlock = (
    <div>
      <h3 className="mb-1.5 text-[11px] font-semibold text-slate-800">{UI_STRINGS.labels.panel.variables}</h3>
      <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
        Przeciągnij zmienną na etykietę. Kody kreskowe automatycznie tworzą element kodu.
      </p>
      <label className="mb-2 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
        <Search className="h-3.5 w-3.5 text-slate-400" />
        <input
          value={variableSearch}
          onChange={(e) => setVariableSearch(e.target.value)}
          placeholder="Szukaj zmiennej..."
          className="w-full border-0 bg-transparent text-[12px] text-slate-700 outline-none placeholder:text-slate-400"
        />
      </label>
      <label className="mb-2 block text-[11px] text-slate-600">
        <span className="mb-1 block">Utwórz jako</span>
        <select
          value={variableCreateAs}
          onChange={(e) => setVariableCreateAs(e.target.value as "text" | "barcode" | "qr")}
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-700"
        >
          <option value="text">Tekst</option>
          <option value="barcode">Kod kreskowy</option>
          <option value="qr">Kod QR</option>
        </select>
      </label>
      <div className="space-y-1.5">
        {filteredCategories.map((cat, idx) => {
          const collapseKey = `var::${cat.id}`;
          const isCollapsed = collapseKey in collapsedCategories ? collapsedCategories[collapseKey] : idx > 0;
          const categoryLabel =
            (UI_STRINGS.labels.categories as Record<string, string>)[cat.id] ?? cat.label;
          const baseRows =
            groupedLocationPalette && cat.id === "warehouse"
              ? filterWarehouseVariablesForGroupedLocation(
                  LABEL_VARIABLE_CATEGORIES.find((c) => c.id === "warehouse")?.items ?? cat.items,
                )
              : cat.items;
          const grouped = partitionGroupedWarehouseItems(baseRows);
          const rows =
            groupedLocationPalette && cat.id === "warehouse"
              ? [...grouped.common, ...grouped.elements, ...grouped.other]
              : baseRows;
          return (
            <div key={cat.id} className="overflow-hidden rounded-lg border border-slate-200/80 bg-white">
              <button
                type="button"
                onClick={() => setCollapsedCategories((prev) => ({ ...prev, [collapseKey]: !isCollapsed }))}
                className="flex w-full items-center justify-between px-2.5 py-1.5 text-left hover:bg-slate-50"
              >
                <span className="text-[11px] font-semibold text-slate-700">{categoryLabel}</span>
                <span className="text-[10px] text-slate-400">{isCollapsed ? "▶" : "▼"}</span>
              </button>
              {!isCollapsed && (
                <div className="border-t border-slate-100">
                  {rows.map((v) => (
                    <div
                      key={v.id}
                      draggable
                      onDragStart={(e) => startVariableDrag(e, v.token)}
                      className="group flex cursor-grab items-center gap-2 border-l-2 border-transparent px-2.5 py-1.5 transition hover:border-cyan-200 hover:bg-cyan-50/40 active:cursor-grabbing active:bg-cyan-50"
                      title={`${v.label} — ${v.token}`}
                    >
                      <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-slate-100 px-1 font-mono text-[9px] font-semibold text-slate-600">
                        {getVarGlyph(v.token)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-medium text-slate-800">{v.label}</span>
                        <span className="block truncate font-mono text-[9px] text-slate-500">{v.token}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filteredCategories.length === 0 && (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
            Brak wyników dla podanej frazy.
          </p>
        )}
      </div>
    </div>
  );

  const propertiesBlock = (
    <div className={showVars ? "mt-1 border-t border-slate-100/90 pt-2.5" : ""}>
      {selected ? (
        <div className="space-y-2">
          {"width" in selected && (
            <>
              <details open className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <summary className="cursor-pointer list-none px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">
                  Pozycja i rozmiar
                </summary>
                <div className="grid grid-cols-2 gap-1.5 border-t border-slate-100 px-2.5 py-2">
                  {[
                    ["X", "x", selected.x, 0, Math.max(0, template.widthMm - selected.width)],
                    ["Y", "y", selected.y, 0, Math.max(0, template.heightMm - selected.height)],
                    ["Szer.", "width", selected.width, 0.5, template.widthMm],
                    ["Wys.", "height", selected.height, 0.5, template.heightMm],
                  ].map(([label, key, value, min, max]) => (
                    <label key={String(key)} className="space-y-0.5 text-[10px] text-slate-500">
                      <span>{label}</span>
                      <input
                        type="number"
                        step={0.5}
                        min={Number(min)}
                        max={Number(max)}
                        value={Number(value)}
                        onChange={(e) =>
                          updateElement(selected.id, {
                            [key]: Math.max(Number(min), Math.min(Number(e.target.value) || 0, Number(max))),
                          } as Partial<TemplateElement>)
                        }
                        className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-800"
                      />
                    </label>
                  ))}
                </div>
              </details>

              <details open className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <summary className="cursor-pointer list-none px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">
                  Obrót i warstwa
                </summary>
                <div className="space-y-2 border-t border-slate-100 px-2.5 py-2">
                  <label className="space-y-0.5 text-[10px] text-slate-500">
                    <span>Obrót</span>
                    <input
                      type="number"
                      min={0}
                      max={360}
                      step={1}
                      value={selected.rotation ?? 0}
                      onChange={(e) => updateElement(selected.id, { rotation: Number(e.target.value) || 0 })}
                      className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-800"
                    />
                  </label>
                  {selected.type !== "group" && selected.type !== "repeater" && (
                    <>
                      <label className="space-y-0.5 text-[10px] text-slate-500">
                        <span>Warstwa (z-index)</span>
                        <input
                          type="number"
                          value={(selected as LabelElement).zIndex ?? 0}
                          onChange={(e) => updateElement(selected.id, { zIndex: Number(e.target.value) || 0 })}
                          className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-800"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-700 hover:bg-slate-100"
                          onClick={() => {
                            const allZ = layerSiblings.map((e) => (e as { zIndex?: number }).zIndex ?? 0);
                            updateElement(selected.id, { zIndex: (allZ.length ? Math.max(...allZ) : 0) + 1 });
                          }}
                        >
                          Na wierzch
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-700 hover:bg-slate-100"
                          onClick={() => updateElement(selected.id, { zIndex: ((selected as LabelElement).zIndex ?? 0) + 1 })}
                        >
                          Wyżej
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-700 hover:bg-slate-100"
                          onClick={() => updateElement(selected.id, { zIndex: ((selected as LabelElement).zIndex ?? 0) - 1 })}
                        >
                          Niżej
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-700 hover:bg-slate-100"
                          onClick={() => {
                            const allZ = layerSiblings.map((e) => (e as { zIndex?: number }).zIndex ?? 0);
                            updateElement(selected.id, { zIndex: (allZ.length ? Math.min(...allZ) : 0) - 1 });
                          }}
                        >
                          Na spód
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </details>
            </>
          )}

          {"width" in selected && (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">
                Wyrównanie
              </div>
              <div className="space-y-1.5 px-2.5 py-2">
                <div className="grid grid-cols-3 gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
                  <button type="button" title="Do lewej" className="rounded bg-white py-1 text-[11px] text-slate-700 hover:bg-slate-100" onClick={() => updateElement(selected.id, { x: snapToGrid(0) })}>←</button>
                  <button type="button" title="Wyśrodkuj poziomo" className="rounded bg-white py-1 text-[11px] text-slate-700 hover:bg-slate-100" onClick={() => updateElement(selected.id, { x: snapToGrid(Math.max(0, (template.widthMm - selected.width) / 2)) })}>↔</button>
                  <button type="button" title="Do prawej" className="rounded bg-white py-1 text-[11px] text-slate-700 hover:bg-slate-100" onClick={() => updateElement(selected.id, { x: snapToGrid(Math.max(0, template.widthMm - selected.width)) })}>→</button>
                </div>
                <div className="grid grid-cols-3 gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
                  <button type="button" title="Do góry" className="rounded bg-white py-1 text-[11px] text-slate-700 hover:bg-slate-100" onClick={() => updateElement(selected.id, { y: snapToGrid(0) })}>↑</button>
                  <button type="button" title="Wyśrodkuj pionowo" className="rounded bg-white py-1 text-[11px] text-slate-700 hover:bg-slate-100" onClick={() => updateElement(selected.id, { y: snapToGrid(Math.max(0, (template.heightMm - selected.height) / 2)) })}>↕</button>
                  <button type="button" title="Do dołu" className="rounded bg-white py-1 text-[11px] text-slate-700 hover:bg-slate-100" onClick={() => updateElement(selected.id, { y: snapToGrid(Math.max(0, template.heightMm - selected.height)) })}>↓</button>
                </div>
              </div>
            </div>
          )}

          <details open className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <summary className="cursor-pointer list-none px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">
              Styl i właściwości elementu
            </summary>
            <div className="border-t border-slate-100 px-2.5 py-2">
              <ElementProperties
                element={selected}
                labelWidthMm={template.widthMm}
                labelHeightMm={template.heightMm}
                onUpdate={(patch) => updateElement(selected.id, patch)}
                onDelete={() => deleteElement(selected.id)}
                variableCategories={variableCategories}
                conditionFieldRecord={conditionFieldRecord}
                templateType={templateType ?? template.template_type ?? null}
                compactMode
              />
            </div>
          </details>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-4 text-center">
          <SlidersHorizontal className="mx-auto mb-1.5 h-4 w-4 text-slate-400" />
          <p className="text-[12px] font-medium text-slate-700">Nie wybrano elementu</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Kliknij element na etykiecie, aby edytować jego właściwości.
          </p>
        </div>
      )}
    </div>
  );

  const content = (
    <>
      {showVars ? variablesBlock : null}
      {showProps ? propertiesBlock : null}
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
