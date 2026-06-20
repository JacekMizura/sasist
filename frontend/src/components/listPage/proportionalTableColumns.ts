/** Stałe kolumny systemowe — wspólne dla tabel z konfigurowalnymi kolumnami użytkownika. */
export const PROPORTIONAL_TABLE_SYSTEM_WIDTHS = {
  checkboxPx: 56,
  logoPx: 80,
  actionsPx: 120,
  nameMinPx: 250,
  nameMaxPx: 500,
  nameFr: 2,
  dynamicFr: 1,
  /** Minimalna szerokość pojedynczej kolumny dynamicznej przy wąskim viewporcie. */
  dynamicMinPx: 72,
  /** Dodatkowe kolumny o stałej szerokości (np. „Poz.”) — odejmowane przed podziałem fr. */
  extraFixedColumnsPx: 0,
} as const;

/** Układ bez kolumny logo (np. Dostawcy). */
export const PROPORTIONAL_TABLE_NO_LOGO = {
  logoPx: 0,
} as const;

export type ProportionalTableLayoutConfig = {
  checkboxPx: number;
  logoPx: number;
  actionsPx: number;
  nameMinPx: number;
  nameMaxPx: number;
  nameFr: number;
  dynamicFr: number;
  dynamicMinPx: number;
  extraFixedColumnsPx?: number;
};

export type ProportionalTableWidths = {
  checkbox: number;
  logo: number;
  name: number;
  dynamic: number;
  actions: number;
};

function resolveLayoutConfig(partial?: Partial<ProportionalTableLayoutConfig>): ProportionalTableLayoutConfig {
  return { ...PROPORTIONAL_TABLE_SYSTEM_WIDTHS, ...partial };
}

export function proportionalTableMinWidthPx(
  dynamicColumnCount: number,
  config?: Partial<ProportionalTableLayoutConfig>,
): number {
  const cfg = resolveLayoutConfig(config);
  const n = Math.max(0, dynamicColumnCount);
  const extra = cfg.extraFixedColumnsPx ?? 0;
  return cfg.checkboxPx + cfg.logoPx + cfg.nameMinPx + cfg.actionsPx + extra + n * cfg.dynamicMinPx;
}

/**
 * Wylicza szerokości kolumn: stałe (checkbox, logo?, akcje) + nazwa (2fr, clamp) + dynamiczne (1fr).
 */
export function computeProportionalTableWidths(
  tableWidthPx: number,
  dynamicColumnCount: number,
  config?: Partial<ProportionalTableLayoutConfig>,
): ProportionalTableWidths {
  const cfg = resolveLayoutConfig(config);
  const extra = cfg.extraFixedColumnsPx ?? 0;
  const fixed = cfg.checkboxPx + cfg.logoPx + cfg.actionsPx + extra;
  const available = Math.max(0, tableWidthPx - fixed);
  const n = Math.max(0, dynamicColumnCount);

  if (n === 0) {
    const nameWidth = Math.min(Math.max(available, cfg.nameMinPx), cfg.nameMaxPx);
    return {
      checkbox: cfg.checkboxPx,
      logo: cfg.logoPx,
      name: Math.round(nameWidth),
      dynamic: 0,
      actions: cfg.actionsPx,
    };
  }

  const totalFr = cfg.nameFr + n * cfg.dynamicFr;
  let nameWidth = (available * cfg.nameFr) / totalFr;
  nameWidth = Math.min(Math.max(nameWidth, cfg.nameMinPx), cfg.nameMaxPx);

  let dynamicBudget = available - nameWidth;
  let dynamicEach = dynamicBudget / n;

  if (dynamicEach < cfg.dynamicMinPx && nameWidth > cfg.nameMinPx) {
    const neededForDynamic = cfg.dynamicMinPx * n;
    const maxNameForDynamic = Math.max(available - neededForDynamic, cfg.nameMinPx);
    nameWidth = Math.min(nameWidth, maxNameForDynamic);
    nameWidth = Math.max(nameWidth, cfg.nameMinPx);
    dynamicBudget = available - nameWidth;
    dynamicEach = dynamicBudget / n;
  }

  return {
    checkbox: cfg.checkboxPx,
    logo: cfg.logoPx,
    name: Math.round(nameWidth),
    dynamic: Math.max(Math.round(dynamicEach), 0),
    actions: cfg.actionsPx,
  };
}
