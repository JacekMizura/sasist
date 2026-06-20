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
} as const;

export type ProportionalTableWidths = {
  checkbox: number;
  logo: number;
  name: number;
  dynamic: number;
  actions: number;
};

export function proportionalTableMinWidthPx(dynamicColumnCount: number): number {
  const { checkboxPx, logoPx, actionsPx, nameMinPx, dynamicMinPx } = PROPORTIONAL_TABLE_SYSTEM_WIDTHS;
  const n = Math.max(0, dynamicColumnCount);
  return checkboxPx + logoPx + nameMinPx + actionsPx + n * dynamicMinPx;
}

/**
 * Wylicza szerokości kolumn: stałe (checkbox, logo, akcje) + nazwa (2fr, clamp) + dynamiczne (1fr).
 * Checkbox i akcje nie uczestniczą w podziale fr.
 */
export function computeProportionalTableWidths(
  tableWidthPx: number,
  dynamicColumnCount: number,
): ProportionalTableWidths {
  const cfg = PROPORTIONAL_TABLE_SYSTEM_WIDTHS;
  const fixed = cfg.checkboxPx + cfg.logoPx + cfg.actionsPx;
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
