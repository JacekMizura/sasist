import type { AutomationCondition, AutomationEffect, OrderAutomationRule } from "../types/orderAutomation";
import { ORDER_AUTOMATION_OPERATOR_LABELS, ORDER_AUTOMATION_OPERATOR_UI, conditionFieldLabel, effectKindLabel } from "./orderAutomationCatalog";
import { formatExecutionListDisplay, normalizeExecution } from "./orderAutomationExecution";

export function formatConditionPill(c: AutomationCondition, statusNameById?: Map<number, string>): string {
  const field = conditionFieldLabel(c.fieldKey);
  const op = ORDER_AUTOMATION_OPERATOR_UI[c.operator] ?? ORDER_AUTOMATION_OPERATOR_LABELS[c.operator] ?? c.operator;
  let val = c.value || "—";
  if (c.fieldKey === "order_status" && statusNameById) {
    const id = Number(c.value);
    if (Number.isFinite(id) && statusNameById.has(id)) val = statusNameById.get(id)!;
  }
  return `${field} ${op} ${val}`;
}

export function formatEffectPill(e: AutomationEffect, statusNameById?: Map<number, string>): string {
  const base = effectKindLabel(e.kind);
  if (e.kind === "change_status") {
    const id = Number(e.payload.order_ui_status_id);
    const name = Number.isFinite(id) && statusNameById?.get(id);
    return name ? `${base} → ${name}` : `${base} → #${e.payload.order_ui_status_id ?? "?"}`;
  }
  if (e.kind === "send_message") return `${base}: ${String(e.payload.template ?? "szablon")}`;
  if (e.kind === "assign_courier") return `${base}: ${String(e.payload.courier ?? "—")}`;
  if (e.kind === "add_tag") return `${base}: ${String(e.payload.tag ?? "—")}`;
  return base;
}

/** Części warunku do chipów na liście (pole + operator + wartość). */
export function formatConditionDisplayParts(
  c: AutomationCondition,
  statusNameById?: Map<number, string>,
): { field: string; op: string; value: string } {
  const field = conditionFieldLabel(c.fieldKey);
  const op = ORDER_AUTOMATION_OPERATOR_UI[c.operator] ?? ORDER_AUTOMATION_OPERATOR_LABELS[c.operator] ?? c.operator;
  let value = c.value || "—";
  if (c.fieldKey === "order_status" && statusNameById) {
    const id = Number(c.value);
    if (Number.isFinite(id) && statusNameById.has(id)) value = statusNameById.get(id)!;
  }
  return { field, op, value };
}

export function formatRuleDisplayId(rule: Pick<OrderAutomationRule, "id" | "publicId">): string {
  if (typeof rule.publicId === "number" && rule.publicId > 0) {
    return `#${rule.publicId}`;
  }
  const tail = rule.id.replace(/^rule_/, "").slice(0, 8);
  return tail ? `#${tail}` : rule.id;
}

/** Główny tytuł workflow na liście (np. „Nowe → Pakowanie”). */
export function formatRuleWorkflowTitle(
  rule: Pick<OrderAutomationRule, "conditions" | "effects">,
  statusNameById?: Map<number, string>,
): string {
  const statusCond = rule.conditions.find((c) => c.fieldKey === "order_status");
  let from = "—";
  if (statusCond) {
    from = formatConditionDisplayParts(statusCond, statusNameById).value;
  } else if (rule.conditions[0]) {
    const p = formatConditionDisplayParts(rule.conditions[0], statusNameById);
    from = p.value !== "—" ? p.value : p.field;
  }

  const statusEff = rule.effects.find((e) => e.kind === "change_status");
  let to = "—";
  if (statusEff) {
    const id = Number(statusEff.payload.order_ui_status_id);
    const name = Number.isFinite(id) && statusNameById?.get(id);
    to = name ?? `#${statusEff.payload.order_ui_status_id ?? "?"}`;
  } else if (rule.effects[0]) {
    to = formatEffectPill(rule.effects[0], statusNameById);
  }

  if (from === "—" && to === "—") return "—";
  return `${from} → ${to}`;
}

/** Zdanie warunku na liście (np. „Status zamówienia = Wózki”). */
export function formatConditionSentence(c: AutomationCondition, statusNameById?: Map<number, string>): string {
  const parts = formatConditionDisplayParts(c, statusNameById);
  const op =
    c.operator === "eq" ? "=" : c.operator === "neq" ? "≠" : c.operator === "contains" ? "zawiera" : parts.op;
  return `${parts.field} ${op} ${parts.value}`;
}

/** Części warunku do wyświetlenia w tabeli (pole normalne, operator + wartość pogrubione). */
export function formatConditionListLine(
  c: AutomationCondition,
  statusNameById?: Map<number, string>,
): { field: string; operator: string; value: string } {
  const parts = formatConditionDisplayParts(c, statusNameById);
  const operator =
    c.operator === "eq" ? "=" : c.operator === "neq" ? "≠" : c.operator === "contains" ? "zawiera" : parts.op;
  return { field: parts.field, operator, value: parts.value };
}

