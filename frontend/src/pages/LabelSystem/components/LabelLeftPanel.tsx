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
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Star,
} from "lucide-react";

export type LabelLeftPanelProps = {
  template: LabelTemplate;
  addElement: (el: LabelElement) => void;
  onTemplateChange: (t: LabelTemplate) => void;
  setSelectedId: (id: string | null) => void;
  templateId?: number | null;
  presetModalOpen: boolean;
  setPresetModalOpen: (open: boolean) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
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
      className="flex w-full items-center gap-2 rounded-lg border border-transparent bg-white px-2 py-1.5 text-left text-[11px] font-medium text-slate-700 shadow-sm ring-1 ring-slate-200/50 transition-all duration-150 hover:border-cyan-200/80 hover:bg-cyan-50/40 hover:ring-cyan-200/50"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
        {icon}
      </span>
      <span className="min-w-0 leading-tight">{label}</span>
    </button>
  );
}

function ToolSection({
  emoji,
  title,
  defaultOpen = true,
  children,
}: {
  emoji: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/70 bg-white/80 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors duration-150 hover:bg-slate-50/80"
      >
        <span className="text-sm leading-none" aria-hidden>
          {emoji}
        </span>
        <span className="flex-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">{title}</span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden />
        )}
      </button>
      {open ? <div className="space-y-1 border-t border-slate-100 px-2 pb-2 pt-1.5">{children}</div> : null}
    </section>
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
  collapsed = false,
  onToggleCollapsed,
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

  if (collapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center border-r border-slate-200/90 bg-white py-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          title="Pokaż panel narzędzi"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800"
        >
          <PanelLeftOpen className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 shadow-[inset_-1px_0_0_rgba(148,163,184,0.08)] transition-all duration-200">
      <div className="flex items-start justify-between gap-1 border-b border-slate-200/80 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Narzędzia</p>
          <p className="text-[11px] leading-snug text-slate-500">Dodaj elementy na płótno</p>
        </div>
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            title="Zwiń panel"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700"
          >
            <PanelLeftClose className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 py-2">
        <ToolSection emoji="📄" title="Tekst">
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
        </ToolSection>

        <ToolSection emoji="📦" title="Kody">
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
        </ToolSection>

        <ToolSection emoji="🖼" title="Grafika">
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
        </ToolSection>

        <ToolSection emoji="⬜" title="Kształty">
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
        </ToolSection>

        <ToolSection emoji="📐" title="Układ">
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
        </ToolSection>

        <section className="overflow-hidden rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white to-cyan-50/40 shadow-md ring-1 ring-violet-400/15">
          <div className="flex items-center gap-1.5 border-b border-violet-100/80 bg-white/50 px-2.5 py-1.5">
            <Star className="h-3.5 w-3.5 text-violet-600" strokeWidth={2} aria-hidden />
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-800">
              Inteligentne komponenty
            </span>
          </div>
          <div className="p-2">
            <div className="overflow-hidden rounded-lg border border-cyan-200/70 bg-gradient-to-br from-cyan-50/90 via-white to-slate-50 shadow-sm">
              <button
                type="button"
                onClick={() => setRackBuilderOpen((o) => !o)}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-white/70"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-700 text-white shadow-md">
                  <Warehouse className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold text-slate-900">Sekcja regałów</span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-slate-600">
                    Powtarzalny pas segmentów z kodem i etykietą — idealny na regał wielopoziomowy.
                  </span>
                  <span className="mt-1 inline-block text-[10px] font-semibold text-cyan-800">
                    {rackBuilderOpen ? "Zwiń opcje ▲" : "Skonfiguruj ▼"}
                  </span>
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
                    className="h-9 w-full rounded-lg bg-gradient-to-b from-cyan-500 to-cyan-600 text-[11px] font-bold text-white shadow-sm transition-colors duration-150 hover:from-cyan-400 hover:to-cyan-500"
                  >
                    Generuj na płótnie
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <p className="px-0.5 text-[10px] leading-snug text-slate-500">
          Zmienne przeciągnij z zakładki <span className="font-semibold text-slate-700">Zmienne</span> na etykietę.
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
