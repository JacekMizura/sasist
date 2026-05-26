import { useState, useCallback } from "react";
import type {
  LabelTemplate,
  LabelElement,
  GroupElement,
  RepeaterElement,
  BarcodeElement,
  StaticTextElement,
  ImageElement,
} from "../../../types/labelSystem";
import { generateId } from "../utils/id";
import { TemplateLibrary } from "./TemplateLibrary";
import { LABEL_IMAGE_TOOLBAR_PLACEHOLDER_DATA_URL } from "../../../labelSystem/labelImageToolbarPlaceholder";
import {
  Barcode,
  QrCode,
  Type,
  Image as ImageIcon,
  Minus,
  Square,
  Shapes,
  MoveRight,
  Layers,
  Box,
  LayoutGrid,
  Warehouse,
} from "lucide-react";

export type LabelLeftPanelProps = {
  template: LabelTemplate;
  addElement: (el: LabelElement) => void;
  onTemplateChange: (t: LabelTemplate) => void;
  setSelectedId: (id: string | null) => void;
  templateId?: number | null;
  presetModalOpen: boolean;
  setPresetModalOpen: (open: boolean) => void;
};

function ToolBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex w-full items-center gap-2 rounded-lg border border-transparent bg-white/90 px-2 py-1.5 text-left text-[11px] font-medium text-slate-700 shadow-sm ring-1 ring-slate-200/60 transition hover:border-cyan-200/80 hover:bg-cyan-50/40 hover:ring-cyan-200/50"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">{icon}</span>
      <span className="min-w-0 leading-tight">{label}</span>
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-1.5 mt-3 first:mt-0 text-[9px] font-bold uppercase tracking-wider text-slate-400 first:pt-0">{children}</h4>
  );
}

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
    const cellGroup: GroupElement = {
      id: generateId(),
      type: "group",
      x: 0,
      y: 0,
      width: segW,
      height: segH,
      elements: templateElements,
    };
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
      template: { elements: [cellGroup] },
    };
    onTemplateChange({
      ...template,
      elements: [...template.elements, rep],
      updatedAt: new Date().toISOString(),
    });
    setSelectedId(rep.id);
  }, [template, onTemplateChange, rackLocations, rackSegmentWidth, rackBarcodePosition, setSelectedId]);

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-0 border-r border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 shadow-[inset_-1px_0_0_rgba(148,163,184,0.12)]">
      <div className="border-b border-slate-200/80 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Narzędzia</p>
        <p className="text-[11px] leading-snug text-slate-500">Dodaj elementy na płótno</p>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2.5 py-2">
        <SectionTitle>Elementy</SectionTitle>
        <div className="space-y-1">
          <ToolBtn
            label="Kod kreskowy"
            icon={<Barcode className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
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
          />
          <ToolBtn
            label="Kod QR"
            icon={<QrCode className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
            onClick={() => {
              const el: BarcodeElement = {
                id: generateId(),
                type: "barcode",
                x: 2,
                y: 2,
                width: 20,
                height: 20,
                format: "QR",
                dataBinding: "barcode_data",
                showValue: false,
                qrDataMode: "dynamic",
                qrMargin: 0,
                qrErrorCorrection: "M",
                qrDarkColor: "#000000",
                qrLightColor: "#ffffff",
                qrTransparentBg: false,
                qrAutoScale: true,
                qrKeepAspect: true,
                qrHighQuality: true,
                qrPreset: "none",
              };
              addElement(el);
            }}
          />
          <ToolBtn
            label="Tekst"
            icon={<Type className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
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
          />
          <ToolBtn
            label="Ikona"
            icon={<Shapes className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
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
          />
          <ToolBtn
            label="Obraz"
            icon={<ImageIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
            onClick={() => {
              const el: ImageElement = {
                id: generateId(),
                type: "image",
                x: 4,
                y: 4,
                width: 30,
                height: 14,
                src: LABEL_IMAGE_TOOLBAR_PLACEHOLDER_DATA_URL,
                alt: "",
              };
              addElement(el);
            }}
          />
        </div>

        <SectionTitle>Kształty</SectionTitle>
        <div className="space-y-1">
          <ToolBtn
            label="Linia"
            icon={<Minus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
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
          />
          <ToolBtn
            label="Prostokąt"
            icon={<Square className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
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
          />
          <ToolBtn
            label="Wielokąt"
            icon={<LayoutGrid className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
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
          />
          <ToolBtn
            label="Strzałka"
            icon={<MoveRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
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
          />
        </div>

        <SectionTitle>Układ</SectionTitle>
        <div className="space-y-1">
          <ToolBtn
            label="Grupa"
            icon={<Layers className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
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
          />
          <ToolBtn
            label="Sekcja (strefa)"
            icon={<Box className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
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
          />
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50/90 via-white to-slate-50 shadow-md ring-1 ring-cyan-500/10">
          <button
            type="button"
            onClick={() => setRackBuilderOpen((o) => !o)}
            className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition hover:bg-white/70"
          >
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-600 text-white shadow-sm">
              <Warehouse className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-bold text-slate-900">Sekcja regałów</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-slate-600">
                Powtarzalny pas segmentów z kodem i etykietą — idealny na regał wielostrefowy.
              </span>
              <span className="mt-1 inline-block text-[10px] font-semibold text-cyan-800">{rackBuilderOpen ? "Zwiń opcje ▲" : "Skonfiguruj ▼"}</span>
            </span>
          </button>
          {rackBuilderOpen && (
            <div className="space-y-2 border-t border-cyan-100/80 bg-white/80 px-3 pb-3 pt-2">
              <div>
                <label className="text-[10px] font-medium text-slate-500">Liczba lokalizacji</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={rackLocations}
                  onChange={(e) => setRackLocations(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                  className="mt-0.5 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs shadow-inner"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-500">Szerokość segmentu (mm)</label>
                <input
                  type="number"
                  min={10}
                  value={rackSegmentWidth}
                  onChange={(e) => setRackSegmentWidth(Math.max(10, Number(e.target.value) || 30))}
                  className="mt-0.5 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs shadow-inner"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-slate-500">Pozycja kodu</label>
                <select
                  value={rackBarcodePosition}
                  onChange={(e) => setRackBarcodePosition(e.target.value as "left" | "center" | "right")}
                  className="mt-0.5 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
                >
                  <option value="left">Lewo</option>
                  <option value="center">Środek</option>
                  <option value="right">Prawo</option>
                </select>
              </div>
              <button
                type="button"
                onClick={generateRackSection}
                className="h-9 w-full rounded-lg bg-cyan-600 text-[11px] font-bold text-white shadow-sm hover:bg-cyan-500"
              >
                Generuj na płótnie
              </button>
            </div>
          )}
        </div>

        <p className="pt-2 text-[10px] leading-snug text-slate-500">
          Zmienne przeciągniesz z zakładki <span className="font-semibold text-slate-700">Zmienne</span> na prawy panel.
        </p>

        <TemplateLibrary
          current={template}
          onLoad={(t) => onTemplateChange({ ...t, updatedAt: new Date().toISOString() })}
          presetModalOpen={presetModalOpen}
          setPresetModalOpen={setPresetModalOpen}
          templateId={templateId ?? undefined}
        />
      </div>
    </aside>
  );
}
