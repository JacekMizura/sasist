/**
 * Plan + Historia zmian magazynu — SSOT FE (localStorage).
 * Faza 4: realizacja → ocena efektów → historia. Bez nowych algorytmów.
 */

export type ChangeSource = "slotting" | "strategy" | "routes";

export type ChangePriority = "wysoki" | "sredni" | "niski";

export type ChangeStatus =
  | "nowa"
  | "zaplanowana"
  | "w_realizacji"
  | "wdrozona"
  | "zweryfikowana"
  | "odrzucona";

/** Kategoria rankingu skuteczności (nie nowy KPI — klasyfikacja istniejącej zmiany). */
export type EffectCategory = "trasy" | "wydajnosc" | "dead_stock" | "lokalizacje" | "inne";

export type EffectMetric = {
  /** Nazwa metryki z istniejącego źródła (np. średni dystans). */
  label: string;
  value: number;
  unit: string;
  capturedAt: string;
};

export type WarehouseChangeItem = {
  id: string;
  source: ChangeSource;
  dedupeKey: string;
  title: string;
  description: string;
  /** Opis wykonanej zmiany (historia decyzji). */
  executedDescription: string;
  priority: ChangePriority;
  status: ChangeStatus;
  originLabel: string;
  impactConcrete: string | null;
  impactLevel: "Wysoki wpływ" | "Średni wpływ" | "Niski wpływ";
  impactScore: number;
  effectCategory: EffectCategory;
  sourcePath: string;
  authorName: string;
  authorId: number | null;
  warehouseName: string | null;
  warehouseId: number | null;
  createdAt: string;
  updatedAt: string;
  deployedAt: string | null;
  verifiedAt: string | null;
  /** Snapshot PRZED — tylko realne odczyty. */
  effectBefore: EffectMetric | null;
  /** Snapshot PO — tylko realne odczyty. */
  effectAfter: EffectMetric | null;
  /**
   * Różnica PO−PRZED gdy obie wartości istnieją.
   * null = brak danych do oceny (UI: „Oczekuje na dane”).
   */
  effectDelta: {
    absolute: number;
    percent: number | null;
    label: string;
  } | null;
};

export type RealizationOption = {
  id: string;
  label: string;
  to: string;
};

export const REALIZATION_OPTIONS: RealizationOption[] = [
  { id: "designer", label: "Otwórz Projektanta magazynu", to: "/designer" },
  { id: "mm", label: "Otwórz Przesunięcia magazynowe", to: "/wms/mm" },
  { id: "strategy", label: "Otwórz Strategię kompletacji", to: "/optymalizacja/picking-strategy" },
  { id: "centrum", label: "Otwórz Pulpit kierownika", to: "/pulpit-kierownika" },
  { id: "wms", label: "Otwórz WMS", to: "/wms/menu" },
];

const STORAGE_KEY = "optymalizacja.warehouse-change-plan.v3";
const LEGACY_KEYS = [
  "optymalizacja.warehouse-change-plan.v2",
  "optymalizacja.warehouse-change-plan.v1",
];

type Listener = () => void;
const listeners = new Set<Listener>();
let cached: WarehouseChangeItem[] | null = null;

function notify() {
  listeners.forEach((l) => l());
}

function sortItems(items: WarehouseChangeItem[]): WarehouseChangeItem[] {
  const statusWeight: Record<ChangeStatus, number> = {
    nowa: 6,
    zaplanowana: 5,
    w_realizacji: 4,
    wdrozona: 3,
    zweryfikowana: 2,
    odrzucona: 0,
  };
  return [...items].sort((a, b) => {
    const sw = statusWeight[b.status] - statusWeight[a.status];
    if (sw !== 0) return sw;
    return b.impactScore - a.impactScore || b.createdAt.localeCompare(a.createdAt);
  });
}

export function impactLevelFromPriority(
  p: ChangePriority
): WarehouseChangeItem["impactLevel"] {
  if (p === "wysoki") return "Wysoki wpływ";
  if (p === "niski") return "Niski wpływ";
  return "Średni wpływ";
}

export function defaultOriginLabel(source: ChangeSource, variant?: string): string {
  if (source === "slotting") return "Układ towaru w magazynie";
  if (source === "strategy") return "Strategia kompletacji";
  if (variant === "distance") return "Dystans kompletacji";
  return "Trasy kompletacji";
}

