import { useState, useCallback } from "react";
import type {
  LabelTemplate,
  LabelElement,
  GroupElement,
  RepeaterElement,
  BarcodeElement,
  StaticTextElement,
} from "../../../types/labelSystem";
import { UI_STRINGS } from "../../../constants/uiStrings";
import { generateId } from "../utils/id";
import { TemplateLibrary } from "./TemplateLibrary";

export type LabelLeftPanelProps = {
  template: LabelTemplate;
  addElement: (el: LabelElement) => void;
  onTemplateChange: (t: LabelTemplate) => void;
  setSelectedId: (id: string | null) => void;
  templateId?: number | null;
  presetModalOpen: boolean;
  setPresetModalOpen: (open: boolean) => void;
};

export function LabelLeftPanel({
  template,
  addElement,
  onTemplateChange,
  setSelectedId,
  templateId,
  presetModalOpen,
  setPresetModalOpen,
}: LabelLeftPanelProps) {
  const [rackBuilderOpen, setRackBuilderOpen] = useState(false);
  const [rackLocations, setRackLocations] = useState(4);
  const [rackSegmentWidth, setRackSegmentWidth] = useState(30);
  const [rackBarcodePosition, setRackBarcodePosition] = useState<"left" | "center" | "right">("center");

  const generateRackSection = useCallback(() => {
    const segW = Math.max(10, rackSegmentWidth);
    const segH = 15;
    const bcW = 25;
    const bcH = 10;
    const bcX =
      rackBarcodePosition === "left" ? 1 : rackBarcodePosition === "right" ? segW - bcW - 1 : (segW - bcW) / 2;
    const templateElements: LabelElement[] = [
      {
        id: generateId(),
        type: "barcode",
        x: bcX,
        y: 1,
        width: bcW,
        height: bcH,
        format: "Code128",
        dataBinding: "barcode_data",
        showValue: false,
        textPosition: "below",
      },
      {
        id: generateId(),
        type: "dynamicText",
        x: 1,
        y: bcH + 1.5,
        width: segW - 2,
        height: 4,
        binding: "barcode_data",
        fontSize: 6,
        align: rackBarcodePosition === "left" ? "left" : rackBarcodePosition === "right" ? "right" : "center",
      },
    ];
    const rep: RepeaterElement = {
      id: generateId(),
      type: "repeater",
      x: 5,
      y: 5,
      width: segW * Math.min(rackLocations, 20),
      height: segH,
      dataset: "segments",
      direction: "horizontal",
      itemWidth: segW,
      itemHeight: segH,
      template: { elements: templateElements },
    };
    onTemplateChange({
      ...template,
      elements: [...template.elements, rep],
      updatedAt: new Date().toISOString(),
    });
    setSelectedId(rep.id);
  }, [template, onTemplateChange, rackLocations, rackSegmentWidth, rackBarcodePosition, setSelectedId]);

  return (
    <aside className="w-44 shrink-0 flex flex-col gap-2 p-3 bg-white border-r border-[#E2E8F0] overflow-y-auto">
      <h3 className="text-xs font-bold text-slate-600">{UI_STRINGS.labels.designer.addElement}</h3>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => {
            const el: BarcodeElement = {
              id: generateId(),
              type: "barcode",
              x: 2,
              y: 2,
              width: 40,
              height: 12,
              format: "Code128",
              dataBinding: "barcode_data",
              showValue: false,
            };
            addElement(el);
          }}
          className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
        >
          {UI_STRINGS.labels.designer.barcode}
        </button>
        <button
          type="button"
          onClick={() => {
            const el: StaticTextElement = {
              id: generateId(),
              type: "staticText",
              x: 2,
              y: 2,
              width: 46,
              height: 4,
              text: "Tekst",
              fontSize: 8,
              align: "left",
            };
            addElement(el);
          }}
          className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
        >
          {UI_STRINGS.labels.designer.staticText}
        </button>
        <button
          type="button"
          onClick={() =>
            addElement({
              id: generateId(),
              type: "line",
              x: 2,
              y: 10,
              width: 46,
              height: 0,
              strokeWidth: 0.5,
            })
          }
          className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
        >
          {UI_STRINGS.labels.designer.line}
        </button>
        <button
          type="button"
          onClick={() =>
            addElement({
              id: generateId(),
              type: "rect",
              x: 2,
              y: 12,
              width: 46,
              height: 4,
              strokeWidth: 0.3,
            })
          }
          className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
        >
          {UI_STRINGS.labels.designer.rect}
        </button>
        <button
          type="button"
          onClick={() =>
            addElement({
              id: generateId(),
              type: "triangle",
              x: 2,
              y: 16,
              width: 20,
              height: 20,
              variant: "topLeft",
            } as LabelElement)
          }
          className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
        >
          Trójkąt
        </button>
        <button
          type="button"
          onClick={() =>
            addElement({
              id: generateId(),
              type: "arrow",
              x: 2,
              y: 36,
              width: 15,
              height: 10,
              direction: "right",
            } as LabelElement)
          }
          className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
        >
          Strzałka
        </button>
        <button
          type="button"
          onClick={() =>
            addElement({
              id: generateId(),
              type: "polygon",
              x: 2,
              y: 46,
              width: 25,
              height: 25,
              points: "0 0, 100% 0, 50% 100%",
            } as LabelElement)
          }
          className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
        >
          Wielokąt
        </button>
        <button
          type="button"
          onClick={() => {
            const group: GroupElement = {
              id: generateId(),
              type: "group",
              x: 5,
              y: 5,
              width: 60,
              height: 30,
              elements: [],
            };
            onTemplateChange({
              ...template,
              elements: [...template.elements, group],
              updatedAt: new Date().toISOString(),
            });
            setSelectedId(group.id);
          }}
          className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
        >
          Grupa
        </button>
        <button
          type="button"
          onClick={() =>
            addElement({
              id: generateId(),
              type: "section",
              x: 5,
              y: 5,
              width: 40,
              height: 20,
              backgroundColor: "#eab308",
              borderColor: "#000",
              borderWidth: 0.5,
            } as LabelElement)
          }
          className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
        >
          Sekcja (strefa)
        </button>
        <button
          type="button"
          onClick={() =>
            addElement({
              id: generateId(),
              type: "statusIcon",
              x: 2,
              y: 2,
              width: 8,
              height: 8,
              icon: "arrow_right",
            } as LabelElement)
          }
          className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
        >
          Ikona
        </button>
        <button
          type="button"
          onClick={() => {
            const rep: RepeaterElement = {
              id: generateId(),
              type: "repeater",
              x: 5,
              y: 5,
              width: 90,
              height: 20,
              dataset: "levels",
              direction: "horizontal",
              itemWidth: 30,
              template: { elements: [] },
            };
            onTemplateChange({
              ...template,
              elements: [...template.elements, rep],
              updatedAt: new Date().toISOString(),
            });
            setSelectedId(rep.id);
          }}
          className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
        >
          Powtarzacz
        </button>
      </div>

      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/80 overflow-hidden">
        <button
          type="button"
          onClick={() => setRackBuilderOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-100/80"
        >
          <span>Rack section builder</span>
          <span className="text-slate-400">{rackBuilderOpen ? "▼" : "▶"}</span>
        </button>
        {rackBuilderOpen && (
          <div className="px-2 pb-2 space-y-2">
            <div>
              <label className="text-[10px] text-slate-500">Liczba lokalizacji</label>
              <input
                type="number"
                min={1}
                max={50}
                value={rackLocations}
                onChange={(e) => setRackLocations(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">Szer. segmentu (mm)</label>
              <input
                type="number"
                min={10}
                value={rackSegmentWidth}
                onChange={(e) => setRackSegmentWidth(Math.max(10, Number(e.target.value) || 30))}
                className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">Pozycja kodu</label>
              <select
                value={rackBarcodePosition}
                onChange={(e) => setRackBarcodePosition(e.target.value as "left" | "center" | "right")}
                className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                <option value="left">Lewo</option>
                <option value="center">Środek</option>
                <option value="right">Prawo</option>
              </select>
            </div>
            <button
              type="button"
              onClick={generateRackSection}
              className="w-full px-2 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 text-white hover:bg-cyan-500"
            >
              Generuj
            </button>
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-500 mt-1">
        Przeciągnij zmienną z prawego panelu na etykietę, aby dodać kod kreskowy lub tekst.
      </p>
      <TemplateLibrary
        current={template}
        onLoad={(t) => onTemplateChange({ ...t, updatedAt: new Date().toISOString() })}
        presetModalOpen={presetModalOpen}
        setPresetModalOpen={setPresetModalOpen}
        templateId={templateId ?? undefined}
      />
    </aside>
  );
}