export type EffectListBlock = {
  title: string;
  /** Prefiks przed wartością (np. „SZABLON: ”) */
  detailPrefix: string | null;
  /** Najważniejsza wartość — pogrubiona w UI */
  primaryBold: string | null;
  /** Reszta linii szczegółów (np. „ • FV Polska • Główna”) */
  secondaryDetail: string | null;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: "Faktura",
  receipt: "Paragon",
  wz: "WZ",
  label: "Etykieta",
  other: "Inny",
};

const DOC_SERIES_LABELS: Record<string, string> = {
  fv_poland: "FV Polska",
  fv_ue: "FV UE",
  proforma: "Proforma",
  corr: "Korekta",
};

const PRINT_STATION_LABELS: Record<string, string> = {
  main: "Główna",
  warehouse: "Magazyn",
  office: "Biuro",
};

const MESSAGE_TEMPLATE_LABELS: Record<string, string> = {
  order_shipped: "Zamówienie wysłane",
  payment_reminder: "Przypomnienie o płatności",
  order_confirmation: "Potwierdzenie zamówienia",
  pickup_ready: "Odbiór gotowy",
};

const MESSAGE_CHANNEL_LABELS: Record<string, string> = {
  email: "E-mail",
  sms: "SMS",
  panel: "Panel",
};

function payloadLabel(map: Record<string, string>, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return map[v] ?? v;
}

/** Pełny opis efektu na liście — tytuł akcji + szczegóły z wyróżnioną wartością. */
export function formatEffectListBlock(e: AutomationEffect, statusNameById?: Map<number, string>): EffectListBlock {
  const title =
    e.kind === "send_message" && String(e.payload.message_channel ?? "email") === "email"
      ? "Wyślij e-mail"
      : effectKindLabel(e.kind);

  if (e.kind === "change_status") {
    const id = Number(e.payload.order_ui_status_id);
    const name = Number.isFinite(id) && statusNameById?.get(id);
    const primary = name ?? (e.payload.order_ui_status_id ? `#${e.payload.order_ui_status_id}` : null);
    return { title, detailPrefix: null, primaryBold: primary, secondaryDetail: null };
  }

  if (e.kind === "generate_document") {
    const docType = payloadLabel(DOC_TYPE_LABELS, String(e.payload.doc_type ?? ""));
    const series = payloadLabel(DOC_SERIES_LABELS, String(e.payload.doc_series ?? ""));
    const station = payloadLabel(PRINT_STATION_LABELS, String(e.payload.print_station ?? ""));
    const rest = [series, station].filter(Boolean);
    const copies = String(e.payload.copies ?? "").trim();
    if (copies && copies !== "1") rest.push(`${copies} kopie`);
    return {
      title,
      detailPrefix: null,
      primaryBold: docType ? docType.toUpperCase() : null,
      secondaryDetail: rest.length ? ` • ${rest.join(" • ")}` : null,
    };
  }

  if (e.kind === "send_message") {
    const raw = String(e.payload.template ?? "").trim();
    const template = payloadLabel(MESSAGE_TEMPLATE_LABELS, raw) ?? (raw || null);
    return { title, detailPrefix: "SZABLON: ", primaryBold: template, secondaryDetail: null };
  }

  if (e.kind === "assign_courier") {
    const courier = String(e.payload.courier ?? "").trim();
    const preset = String(e.payload.courier_preset ?? "").trim();
    const primary = courier || preset || null;
    const rest = courier && preset ? ` • ${preset}` : null;
    return { title, detailPrefix: null, primaryBold: primary, secondaryDetail: rest };
  }

  if (e.kind === "add_tag") {
    const tag = String(e.payload.tag ?? "").trim();
    return { title, detailPrefix: null, primaryBold: tag || null, secondaryDetail: null };
  }

  if (e.kind === "print") {
    const doc =
      String(e.payload.print_document ?? "").trim() || String(e.payload.template ?? "").trim();
    const printer = String(e.payload.printer ?? "").trim();
    return {
      title,
      detailPrefix: null,
      primaryBold: doc || null,
      secondaryDetail: printer ? ` • ${printer}` : null,
    };
  }

  if (e.kind === "wms_action") {
    const key = String(e.payload.action_key ?? "").trim();
    return { title, detailPrefix: null, primaryBold: key || null, secondaryDetail: null };
  }

  return { title, detailPrefix: null, primaryBold: null, secondaryDetail: null };
}

/** @deprecated Użyj formatExecutionListDisplay — bez wyzwalaczy eventów. */
export function formatRuleTriggerLabels(
  rule: Pick<OrderAutomationRule, "execution" | "manualTrigger">,
): string[] {
  const ex = normalizeExecution(rule.execution);
  if (!ex.automatic) return ["Ręcznie"];
  return [];
}

