import {
  LABEL_VARIABLE_CATEGORIES,
  type TemplateElement,
  type BarcodeElement,
  type DynamicTextElement,
  type GroupElement,
  type ImageElement,
  type RepeaterElement,
  type StaticTextElement,
} from "../types/labelSystem";

let tokenLabelMap: Map<string, string> | null = null;

function getTokenLabelMap(): Map<string, string> {
  if (!tokenLabelMap) {
    const m = new Map<string, string>();
    for (const cat of LABEL_VARIABLE_CATEGORIES) {
      for (const item of cat.items) {
        const bare = item.token.replace(/^\{|\}$/g, "").trim();
        m.set(bare, item.label);
      }
    }
    tokenLabelMap = m;
  }
  return tokenLabelMap;
}

export function friendlyBindingLabel(bareKey: string): string {
  const k = bareKey.trim();
  return getTokenLabelMap().get(k) ?? k;
}

function bareFromBinding(binding: string): string {
  const t = binding.trim();
  return t.startsWith("{") && t.endsWith("}") ? t.slice(1, -1).trim() : t;
}

function truncatePreview(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

const TYPE_PREFIX: Record<string, string> = {
  dynamicText: "Tekst",
  staticText: "Tekst",
  text: "Tekst",
  barcode: "Kod kreskowy",
  rect: "Prostokąt",
  line: "Linia",
  image: "Obraz",
  section: "Sekcja",
  statusIcon: "Ikona",
  triangle: "Trójkąt",
  arrow: "Strzałka",
  polygon: "Kształt",
  group: "Grupa",
  repeater: "Powtórzenie",
};

/**
 * Human-readable Polish label for the layers list (no raw ids).
 */
export function friendlyLayerLabel(el: TemplateElement): string {
  const typeKey = el.type;
  const prefix = TYPE_PREFIX[typeKey] ?? "Element";

  if (el.type === "group") {
    const g = el as GroupElement;
    const n = g.elements?.length ?? 0;
    return `${prefix} — ${n} ${n === 1 ? "element" : "elementy"}`;
  }
  if (el.type === "repeater") {
    const r = el as RepeaterElement;
    const ds = (r.dataset ?? "").trim() || "zbiór";
    return `${prefix} — ${ds}`;
  }
  if (el.type === "dynamicText") {
    const d = el as DynamicTextElement;
    const b = bareFromBinding(String(d.binding ?? ""));
    if (b) return `${prefix} — ${friendlyBindingLabel(b)}`;
    return prefix;
  }
  if (el.type === "barcode") {
    const b = el as BarcodeElement;
    const raw = String(b.dataBinding ?? "");
    const bare = bareFromBinding(raw);
    if (bare) return `${prefix} — ${friendlyBindingLabel(bare)}`;
    return prefix;
  }
  if (el.type === "staticText") {
    const s = el as StaticTextElement;
    const preview = truncatePreview(s.text ?? "", 32);
    if (preview) return `${prefix} — ${preview}`;
    return `${prefix} — (pusty)`;
  }
  if (el.type === "image") {
    const im = el as ImageElement;
    const bind = (im.srcBinding ?? "").trim();
    if (bind) {
      const bare = bareFromBinding(bind);
      return `${prefix} — ${friendlyBindingLabel(bare)}`;
    }
    const hint = truncatePreview(im.src ?? "", 20);
    if (hint && !hint.startsWith("data:")) return `${prefix} — ${hint}`;
    if (hint) return `${prefix} — plik / URL`;
    return `${prefix} — (brak źródła)`;
  }
  if (el.type === "rect") {
    const r = el as { fill?: string; backgroundColor?: string };
    const fill = (r.fill ?? r.backgroundColor ?? "").trim();
    if (fill && fill !== "transparent") return `${prefix} — ${truncatePreview(fill, 18)}`;
    return `${prefix} — tło`;
  }
  if (el.type === "line") {
    return `${prefix} — separator`;
  }
  if (el.type === "statusIcon") {
    const icon = (el as { icon?: string }).icon ?? "";
    return icon ? `${prefix} — ${icon}` : prefix;
  }
  return prefix;
}
