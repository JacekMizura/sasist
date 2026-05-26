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
  ConditionalStyleRule,
  LabelVariable,
  RectElement,
} from "../../../types/labelSystem";
import { DYNAMIC_BINDINGS } from "../../../types/labelSystem";
import type { TemplateType } from "../../../types/labelSystem";
import { UI_STRINGS } from "../../../constants/uiStrings";
import { ColorPicker } from "../../../components/label/ColorPicker";
import { recordHasConditionKey } from "../../../utils/labelLayoutEngine";

const CONDITION_OPERATORS = ["==", "!=", ">", "<"] as const;

/** Parse "if" expression like "{level} == 1" into { field, operator, value }. */
function parseConditionIf(expr: string): { field: string; operator: string; value: string } {
  const s = (expr ?? "").trim();
  const match = s.match(/^\s*\{?([a-zA-Z0-9_]+)\}?\s*(==|!=|>|<)\s*(.*)\s*$/s);
  if (match) {
    const [, field, op, value] = match;
    return { field: field ?? "", operator: op ?? "==", value: (value ?? "").trim() };
  }
  return { field: "", operator: "==", value: "" };
}

/** Build "if" expression from field, operator, value. */
function buildConditionIf(field: string, operator: string, value: string): string {
  const f = field.trim();
  const op = CONDITION_OPERATORS.includes(operator as (typeof CONDITION_OPERATORS)[number]) ? operator : "==";
  const v = value.trim();
  if (!f) return "";
  return `{${f}} ${op} ${v}`;
}

/** Clamp rotation to 0–360. */
function clampRotation(deg: number): number {
  const n = ((deg % 360) + 360) % 360;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Condition field dropdown: only keys that exist on the preview/print record (plus legacy `{key}` form).
 * Omits e.g. `level` when the record has no `level` (typical location labels use `loc_name`).
 */
function getConditionFieldOptions(
  variableCategories: Array<{ id: string; label: string; items: LabelVariable[] }> | undefined,
  record: Record<string, unknown> | null | undefined,
): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ value: string; label: string }> = [];
  const add = (id: string, label: string) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push({ value: id, label });
    }
  };
  const useRecord = record && Object.keys(record).length > 0;
  if (useRecord) {
    variableCategories?.forEach((cat) => {
      cat.items.forEach((item) => {
        if (recordHasConditionKey(record!, item.id)) add(item.id, item.label || item.id);
      });
    });
    for (const k of Object.keys(record!)) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)) continue;
      const v = record![k];
      if (v != null && typeof v === "object") continue;
      add(k, k);
    }
    return out;
  }
  variableCategories?.forEach((cat) => {
    cat.items.forEach((item) => add(item.id, item.label || item.id));
  });
  add("level", "level");
  add("position", "position");
  return out;
}

function buildDefaultConditionIf(fieldOptions: Array<{ value: string; label: string }>, record: Record<string, unknown> | null | undefined): string {
  const key = fieldOptions[0]?.value ?? "loc_name";
  if (!record || !recordHasConditionKey(record, key)) {
    return `{${key}} == value`;
  }
  const raw = record[key] ?? record[`{${key}}`];
  const s = raw != null ? String(raw) : "";
  if (s === "") return `{${key}} == ''`;
  const n = Number(s);
  if (!Number.isNaN(n) && String(n) === s) return `{${key}} == ${n}`;
  const q = s.includes("'") ? `"${s.replace(/"/g, '\\"')}"` : `'${s}'`;
  return `{${key}} == ${q}`;
}

