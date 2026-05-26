/**
 * Wspólna konfiguracja silników propozycji opakowań (Smart + 3D), do czasu API magazynu.
 * Próg identycznych zamówień dotyczy wyłącznie Smart Matching; 3D nie uczy się z historii.
 */

const STORAGE_KEY = "wms.smart_matching.config.v1";

export type SmartMatchingIdenticalThreshold = 2 | 3 | 5;

export type WmsPackagingProposalLocalConfigV1 = {
  /** Globalnie: czy silniki propozycji opakowań (Smart + 3D) są aktywne. */
  packagingSuggestionsEnabled: boolean;
  /** Po ilu identycznych spakowanych zamówieniach tworzyć regułę (tylko Smart Matching). */
  identicalOrdersThreshold: SmartMatchingIdenticalThreshold;
  /** Statusy panelu — wejście w dowolny z nich uruchamia generowanie propozycji (trigger workflow). */
  proposalInitStatusIds: number[];
  /** Po udanym dopasowaniu opakowania — automatyczne etykiety wysyłki. */
  autoLabelAfterMatchEnabled: boolean;
  /** Statusy workflow, przy których dozwolone jest auto-generowanie etykiet (po dopasowaniu). */
  autoLabelWorkflowStatusIds: number[];
};

export const DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG: WmsPackagingProposalLocalConfigV1 = {
  packagingSuggestionsEnabled: true,
  identicalOrdersThreshold: 3,
  proposalInitStatusIds: [],
  autoLabelAfterMatchEnabled: false,
  autoLabelWorkflowStatusIds: [],
};

type LegacyPartial = Partial<WmsPackagingProposalLocalConfigV1> & {
  /** @deprecated migracja z pojedynczego statusu */
  proposalInitStatusId?: number | null;
};

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

function normalizeConfig(partial: LegacyPartial | null | undefined): WmsPackagingProposalLocalConfigV1 {
  const base = { ...DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG };
  if (!partial || typeof partial !== "object") return base;
  if (typeof partial.packagingSuggestionsEnabled === "boolean") {
    base.packagingSuggestionsEnabled = partial.packagingSuggestionsEnabled;
  }
  const th = partial.identicalOrdersThreshold;
  if (th === 2 || th === 3 || th === 5) base.identicalOrdersThreshold = th;

  if (Array.isArray(partial.proposalInitStatusIds)) {
    base.proposalInitStatusIds = partial.proposalInitStatusIds
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);
  } else if (partial.proposalInitStatusId != null) {
    const n = Number(partial.proposalInitStatusId);
    base.proposalInitStatusIds = Number.isFinite(n) && n > 0 ? [n] : [];
  }

  if (typeof partial.autoLabelAfterMatchEnabled === "boolean") {
    base.autoLabelAfterMatchEnabled = partial.autoLabelAfterMatchEnabled;
  }
  if (Array.isArray(partial.autoLabelWorkflowStatusIds)) {
    base.autoLabelWorkflowStatusIds = partial.autoLabelWorkflowStatusIds
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);
  }
  return base;
}

export function loadWmsPackagingProposalLocalConfig(warehouseId: number): WmsPackagingProposalLocalConfigV1 {
  const map = parseStore();
  const row = map[String(warehouseId)];
  return normalizeConfig(row as LegacyPartial);
}

export function saveWmsPackagingProposalLocalConfig(
  warehouseId: number,
  config: WmsPackagingProposalLocalConfigV1,
): void {
  try {
    const map = parseStore();
    map[String(warehouseId)] = normalizeConfig(config);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Alias dla modułu Smart Matching (ta sama konfiguracja). */
export type WmsSmartMatchingLocalConfigV1 = WmsPackagingProposalLocalConfigV1;
export const DEFAULT_WMS_SMART_MATCHING_LOCAL_CONFIG = DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG;
export const loadWmsSmartMatchingLocalConfig = loadWmsPackagingProposalLocalConfig;
export const saveWmsSmartMatchingLocalConfig = saveWmsPackagingProposalLocalConfig;
