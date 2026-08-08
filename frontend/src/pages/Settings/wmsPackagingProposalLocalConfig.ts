/**
 * Wspólny kształt konfiguracji silników propozycji opakowań (Smart + 3D).
 * Źródło prawdy: API ``/wms/smart-matching/settings`` (nie localStorage).
 */

export type SmartMatchingIdenticalThreshold = 2 | 3 | 5;

export type WmsPackagingProposalLocalConfigV1 = {
  /** Włącz propozycje opakowań do zamówień. */
  packagingSuggestionsEnabled: boolean;
  /** Tryb Smart Matching — próg uczenia (2 / 3 / 5). */
  identicalOrdersThreshold: SmartMatchingIdenticalThreshold;
  /** Status inicjujący propozycję opakowania (jeden). */
  proposalInitStatusId: number | null;
  /** @deprecated migracja — preferuj proposalInitStatusId */
  proposalInitStatusIds: number[];
  autoLabelAfterMatchEnabled: boolean;
  autoLabelWorkflowStatusIds: number[];
};

export const DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG: WmsPackagingProposalLocalConfigV1 = {
  packagingSuggestionsEnabled: true,
  identicalOrdersThreshold: 3,
  proposalInitStatusId: null,
  proposalInitStatusIds: [],
  autoLabelAfterMatchEnabled: false,
  autoLabelWorkflowStatusIds: [],
};

export type WmsSmartMatchingLocalConfigV1 = WmsPackagingProposalLocalConfigV1;
export const DEFAULT_WMS_SMART_MATCHING_LOCAL_CONFIG = DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG;

export function configFromApi(api: {
  enabled: boolean;
  identical_orders_threshold: number;
  proposal_init_status_id: number | null;
  auto_label_enabled: boolean;
  auto_label_status_ids: number[];
}): WmsPackagingProposalLocalConfigV1 {
  const th = api.identical_orders_threshold;
  return {
    packagingSuggestionsEnabled: Boolean(api.enabled),
    identicalOrdersThreshold: th === 2 || th === 3 || th === 5 ? th : 3,
    proposalInitStatusId:
      api.proposal_init_status_id != null && Number(api.proposal_init_status_id) > 0
        ? Number(api.proposal_init_status_id)
        : null,
    proposalInitStatusIds:
      api.proposal_init_status_id != null && Number(api.proposal_init_status_id) > 0
        ? [Number(api.proposal_init_status_id)]
        : [],
    autoLabelAfterMatchEnabled: Boolean(api.auto_label_enabled),
    autoLabelWorkflowStatusIds: Array.isArray(api.auto_label_status_ids)
      ? api.auto_label_status_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [],
  };
}

export function configToApiBody(
  config: WmsPackagingProposalLocalConfigV1,
  tenantId: number,
  warehouseId: number,
) {
  const initId =
    config.proposalInitStatusId != null && config.proposalInitStatusId > 0
      ? config.proposalInitStatusId
      : config.proposalInitStatusIds[0] != null && config.proposalInitStatusIds[0] > 0
        ? config.proposalInitStatusIds[0]
        : null;
  return {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    enabled: Boolean(config.packagingSuggestionsEnabled),
    identical_orders_threshold: config.identicalOrdersThreshold,
    proposal_init_status_id: initId,
    auto_label_enabled: Boolean(config.autoLabelAfterMatchEnabled),
    auto_label_status_ids: [...config.autoLabelWorkflowStatusIds].sort((a, b) => a - b),
  };
}

/** @deprecated localStorage removed — kept as no-op for import safety. */
export function loadWmsPackagingProposalLocalConfig(
  _warehouseId: number,
): WmsPackagingProposalLocalConfigV1 {
  return { ...DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG };
}

/** @deprecated */
export function saveWmsPackagingProposalLocalConfig(
  _warehouseId: number,
  _config: WmsPackagingProposalLocalConfigV1,
): void {
  /* API is SSOT */
}

export const loadWmsSmartMatchingLocalConfig = loadWmsPackagingProposalLocalConfig;
export const saveWmsSmartMatchingLocalConfig = saveWmsPackagingProposalLocalConfig;
