/**
 * Parametry geometrycznego silnika 3D Matching (lokalnie do czasu API magazynu).
 * Nie dotyczą przepływu/statusów — to wyłącznie obliczenia dopasowania fizycznego.
 */

const STORAGE_KEY = "wms.3d_matching.engine_params.v1";

export type ThreeDMatchingStrategy = "SMALLEST_CARTON" | "BEST_FILL" | "LOWEST_COST";

export type WmsThreeDEngineLocalConfigV1 = {
  /** Tolerancja wymiarów produktu / szumu pomiaru (mm). */
  dimensionToleranceMm: number;
  /** Margines bezpieczeństwa wewnątrz kartonu (mm). */
  safetyMarginMm: number;
  /** Redukcja efektywnych wymiarów produktu dla zapasu (0–100%). */
  dimensionReductionPercent: number;
  strategiaDopasowania: ThreeDMatchingStrategy;
  allowProductRotation: boolean;
  allowOperatorOverride: boolean;
  /** Minimalna pewność propozycji (0–100), poniżej — odrzuć lub flaguj. */
  minConfidencePercent: number;
};

export const DEFAULT_WMS_THREE_D_ENGINE_LOCAL_CONFIG: WmsThreeDEngineLocalConfigV1 = {
  dimensionToleranceMm: 2,
  safetyMarginMm: 5,
  dimensionReductionPercent: 0,
  strategiaDopasowania: "BEST_FILL",
  allowProductRotation: true,
  allowOperatorOverride: true,
  minConfidencePercent: 50,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function parseStore(): Record<string, unknown> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return {};
    return o as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeConfig(partial: Partial<WmsThreeDEngineLocalConfigV1> | null | undefined): WmsThreeDEngineLocalConfigV1 {
  const base = { ...DEFAULT_WMS_THREE_D_ENGINE_LOCAL_CONFIG };
  if (!partial || typeof partial !== "object") return base;

  const tol = Number(partial.dimensionToleranceMm);
  if (Number.isFinite(tol)) base.dimensionToleranceMm = clamp(tol, 0, 50);

  const margin = Number(partial.safetyMarginMm);
  if (Number.isFinite(margin)) base.safetyMarginMm = clamp(margin, 0, 100);

  const red = Number(partial.dimensionReductionPercent);
  if (Number.isFinite(red)) base.dimensionReductionPercent = clamp(red, 0, 30);

  const s = partial.strategiaDopasowania;
  if (s === "SMALLEST_CARTON" || s === "BEST_FILL" || s === "LOWEST_COST") {
    base.strategiaDopasowania = s;
  }

  if (typeof partial.allowProductRotation === "boolean") base.allowProductRotation = partial.allowProductRotation;
  if (typeof partial.allowOperatorOverride === "boolean") base.allowOperatorOverride = partial.allowOperatorOverride;

  const conf = Number(partial.minConfidencePercent);
  if (Number.isFinite(conf)) base.minConfidencePercent = clamp(Math.round(conf), 0, 100);

  return base;
}

export function loadWmsThreeDEngineLocalConfig(warehouseId: number): WmsThreeDEngineLocalConfigV1 {
  const map = parseStore();
  const row = map[String(warehouseId)];
  return normalizeConfig(row as Partial<WmsThreeDEngineLocalConfigV1>);
}

export function saveWmsThreeDEngineLocalConfig(warehouseId: number, config: WmsThreeDEngineLocalConfigV1): void {
  try {
    const map = parseStore();
    map[String(warehouseId)] = normalizeConfig(config);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