/** Nazwa reguły do kolumny Nazwa (bez workflow). */
export function formatRuleListName(rule: Pick<OrderAutomationRule, "name">): string {
  const name = rule.name.trim();
  return name || "—";
}

const GENERIC_RULE_NAMES = new Set(["nowa automatyzacja", ""]);

/** @deprecated użyj formatRuleListName — bez workflow w kolumnie Nazwa */
export function formatRuleListHeadline(
  rule: Pick<OrderAutomationRule, "name" | "conditions" | "effects">,
  statusNameById?: Map<number, string>,
): { headline: string; workflow: string | null } {
  const workflow = formatRuleWorkflowTitle(rule, statusNameById);
  const name = rule.name.trim();
  const generic = !name || GENERIC_RULE_NAMES.has(name.toLowerCase());

  if (!generic) {
    return {
      headline: name,
      workflow: workflow !== "—" ? workflow : null,
    };
  }

  return {
    headline: workflow !== "—" ? workflow : name || "—",
    workflow: null,
  };
}

export function formatDelayMinutes(minutes: number | undefined | null): string {
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  return `${m} min`;
}

export type ExecutionModeKind = "automatic" | "schedule" | "manual";

export function resolveExecutionMode(rule: Pick<OrderAutomationRule, "execution" | "manualTrigger">): ExecutionModeKind {
  const ex = normalizeExecution(rule.execution);
  if (!ex.automatic) return "manual";
  if (ex.runMode === "hours_only" || ex.runMode === "days_and_hours") return "schedule";
  return "automatic";
}

export function formatExecutionModeBadge(
  rule: Pick<OrderAutomationRule, "enabled" | "execution" | "manualTrigger" | "delayMinutes">,
): { label: string; className: string } {
  const { lines, variant } = formatExecutionListDisplay(rule);
  const label = lines[0] ?? "—";
  if (variant === "manual") {
    return { label, className: "border-slate-200 bg-white text-slate-600" };
  }
  if (variant === "automatic" && rule.enabled) {
    return { label, className: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  }
  return { label, className: "border-slate-200 bg-white text-slate-700" };
}

export function formatEffectsSummary(
  effects: AutomationEffect[],
  statusNameById?: Map<number, string>,
): { short: string; full: string } {
  if (effects.length === 0) return { short: "—", full: "—" };
  const lines = effects.map((e) => formatEffectPill(e, statusNameById));
  if (effects.length === 1) {
    return { short: lines[0]!, full: lines[0]! };
  }
  return { short: `${effects.length} akcje`, full: lines.join("\n") };
}

export function compareRulesByPublicId(a: OrderAutomationRule, b: OrderAutomationRule, dir: "asc" | "desc"): number {
  const da = typeof a.publicId === "number" && a.publicId > 0 ? a.publicId : Number.MAX_SAFE_INTEGER;
  const db = typeof b.publicId === "number" && b.publicId > 0 ? b.publicId : Number.MAX_SAFE_INTEGER;
  return dir === "asc" ? da - db : db - da;
}

export function primaryTriggerLabel(r: Pick<OrderAutomationRule, "execution" | "manualTrigger" | "enabled" | "delayMinutes">): string {
  return formatExecutionListDisplay(r).lines.join(" ");
}

/** Krótki token do tabeli / chipów (np. „Status = Nowe”). */
export function formatConditionChipShort(c: AutomationCondition, statusNameById?: Map<number, string>): string {
  const field = conditionFieldLabel(c.fieldKey);
  let val = c.value || "—";
  if (c.fieldKey === "order_status" && statusNameById) {
    const id = Number(c.value);
    if (Number.isFinite(id) && statusNameById.has(id)) val = statusNameById.get(id)!;
  }
  return `${field} = ${val}`;
}

export function formatEffectChipShort(e: AutomationEffect, statusNameById?: Map<number, string>): string {
  if (e.kind === "change_status") {
    const id = Number(e.payload.order_ui_status_id);
    const name = Number.isFinite(id) && statusNameById?.get(id);
    return name ? `→ ${name}` : `→ #${e.payload.order_ui_status_id ?? "?"}`;
  }
  return formatEffectPill(e, statusNameById);
}

/** Jedna linia podglądu z ORAZ / LUB między warunkami. */
export function formatAutomationSentencePl(
  rule: Pick<OrderAutomationRule, "conditions" | "effects">,
  statusNameById?: Map<number, string>,
): { ifLine: string; thenLine: string } {
  let ifLine = "";
  rule.conditions.forEach((c, i) => {
    const part = formatConditionChipShort(c, statusNameById);
    if (i > 0) {
      const j = rule.conditions[i - 1]?.joinToNext === "or" ? " LUB " : " ORAZ ";
      ifLine += j;
    }
    ifLine += `[${part}]`;
  });
  const thenLine = rule.effects.map((e) => `[${formatEffectPill(e, statusNameById)}]`).join(" ");
  return {
    ifLine: ifLine || "—",
    thenLine: thenLine || "—",
  };
}