export function defaultEffectCategory(source: ChangeSource): EffectCategory {
  if (source === "routes") return "trasy";
  if (source === "strategy") return "wydajnosc";
  if (source === "slotting") return "lokalizacje";
  return "inne";
}

export function computeEffectDelta(
  before: EffectMetric | null,
  after: EffectMetric | null
): WarehouseChangeItem["effectDelta"] {
  if (!before || !after) return null;
  if (before.label !== after.label || before.unit !== after.unit) return null;
  const absolute = after.value - before.value;
  const percent =
    before.value !== 0 ? (absolute / Math.abs(before.value)) * 100 : null;
  const sign = absolute > 0 ? "+" : "";
  const pctPart =
    percent != null ? ` (${sign}${percent.toFixed(1)}%)` : "";
  return {
    absolute,
    percent,
    label: `${sign}${absolute.toFixed(1)} ${before.unit}${pctPart}`,
  };
}

function migrateLegacy(raw: unknown): WarehouseChangeItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const priority = (r.priority as ChangePriority) || "sredni";
  const source = (r.source as ChangeSource) || "slotting";
  let status = (r.status as ChangeStatus) || "nowa";
  if (status !== "nowa" && status !== "zaplanowana" && status !== "w_realizacji" &&
      status !== "wdrozona" && status !== "zweryfikowana" && status !== "odrzucona") {
    status = "nowa";
  }
  const concrete =
    typeof r.impactConcrete === "string" && r.impactConcrete.trim()
      ? r.impactConcrete.trim()
      : typeof r.impactLabel === "string" && r.impactLabel.trim()
        ? r.impactLabel.trim()
        : null;
  const before = (r.effectBefore as EffectMetric | null) ?? null;
  const after = (r.effectAfter as EffectMetric | null) ?? null;
  const delta =
    (r.effectDelta as WarehouseChangeItem["effectDelta"]) ??
    computeEffectDelta(before, after);
  const title = String(r.title ?? "Zmiana");
  return {
    id: String(r.id ?? `chg_${Date.now()}`),
    source,
    dedupeKey: String(r.dedupeKey ?? r.id ?? ""),
    title,
    description: String(r.description ?? ""),
    executedDescription: String(r.executedDescription ?? r.description ?? title),
    priority,
    status,
    originLabel:
      typeof r.originLabel === "string" && r.originLabel.trim()
        ? r.originLabel.trim()
        : defaultOriginLabel(source),
    impactConcrete: concrete,
    impactLevel:
      (r.impactLevel as WarehouseChangeItem["impactLevel"]) ||
      impactLevelFromPriority(priority),
    impactScore: Number(r.impactScore) || 0,
    effectCategory:
      (r.effectCategory as EffectCategory) || defaultEffectCategory(source),
    sourcePath: String(r.sourcePath ?? "/optymalizacja"),
    authorName: String(r.authorName ?? "Nieznany"),
    authorId: typeof r.authorId === "number" ? r.authorId : null,
    warehouseName: typeof r.warehouseName === "string" ? r.warehouseName : null,
    warehouseId: typeof r.warehouseId === "number" ? r.warehouseId : null,
    createdAt: String(r.createdAt ?? new Date().toISOString()),
    updatedAt: String(r.updatedAt ?? r.createdAt ?? new Date().toISOString()),
    deployedAt: typeof r.deployedAt === "string" ? r.deployedAt : null,
    verifiedAt: typeof r.verifiedAt === "string" ? r.verifiedAt : null,
    effectBefore: before,
    effectAfter: after,
    effectDelta: delta,
  };
}

function readRaw(): WarehouseChangeItem[] {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const key of LEGACY_KEYS) {
        const legacy = localStorage.getItem(key);
        if (!legacy) continue;
        const parsed = JSON.parse(legacy) as unknown[];
        const migrated = (Array.isArray(parsed) ? parsed : [])
          .map(migrateLegacy)
          .filter((x): x is WarehouseChangeItem => x != null);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        localStorage.removeItem(key);
        return migrated;
      }
      return [];
    }
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migrateLegacy).filter((x): x is WarehouseChangeItem => x != null);
  } catch {
    return [];
  }
}

function write(items: WarehouseChangeItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  cached = sortItems(items);
  notify();
}

export function getWarehouseChangePlan(): WarehouseChangeItem[] {
  if (cached == null) cached = sortItems(readRaw());
  return cached;
}

