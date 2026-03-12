import type {
  TemplateElement,
  LabelElement,
  GroupElement,
  RepeaterElement,
  BarcodeElement,
  BarcodeFormat,
  BarcodeTextPosition,
  DynamicBinding,
  StatusIconType,
  SectionElement,
} from "../../../types/labelSystem";
import { DYNAMIC_BINDINGS } from "../../../types/labelSystem";
import { UI_STRINGS } from "../../../constants/uiStrings";

/** Clamp rotation to 0–360. */
function clampRotation(deg: number): number {
  const n = ((deg % 360) + 360) % 360;
  return Number.isFinite(n) ? n : 0;
}

/** Warehouse color palette: yellow, red, green, blue, black + zone colors. */
const ZONE_COLORS = [
  "#eab308", "#ef4444", "#22c55e", "#3b82f6", "#000000",
  "#f97316", "#8b5cf6", "#06b6d4", "#64748b", "#ffffff",
];

export function ElementProperties({
  element,
  labelWidthMm,
  labelHeightMm,
  onUpdate,
  onDelete,
}: {
  element: TemplateElement;
  labelWidthMm: number;
  labelHeightMm: number;
  onUpdate: (patch: Partial<TemplateElement>) => void;
  onDelete: () => void;
}) {
  const isGroup = element.type === "group";
  const isRepeater = element.type === "repeater";
  const isBarcode = element.type === "barcode";
  const isDynamicText = element.type === "dynamicText";
  const isStaticText = element.type === "staticText";
  const isStatusIcon = element.type === "statusIcon";
  const isSection = element.type === "section";
  const isShape = element.type === "triangle" || element.type === "arrow" || element.type === "polygon" || element.type === "rect" || element.type === "line";

  const maxX = Math.max(0, labelWidthMm - element.width);
  const maxY = Math.max(0, labelHeightMm - element.height);

  return (
    <div className="space-y-2 text-xs text-[#1E293B]">
      <div className="grid grid-cols-2 gap-1">
        <label className="text-slate-500">{UI_STRINGS.labels.elementProps.xMm}</label>
        <input
          type="number"
          step={0.5}
          min={0}
          max={maxX}
          value={element.x}
          onChange={(e) => onUpdate({ x: Math.max(0, Math.min(Number(e.target.value) || 0, maxX)) })}
          className="rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 w-20"
        />
        <label className="text-slate-500">{UI_STRINGS.labels.elementProps.yMm}</label>
        <input
          type="number"
          step={0.5}
          min={0}
          max={maxY}
          value={element.y}
          onChange={(e) => onUpdate({ y: Math.max(0, Math.min(Number(e.target.value) || 0, maxY)) })}
          className="rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 w-20"
        />
        <label className="text-slate-500">{UI_STRINGS.labels.elementProps.widthMm}</label>
        <input
          type="number"
          step={0.5}
          min={0.5}
          max={labelWidthMm}
          value={element.width}
          onChange={(e) => onUpdate({ width: Math.max(0.5, Math.min(Number(e.target.value) || 0, labelWidthMm)) })}
          className="rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 w-20"
        />
        <label className="text-slate-500">{UI_STRINGS.labels.elementProps.heightMm}</label>
        <input
          type="number"
          step={0.5}
          min={0.5}
          max={labelHeightMm}
          value={element.height}
          onChange={(e) => onUpdate({ height: Math.max(0.5, Math.min(Number(e.target.value) || 0, labelHeightMm)) })}
          className="rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 w-20"
        />
      </div>
      {!isRepeater && (
        <div>
          <label className="text-slate-500">{UI_STRINGS.labels.elementProps.rotation}</label>
          <input
            type="number"
            min={0}
            max={360}
            step={1}
            value={String(clampRotation(element.rotation ?? 0))}
            onChange={(e) => onUpdate({ rotation: clampRotation(Number(e.target.value) || 0) })}
            className="rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 w-20"
          />
        </div>
      )}
      {!isGroup && !isRepeater && (
        <div>
          <label className="text-slate-500">Warstwa (z-index)</label>
          <input
            type="number"
            value={(element as LabelElement).zIndex ?? 0}
            onChange={(e) => onUpdate({ zIndex: Number(e.target.value) || 0 })}
            className="rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 w-full"
          />
        </div>
      )}
      {isSection && (
        <div className="border-t border-slate-100 pt-2 space-y-1">
          <label className="text-slate-500">Grubość obramowania (mm)</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={(element as SectionElement).borderWidth ?? 0.5}
            onChange={(e) => onUpdate({ borderWidth: Math.max(0, Number(e.target.value) || 0) })}
            className="w-full rounded border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px]"
          />
        </div>
      )}
      {!isGroup && !isRepeater && (
        <div className="border-t border-slate-100 pt-2 space-y-1">
          <label className="text-slate-500">Paleta stref (tło)</label>
          <div className="flex flex-wrap gap-1">
            {ZONE_COLORS.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => onUpdate({ backgroundColor: hex })}
                className="w-6 h-6 rounded border border-slate-200 hover:scale-110 transition-transform"
                style={{ backgroundColor: hex }}
                title={hex}
              />
            ))}
          </div>
          <label className="text-slate-500">{UI_STRINGS.labels.elementProps.backgroundColor}</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={(element as LabelElement).backgroundColor ?? "#ffffff"}
              onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
              className="w-8 h-6 rounded border border-[#E2E8F0] cursor-pointer"
            />
            <input
              type="text"
              value={(element as LabelElement).backgroundColor ?? ""}
              onChange={(e) => onUpdate({ backgroundColor: e.target.value || undefined })}
              placeholder="#ffffff"
              className="flex-1 rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5 text-[10px] font-mono"
            />
          </div>
          <label className="text-slate-500">{UI_STRINGS.labels.elementProps.textColor}</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={(element as LabelElement).textColor ?? "#000000"}
              onChange={(e) => onUpdate({ textColor: e.target.value })}
              className="w-8 h-6 rounded border border-[#E2E8F0] cursor-pointer"
            />
            <input
              type="text"
              value={(element as LabelElement).textColor ?? ""}
              onChange={(e) => onUpdate({ textColor: e.target.value || undefined })}
              placeholder="#000000"
              className="flex-1 rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5 text-[10px] font-mono"
            />
          </div>
          {isShape && (
            <>
              <label className="text-slate-500">Kolor obramowania</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={(element as LabelElement).borderColor ?? "#000000"}
                  onChange={(e) => onUpdate({ borderColor: e.target.value })}
                  className="w-8 h-6 rounded border border-[#E2E8F0] cursor-pointer"
                />
                <input
                  type="text"
                  value={(element as LabelElement).borderColor ?? ""}
                  onChange={(e) => onUpdate({ borderColor: e.target.value || undefined })}
                  placeholder="#000"
                  className="flex-1 rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5 text-[10px] font-mono"
                />
              </div>
            </>
          )}
        </div>
      )}
      {isGroup && (
        <p className="text-[10px] text-slate-500">Grupa: {(element as GroupElement).elements.length} elementów. Przesuń grupę, aby przenieść wszystkie.</p>
      )}
      {isRepeater && (
        <div className="space-y-1">
          <label className="text-slate-500">Dataset (np. levels, locations)</label>
          <input
            type="text"
            value={(element as RepeaterElement).dataset}
            onChange={(e) => onUpdate({ dataset: e.target.value })}
            className="w-full rounded border border-[#E2E8F0] bg-slate-50 px-2 py-0.5 text-[10px]"
            placeholder="locations"
          />
          <label className="text-slate-500">Kierunek</label>
          <select
            value={(element as RepeaterElement).direction}
            onChange={(e) => onUpdate({ direction: e.target.value as "horizontal" | "vertical" })}
            className="w-full rounded border border-[#E2E8F0] bg-slate-50 px-2 py-0.5 text-[10px]"
          >
            <option value="horizontal">Poziomo</option>
            <option value="vertical">Pionowo</option>
          </select>
          <label className="text-slate-500">Szer. elementu (mm)</label>
          <input
            type="number"
            min={1}
            value={(element as RepeaterElement).itemWidth}
            onChange={(e) => onUpdate({ itemWidth: Number(e.target.value) || 10 })}
            className="w-full rounded border border-[#E2E8F0] bg-slate-50 px-2 py-0.5 text-[10px]"
          />
          <label className="text-slate-500">Wys. elementu (mm)</label>
          <input
            type="number"
            min={1}
            value={(element as RepeaterElement).itemHeight ?? (element as RepeaterElement).itemWidth}
            onChange={(e) => onUpdate({ itemHeight: Number(e.target.value) || 10 })}
            className="w-full rounded border border-[#E2E8F0] bg-slate-50 px-2 py-0.5 text-[10px]"
          />
        </div>
      )}
      {isBarcode && (
        <>
          <div>
            <label className="text-slate-400">Format</label>
            <select
              value={element.format}
              onChange={(e) => onUpdate({ format: e.target.value as BarcodeFormat })}
              className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            >
              <option value="Code128">Code128</option>
              <option value="QR">QR Code</option>
              <option value="DataMatrix">DataMatrix</option>
            </select>
          </div>
          <div>
            <label className="text-slate-400">Powiązanie danych</label>
            <select
              value={element.dataBinding}
              onChange={(e) => onUpdate({ dataBinding: e.target.value as DynamicBinding })}
              className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            >
              {DYNAMIC_BINDINGS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={element.showValue ?? false}
              onChange={(e) => onUpdate({ showValue: e.target.checked })}
            />
            Pokaż wartość
          </label>
          <div>
            <label className="text-slate-400">Pozycja tekstu</label>
            <select
              value={(element as BarcodeElement).textPosition ?? "below"}
              onChange={(e) => onUpdate({ textPosition: e.target.value as BarcodeTextPosition })}
              className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            >
              <option value="below">Poniżej</option>
              <option value="above">Powyżej</option>
              <option value="hidden">Ukryty</option>
            </select>
          </div>
        </>
      )}
      {isDynamicText && (
        <>
          <div>
            <label className="text-slate-400">Powiązanie</label>
            <select
              value={element.binding}
              onChange={(e) => onUpdate({ binding: e.target.value as DynamicBinding })}
              className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            >
              {DYNAMIC_BINDINGS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <label className="text-slate-400">Rozmiar czcionki</label>
            <input
              type="number"
              min={4}
              max={72}
              value={element.fontSize ?? 10}
              onChange={(e) => onUpdate({ fontSize: Number(e.target.value) || 10 })}
              className="rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            />
            <label className="text-slate-400">Wyrównanie</label>
            <select
              value={element.align ?? "left"}
              onChange={(e) => onUpdate({ align: e.target.value as "left" | "center" | "right" })}
              className="rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            >
              <option value="left">Lewo</option>
              <option value="center">Środek</option>
              <option value="right">Prawo</option>
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={element.bold ?? false}
              onChange={(e) => onUpdate({ bold: e.target.checked })}
            />
            Pogrubienie
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={element.verticalText ?? false}
              onChange={(e) => onUpdate({ verticalText: e.target.checked })}
            />
            Tekst pionowy
          </label>
        </>
      )}
      {isStaticText && (
        <>
          <div>
            <label className="text-slate-400">Tekst</label>
            <input
              type="text"
              value={element.text}
              onChange={(e) => onUpdate({ text: e.target.value })}
              className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-1">
            <label className="text-slate-400">Rozmiar czcionki</label>
            <input
              type="number"
              min={4}
              max={72}
              value={element.fontSize ?? 8}
              onChange={(e) => onUpdate({ fontSize: Number(e.target.value) || 8 })}
              className="rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            />
            <label className="text-slate-400">Wyrównanie</label>
            <select
              value={element.align ?? "left"}
              onChange={(e) => onUpdate({ align: e.target.value as "left" | "center" | "right" })}
              className="rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            >
              <option value="left">Lewo</option>
              <option value="center">Środek</option>
              <option value="right">Prawo</option>
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={element.bold ?? false}
              onChange={(e) => onUpdate({ bold: e.target.checked })}
            />
            Pogrubienie
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={element.verticalText ?? false}
              onChange={(e) => onUpdate({ verticalText: e.target.checked })}
            />
            Tekst pionowy
          </label>
        </>
      )}
      {isStatusIcon && (
        <div>
          <label className="text-slate-400">Ikona</label>
          <select
            value={element.icon}
            onChange={(e) => onUpdate({ icon: e.target.value as StatusIconType })}
            className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
          >
            <option value="none">Brak</option>
            <option value="lock">Kłódka (rezerwa)</option>
            <option value="heavy_load">Ciężar (dolna półka)</option>
            <option value="hazard">Uwaga</option>
            <option value="arrow_up">Strzałka ↑</option>
            <option value="arrow_down">Strzałka ↓</option>
            <option value="arrow_left">Strzałka ←</option>
            <option value="arrow_right">Strzałka →</option>
          </select>
          <div>
            <label className="text-slate-400">Warunek</label>
            <select
              value={element.condition ?? "always"}
              onChange={(e) => onUpdate({ condition: e.target.value as "reserve" | "bottom_level" | "always" })}
              className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            >
              <option value="always">Zawsze</option>
              <option value="reserve">Tylko rezerwa</option>
              <option value="bottom_level">Tylko dolna półka</option>
            </select>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="mt-2 px-2 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-semibold hover:bg-red-200 border border-red-200"
      >
        {UI_STRINGS.labels.elementProps.deleteElement}
      </button>
    </div>
  );
}