export function ElementProperties({
  element,
  labelWidthMm,
  labelHeightMm,
  onUpdate,
  onDelete,
  variableCategories,
  conditionFieldRecord,
  templateType,
  compactMode = false,
}: {
  element: TemplateElement;
  labelWidthMm: number;
  labelHeightMm: number;
  onUpdate: (patch: Partial<TemplateElement>) => void;
  onDelete: () => void;
  /** Optional: for conditional styling field dropdown. */
  variableCategories?: Array<{ id: string; label: string; items: LabelVariable[] }>;
  /** Preview / sample record used to list only condition keys that exist at runtime. */
  conditionFieldRecord?: Record<string, unknown> | null;
  templateType?: TemplateType | null;
  compactMode?: boolean;
}) {
  const isGroup = element.type === "group";
  const isRepeater = element.type === "repeater";
  const isBarcode = element.type === "barcode";
  const isDynamicText = element.type === "dynamicText";
  const isStaticText = element.type === "staticText";
  const isStatusIcon = element.type === "statusIcon";
  const isSection = element.type === "section";
  const isRect = element.type === "rect";
  const isShape = element.type === "triangle" || element.type === "arrow" || element.type === "polygon" || element.type === "rect" || element.type === "line";
  const conditionFieldOptions = getConditionFieldOptions(variableCategories, conditionFieldRecord ?? null);

  const maxX = Math.max(0, labelWidthMm - element.width);
  const maxY = Math.max(0, labelHeightMm - element.height);

  return (
    <div className="space-y-2 text-xs text-[#1E293B]">
      {!compactMode && (
        <div className="grid grid-cols-2 gap-1">
          <label className="text-slate-500">{UI_STRINGS.labels.elementProps.xMm}</label>
          <input
            type="number"
            step={0.5}
            min={0}
            max={maxX}
            value={element.x}
            onChange={(e) => onUpdate({ x: Math.max(0, Math.min(Number(e.target.value) || 0, maxX)) })}
            className="w-20 rounded border border-slate-100 bg-slate-50 px-2 py-0.5 text-[#1E293B]"
          />
          <label className="text-slate-500">{UI_STRINGS.labels.elementProps.yMm}</label>
          <input
            type="number"
            step={0.5}
            min={0}
            max={maxY}
            value={element.y}
            onChange={(e) => onUpdate({ y: Math.max(0, Math.min(Number(e.target.value) || 0, maxY)) })}
            className="w-20 rounded border border-slate-100 bg-slate-50 px-2 py-0.5 text-[#1E293B]"
          />
          <label className="text-slate-500">{UI_STRINGS.labels.elementProps.widthMm}</label>
          <input
            type="number"
            step={0.5}
            min={0.5}
            max={labelWidthMm}
            value={element.width}
            onChange={(e) => onUpdate({ width: Math.max(0.5, Math.min(Number(e.target.value) || 0, labelWidthMm)) })}
            className="w-20 rounded border border-slate-100 bg-slate-50 px-2 py-0.5 text-[#1E293B]"
          />
          <label className="text-slate-500">{UI_STRINGS.labels.elementProps.heightMm}</label>
          <input
            type="number"
            step={0.5}
            min={0.5}
            max={labelHeightMm}
            value={element.height}
            onChange={(e) => onUpdate({ height: Math.max(0.5, Math.min(Number(e.target.value) || 0, labelHeightMm)) })}
            className="w-20 rounded border border-slate-100 bg-slate-50 px-2 py-0.5 text-[#1E293B]"
          />
        </div>
      )}
      {!compactMode && !isRepeater && (
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
      {!compactMode && !isGroup && !isRepeater && (
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
        <div className="border-t border-slate-100 pt-2 space-y-2">
          <div>
            <label className="text-slate-500 mb-1 block">{UI_STRINGS.labels.elementProps.backgroundColor}</label>
            <ColorPicker
              value={
                isRect
                  ? (element as RectElement).fill ?? (element as RectElement).backgroundColor
                  : (element as LabelElement).backgroundColor
              }
              onChange={(hex) => (isRect ? onUpdate({ fill: hex }) : onUpdate({ backgroundColor: hex }))}
              fallback="#ffffff"
            />
          </div>
          <div>
            <label className="text-slate-500 mb-1 block">{UI_STRINGS.labels.elementProps.textColor}</label>
            <ColorPicker
              value={(element as LabelElement).textColor}
              onChange={(hex) => onUpdate({ textColor: hex })}
              fallback="#000000"
            />
          </div>
          {isShape && (
            <div>
              <label className="text-slate-500 mb-1 block">Kolor obramowania</label>
              <ColorPicker
                value={(element as LabelElement).borderColor}
                onChange={(hex) => onUpdate({ borderColor: hex })}
                fallback="#374151"
              />
            </div>
          )}
        </div>
      )}
      {isRect && (
        <div className="border-t border-slate-100 pt-2 space-y-2">
          <div>
            <label className="text-slate-500 mb-1 block">{UI_STRINGS.labels.elementProps.cornerRadiusMm}</label>
            {(() => {
              const re = element as RectElement;
              const w = re.width;
              const h = re.height;
              const maxR = Math.min(20, Math.min(w, h) / 2);
              const raw = typeof re.cornerRadius === "number" && Number.isFinite(re.cornerRadius) ? re.cornerRadius : 0;
              const value = Math.max(0, Math.min(raw, maxR));
              const setRadius = (next: number) => {
                const cap = Math.min(20, Math.min(w, h) / 2);
                onUpdate({ cornerRadius: Math.max(0, Math.min(next, cap)) });
              };
              return (
                <div className="flex flex-col gap-1.5">
                  <input
                    type="range"
                    min={0}
                    max={maxR}
                    step={0.1}
                    value={value}
                    onChange={(e) => setRadius(Number(e.target.value))}
                    className="w-full h-2 accent-cyan-600"
                  />
                  <input
                    type="number"
                    min={0}
                    max={maxR}
                    step={0.1}
                    value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
                    onChange={(e) => setRadius(Number(e.target.value) || 0)}
                    className="w-full rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 text-[10px]"
                  />
                  <div className="text-[9px] text-slate-400">0–20 mm, max {maxR.toFixed(1)} mm dla tego rozmiaru</div>
                </div>
              );
            })()}
          </div>
          <label className="text-slate-600 font-medium block">
            {UI_STRINGS.labels.designer.conditionalFormatting}
          </label>
          {(element as { conditions?: ConditionalStyleRule[] }).conditions?.map((rule, index) => {
            const { field, operator, value } = parseConditionIf(rule.if);
            const conditions = [...((element as { conditions?: ConditionalStyleRule[] }).conditions ?? [])];
            const updateRule = (patch: Partial<ConditionalStyleRule>) => {
              const next = conditions.map((r, i) => (i === index ? { ...r, ...patch } : r));
              onUpdate({ conditions: next });
            };
            const updateIf = (f: string, op: string, v: string) => {
              const expr = buildConditionIf(f, op, v);
              if (expr) updateRule({ if: expr });
            };
            const removeRule = () => {
              const next = conditions.filter((_, i) => i !== index);
              onUpdate({ conditions: next.length ? next : undefined });
            };
            const fieldOpts = [...conditionFieldOptions];
            if (field && !fieldOpts.some((o) => o.value === field)) {
              const ok = recordHasConditionKey(conditionFieldRecord ?? {}, field);
              fieldOpts.unshift({
                value: field,
                label: ok ? field : `${field} (nie ma w rekordzie)`,
              });
            }
            return (
              <div key={index} className="rounded border border-slate-200 bg-slate-50/50 p-2 space-y-1.5">
                <div className="text-[10px] text-slate-500 font-medium">
                  {UI_STRINGS.labels.designer.conditionIf}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <select
                    value={field}
                    onChange={(e) => updateIf(e.target.value, operator, value)}
                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] min-w-0 flex-1 max-w-[100px]"
                    title={UI_STRINGS.labels.designer.conditionFieldTitle}
                  >
                    {fieldOpts.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <select
                    value={operator}
                    onChange={(e) => updateIf(field, e.target.value, value)}
                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] w-12"
                    title={UI_STRINGS.labels.designer.conditionOperatorTitle}
                  >
                    {CONDITION_OPERATORS.map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => updateIf(field, operator, e.target.value)}
                    placeholder={UI_STRINGS.labels.designer.conditionValuePlaceholder}
                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] w-14"
                  />
                </div>
                <label className="text-[10px] text-slate-500 font-medium block">
                  {UI_STRINGS.labels.designer.conditionFillColor}
                </label>
                <ColorPicker
                  value={rule.fill}
                  onChange={(hex) => updateRule({ fill: hex })}
                  fallback="#808080"
                />
                <button
                  type="button"
                  onClick={removeRule}
                  className="text-[10px] text-red-600 hover:text-red-700 hover:underline"
                >
                  {UI_STRINGS.labels.designer.deleteRule}
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => {
              const current = (element as { conditions?: ConditionalStyleRule[] }).conditions ?? [];
              const ifExpr =
                (templateType ?? "").toLowerCase() === "location" && conditionFieldOptions.some((o) => o.value === "loc_name")
                  ? buildDefaultConditionIf(
                      conditionFieldOptions.filter((o) => o.value === "loc_name"),
                      conditionFieldRecord ?? null,
                    )
                  : buildDefaultConditionIf(conditionFieldOptions, conditionFieldRecord ?? null);
              onUpdate({
                conditions: [...current, { if: ifExpr, fill: "#ffffff" }],
              });
            }}
            className="text-[10px] rounded border border-slate-200 bg-white px-2 py-1 text-slate-600 hover:bg-slate-50 border-dashed"
          >
            {UI_STRINGS.labels.designer.addRule}
          </button>
        </div>
      )}
      {isGroup && (
        <p className="text-[10px] text-slate-500">Grupa: {(element as GroupElement).elements.length} elementów. Przesuń grupę, aby przenieść wszystkie.</p>
      )}
      {isRepeater && (
        <div className="space-y-1">
          <label className="text-slate-500">Źródło danych (np. poziomy, lokalizacje)</label>
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
          <label className="text-slate-500">Filtr wierszy (opcjonalnie)</label>
          <input
            type="text"
            value={(element as RepeaterElement).filter ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              onUpdate({ filter: v.length ? v : undefined });
            }}
            placeholder='np. {dataset_index} == 0'
            className="w-full rounded border border-[#E2E8F0] bg-slate-50 px-2 py-0.5 text-[10px] font-mono"
          />
          <p className="text-[9px] text-slate-500 leading-snug">
            Wiele powtarzaczy z tym samym datasetem: ustaw różne filtry (indeks w źródle:{" "}
            <span className="font-mono">dataset_index</span>). Jedna belka: kolory wg{" "}
            <span className="font-mono">repeater_slot</span> w visibleIf elementów w szablonie.
          </p>
          <label className="text-slate-500">Sortuj dataset po polu</label>
          <input
            type="text"
            value={(element as RepeaterElement).sortBy ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              onUpdate({ sortBy: v.length ? v : undefined });
            }}
            placeholder="np. level"
            className="w-full rounded border border-[#E2E8F0] bg-slate-50 px-2 py-0.5 text-[10px]"
          />
        </div>
      )}
      {isBarcode && (
        <>
          <div>
            <label className="text-slate-400">Typ kodu</label>
            <select
              value={element.format}
              onChange={(e) => onUpdate({ format: e.target.value as BarcodeFormat })}
              className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            >
              <option value="EAN13">EAN13</option>
              <option value="Code128">CODE128</option>
              <option value="QR">QR</option>
            </select>
          </div>
          {element.format !== "QR" && (
            <>
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
          {element.format === "QR" && (
            <div className="space-y-2 rounded border border-slate-200 bg-slate-50/70 p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Dane QR</div>
              <div>
                <label className="text-slate-500">Typ danych</label>
                <select
                  value={(element as BarcodeElement).qrDataMode ?? "dynamic"}
                  onChange={(e) => onUpdate({ qrDataMode: e.target.value as BarcodeElement["qrDataMode"] })}
                  className="w-full rounded border border-[#E2E8F0] bg-white px-2 py-1 text-[11px]"
                >
                  <option value="dynamic">Zmienna</option>
                  <option value="static">Tekst statyczny</option>
                  <option value="url">URL</option>
                  <option value="template">Szablon łączony</option>
                </select>
              </div>
              {(element as BarcodeElement).qrDataMode === "dynamic" || !(element as BarcodeElement).qrDataMode ? (
                <div>
                  <label className="text-slate-500">Zmienna</label>
                  <select
                    value={element.dataBinding}
                    onChange={(e) => onUpdate({ dataBinding: e.target.value as DynamicBinding })}
                    className="w-full rounded border border-[#E2E8F0] bg-white px-2 py-1 text-[11px]"
                  >
                    {DYNAMIC_BINDINGS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-slate-500">Zawartość</label>
                  <textarea
                    value={(element as BarcodeElement).qrContent ?? ""}
                    onChange={(e) => onUpdate({ qrContent: e.target.value })}
                    rows={3}
                    placeholder={
                      (element as BarcodeElement).qrDataMode === "template"
                        ? "Produkt: {prod_name}\nEAN: {ean}"
                        : (element as BarcodeElement).qrDataMode === "url"
                          ? "https://example.com/manual/123"
                          : "Dowolny tekst"
                    }
                    className="w-full rounded border border-[#E2E8F0] bg-white px-2 py-1 text-[11px]"
                  />
                </div>
              )}
              <div>
                <label className="text-slate-500">Szybkie presety</label>
                <div className="mt-1 grid grid-cols-1 gap-1">
                  <button type="button" className="rounded border border-slate-200 bg-white px-2 py-1 text-left text-[10px] text-slate-700 hover:bg-slate-50" onClick={() => onUpdate({ qrDataMode: "url", qrContent: "https://twoja-domena.pl/produkt/{sku}", qrPreset: "product_link" })}>Link do produktu</button>
                  <button type="button" className="rounded border border-slate-200 bg-white px-2 py-1 text-left text-[10px] text-slate-700 hover:bg-slate-50" onClick={() => onUpdate({ qrDataMode: "url", qrContent: "https://twoja-domena.pl/instrukcja/{sku}", qrPreset: "manual_link" })}>Link do instrukcji</button>
                  <button type="button" className="rounded border border-slate-200 bg-white px-2 py-1 text-left text-[10px] text-slate-700 hover:bg-slate-50" onClick={() => onUpdate({ qrDataMode: "template", qrContent: "Produkt: {prod_name}\nEAN: {ean}\nSKU: {sku}", qrPreset: "product_data" })}>Dane produktu</button>
                </div>
              </div>
              <div className="rounded border border-dashed border-slate-200 bg-white px-2 py-1.5">
                <p className="text-[10px] font-medium text-slate-600">Podgląd danych</p>
                <p className="mt-0.5 break-all font-mono text-[10px] text-slate-700">
                  {(() => {
                    const b = element as BarcodeElement;
                    const mode = b.qrDataMode ?? "dynamic";
                    if (mode === "dynamic") {
                      const key = (b.dataBinding ?? "").replace(/^\{|\}$/g, "");
                      const v = conditionFieldRecord?.[key] ?? conditionFieldRecord?.[`{${key}}`];
                      return v == null ? `{${key || "brak"}}` : String(v);
                    }
                    const content = b.qrContent ?? "";
                    if (mode !== "template") return content || "—";
                    return content.replace(/\{([^}]+)\}/g, (_m, k) => {
                      const kk = String(k).trim();
                      const v = conditionFieldRecord?.[kk] ?? conditionFieldRecord?.[`{${kk}}`];
                      return v == null ? `{${kk}}` : String(v);
                    });
                  })()}
                </p>
              </div>

              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Wygląd</div>
              <div className="grid grid-cols-2 gap-1">
                <label className="text-slate-500">Margines</label>
                <input type="number" min={0} max={8} value={(element as BarcodeElement).qrMargin ?? 0} onChange={(e) => onUpdate({ qrMargin: Math.max(0, Math.min(8, Number(e.target.value) || 0)) })} className="rounded border border-[#E2E8F0] bg-white px-2 py-0.5" />
                <label className="text-slate-500">Korekcja błędów</label>
                <select value={(element as BarcodeElement).qrErrorCorrection ?? "M"} onChange={(e) => onUpdate({ qrErrorCorrection: e.target.value as BarcodeElement["qrErrorCorrection"] })} className="rounded border border-[#E2E8F0] bg-white px-2 py-0.5">
                  <option value="L">L</option><option value="M">M</option><option value="Q">Q</option><option value="H">H</option>
                </select>
              </div>
              <div>
                <label className="text-slate-500 mb-1 block">Kolor</label>
                <ColorPicker value={(element as BarcodeElement).qrDarkColor ?? "#000000"} onChange={(hex) => onUpdate({ qrDarkColor: hex })} fallback="#000000" />
              </div>
              <div>
                <label className="text-slate-500 mb-1 block">Tło</label>
                <ColorPicker value={(element as BarcodeElement).qrLightColor ?? "#ffffff"} onChange={(hex) => onUpdate({ qrLightColor: hex })} fallback="#ffffff" />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={(element as BarcodeElement).qrTransparentBg ?? false} onChange={(e) => onUpdate({ qrTransparentBg: e.target.checked })} />
                Tło przezroczyste
              </label>

              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Opcje</div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={(element as BarcodeElement).qrAutoScale ?? true} onChange={(e) => onUpdate({ qrAutoScale: e.target.checked })} />Automatyczne skalowanie</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={(element as BarcodeElement).qrKeepAspect ?? true} onChange={(e) => onUpdate({ qrKeepAspect: e.target.checked })} />Zachowaj proporcje</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={(element as BarcodeElement).qrHighQuality ?? true} onChange={(e) => onUpdate({ qrHighQuality: e.target.checked })} />Wysoka jakość druku</label>
            </div>
          )}
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