export function subscribeWarehouseChangePlan(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type AddChangeInput = {
  source: ChangeSource;
  dedupeKey: string;
  title: string;
  description: string;
  priority: ChangePriority;
  impactScore: number;
  sourcePath: string;
  id?: string;
  status?: ChangeStatus;
  originLabel?: string;
  impactConcrete?: string | null;
  impactLabel?: string;
  effectCategory?: EffectCategory;
  executedDescription?: string;
  authorName?: string;
  authorId?: number | null;
  warehouseName?: string | null;
  warehouseId?: number | null;
};

export function addWarehouseChange(item: AddChangeInput): {
  ok: boolean;
  reason?: "duplicate";
  item: WarehouseChangeItem;
} {
  const current = readRaw();
  const existing = current.find((c) => c.dedupeKey === item.dedupeKey);
  if (existing) return { ok: false, reason: "duplicate", item: existing };
  const concreteRaw = item.impactConcrete ?? item.impactLabel ?? null;
  const concrete =
    concreteRaw != null && String(concreteRaw).trim() !== ""
      ? String(concreteRaw).trim()
      : null;
  const now = new Date().toISOString();
  const full: WarehouseChangeItem = {
    source: item.source,
    dedupeKey: item.dedupeKey,
    title: item.title,
    description: item.description,
    executedDescription: item.executedDescription?.trim() || item.title,
    priority: item.priority,
    impactScore: item.impactScore,
    sourcePath: item.sourcePath,
    id: item.id ?? `chg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: item.status ?? "nowa",
    originLabel: item.originLabel?.trim() || defaultOriginLabel(item.source),
    impactConcrete: concrete,
    impactLevel: impactLevelFromPriority(item.priority),
    effectCategory: item.effectCategory ?? defaultEffectCategory(item.source),
    authorName: item.authorName?.trim() || "Nieznany",
    authorId: item.authorId ?? null,
    warehouseName: item.warehouseName ?? null,
    warehouseId: item.warehouseId ?? null,
    createdAt: now,
    updatedAt: now,
    deployedAt: null,
    verifiedAt: null,
    effectBefore: null,
    effectAfter: null,
    effectDelta: null,
  };
  write([full, ...current]);
  return { ok: true, item: full };
}

export function updateWarehouseChange(
  id: string,
  patch: Partial<
    Pick<
      WarehouseChangeItem,
      | "status"
      | "executedDescription"
      | "effectBefore"
      | "effectAfter"
      | "effectDelta"
      | "deployedAt"
      | "verifiedAt"
      | "authorName"
      | "warehouseName"
      | "warehouseId"
    >
  >
) {
  const next = readRaw().map((c) => {
    if (c.id !== id) return c;
    const merged = { ...c, ...patch, updatedAt: new Date().toISOString() };
    if (patch.effectBefore !== undefined || patch.effectAfter !== undefined) {
      merged.effectDelta = computeEffectDelta(merged.effectBefore, merged.effectAfter);
    }
    if (patch.status === "wdrozona" && !merged.deployedAt) {
      merged.deployedAt = merged.updatedAt;
    }
    if (patch.status === "zweryfikowana" && !merged.verifiedAt) {
      merged.verifiedAt = merged.updatedAt;
    }
    return merged;
  });
  write(next);
}

export function updateWarehouseChangeStatus(id: string, status: ChangeStatus) {
  updateWarehouseChange(id, { status });
}

export function removeWarehouseChange(id: string) {
  write(readRaw().filter((c) => c.id !== id));
}

export function clearWarehouseChangePlan() {
  write([]);
}

export function statusLabel(s: ChangeStatus): string {
  switch (s) {
    case "nowa":
      return "Nowa";
    case "zaplanowana":
      return "Zaplanowana";
    case "w_realizacji":
      return "W realizacji";
    case "wdrozona":
      return "Wdrożona";
    case "zweryfikowana":
      return "Zweryfikowana";
    case "odrzucona":
      return "Odrzucona";
  }
}

export const CHANGE_STATUSES: ChangeStatus[] = [
  "nowa",
  "zaplanowana",
  "w_realizacji",
  "wdrozona",
  "zweryfikowana",
  "odrzucona",
];

export function sourceLabel(source: ChangeSource): string {
  return defaultOriginLabel(source);
}

export function priorityLabel(p: ChangePriority): string {
  switch (p) {
    case "wysoki":
      return "Wysoki";
    case "sredni":
      return "Średni";
    case "niski":
      return "Niski";
  }
}

export function effectCategoryLabel(c: EffectCategory): string {
  switch (c) {
    case "trasy":
      return "Skrócenie tras";
    case "wydajnosc":
      return "Wydajność kompletacji";
    case "dead_stock":
      return "Redukcja zalegającego towaru";
    case "lokalizacje":
      return "Wykorzystanie lokalizacji";
    case "inne":
      return "Inne";
  }
}

export function effectDisplay(item: WarehouseChangeItem): {
  primary: string;
  secondary?: string;
} {
  if (item.impactConcrete) {
    return { primary: item.impactConcrete, secondary: item.impactLevel };
  }
  return { primary: item.impactLevel };
}

/** Ocena efektów — nigdy fikcja. */
export function evaluationDisplay(item: WarehouseChangeItem): {
  predicted: string;
  before: string;
  after: string;
  delta: string;
  awaiting: boolean;
} {
  const predicted = item.impactConcrete || item.impactLevel;
  if (!item.effectBefore && !item.effectAfter) {
    return {
      predicted,
      before: "Oczekuje na dane",
      after: "Oczekuje na dane",
      delta: "Oczekuje na dane",
      awaiting: true,
    };
  }
  const before = item.effectBefore
    ? `${item.effectBefore.value} ${item.effectBefore.unit}`
    : "Oczekuje na dane";
  const after = item.effectAfter
    ? `${item.effectAfter.value} ${item.effectAfter.unit}`
    : "Oczekuje na dane";
  const delta = item.effectDelta?.label ?? "Oczekuje na dane";
  return {
    predicted,
    before,
    after,
    delta,
    awaiting: item.effectDelta == null,
  };
}

/** Wpisy historii decyzji (wdrożone / zweryfikowane). */
export function getHistoryItems(items = getWarehouseChangePlan()): WarehouseChangeItem[] {
  return items
    .filter((i) => i.status === "wdrozona" || i.status === "zweryfikowana")
    .sort((a, b) => {
      const da = a.deployedAt || a.updatedAt;
      const db = b.deployedAt || b.updatedAt;
      return db.localeCompare(da);
    });
}

/** Ranking — tylko zweryfikowane z realną różnicą. */
export function getRankedVerifiedChanges(
  items = getWarehouseChangePlan()
): WarehouseChangeItem[] {
  return items
    .filter((i) => i.status === "zweryfikowana" && i.effectDelta != null)
    .sort((a, b) => {
      const pa = Math.abs(a.effectDelta!.percent ?? a.effectDelta!.absolute);
      const pb = Math.abs(b.effectDelta!.percent ?? b.effectDelta!.absolute);
      return pb - pa;
    });
}

export type PlanSnapshot = {
  items: WarehouseChangeItem[];
  count: number;
  waitingCount: number;
  highPriorityCount: number;
  topImpact: WarehouseChangeItem | null;
  totalImpactScore: number;
  impactSummary: string;
  historyCount: number;
  verifiedCount: number;
};

export function getPlanSnapshot(items = getWarehouseChangePlan()): PlanSnapshot {
  const waiting = items.filter((i) => i.status === "nowa" || i.status === "zaplanowana");
  const activePlan = items.filter(
    (i) =>
      i.status === "nowa" ||
      i.status === "zaplanowana" ||
      i.status === "w_realizacji"
  );
  const highPriorityCount = waiting.filter((i) => i.priority === "wysoki").length;
  const topImpact = activePlan[0] ?? waiting[0] ?? null;
  const history = getHistoryItems(items);
  const verified = items.filter((i) => i.status === "zweryfikowana");
  const impactSummary =
    waiting.length === 0
      ? "Brak oczekujących zmian w harmonogramie."
      : waiting
          .slice(0, 3)
          .map((i) => effectDisplay(i).primary)
          .join(" · ");
  return {
    items,
    count: waiting.length,
    waitingCount: waiting.length,
    highPriorityCount,
    topImpact,
    totalImpactScore: waiting.reduce(
      (s, i) => s + (Number.isFinite(i.impactScore) ? i.impactScore : 0),
      0
    ),
    impactSummary,
    historyCount: history.length,
    verifiedCount: verified.length,
  };
}
