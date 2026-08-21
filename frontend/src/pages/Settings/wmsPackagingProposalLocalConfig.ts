/**
 * Shared packaging settings shape (Smart + 3D + strategy / workflow).
 * SSOT: API ``/wms/smart-matching/settings``.
 */

export type SmartMatchingIdenticalThreshold = 2 | 3 | 5;

export type PackagingStrategyApi =
  | "SMART_ONLY"
  | "THREE_D_ONLY"
  | "SMART_THEN_3D"
  | "THREE_D_OVERRIDE_SMART";

export type WmsPackagingProposalLocalConfigV1 = {
  /** Smart Matching engine enable (legacy API field ``enabled`` mirrors this). */
  smartEnabled: boolean;
  /** 3D Matching engine enable. */
  threeDEnabled: boolean;
  /** Filler reserve 0–99 (% of carton volume). */
  threeDFillerPercent: number;
  /** Shared Smart↔3D strategy. */
  packagingStrategy: PackagingStrategyApi;
  /** Tryb Smart Matching — próg uczenia (2 / 3 / 5). */
  identicalOrdersThreshold: SmartMatchingIdenticalThreshold;
  /** Status inicjujący dobór opakowania (pipeline). */
  proposalInitStatusId: number | null;
  /** @deprecated migracja — preferuj proposalInitStatusId */
  proposalInitStatusIds: number[];
  autoLabelAfterMatchEnabled: boolean;
  autoLabelWorkflowStatusIds: number[];
};

export const DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG: WmsPackagingProposalLocalConfigV1 = {
  smartEnabled: true,
  threeDEnabled: true,
  threeDFillerPercent: 0,
  packagingStrategy: "SMART_THEN_3D",
  identicalOrdersThreshold: 3,
  proposalInitStatusId: null,
  proposalInitStatusIds: [],
  autoLabelAfterMatchEnabled: false,
  autoLabelWorkflowStatusIds: [],
};

/** @deprecated alias — prefer smartEnabled */
export type WmsSmartMatchingLocalConfigV1 = WmsPackagingProposalLocalConfigV1;
export const DEFAULT_WMS_SMART_MATCHING_LOCAL_CONFIG = DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG;

const STRATEGIES: PackagingStrategyApi[] = [
  "SMART_ONLY",
  "THREE_D_ONLY",
  "SMART_THEN_3D",
  "THREE_D_OVERRIDE_SMART",
];

function normalizeStrategy(raw: unknown): PackagingStrategyApi {
  const s = String(raw || "").trim().toUpperCase();
  return (STRATEGIES as string[]).includes(s) ? (s as PackagingStrategyApi) : "SMART_THEN_3D";
}

export function configFromApi(api: {
  enabled?: boolean;
  smart_enabled?: boolean;
  three_d_enabled?: boolean;
  three_d_filler_percent?: number;
  packaging_strategy?: string;
  identical_orders_threshold: number;
  proposal_init_status_id: number | null;
  auto_label_enabled: boolean;
  auto_label_status_ids: number[];
}): WmsPackagingProposalLocalConfigV1 {
  const th = api.identical_orders_threshold;
  const smart =
    typeof api.smart_enabled === "boolean"
      ? api.smart_enabled
      : typeof api.enabled === "boolean"
        ? api.enabled
        : true;
  const threeD = typeof api.three_d_enabled === "boolean" ? api.three_d_enabled : true;
  let filler = Number(api.three_d_filler_percent);
  if (!Number.isFinite(filler)) filler = 0;
  filler = Math.min(99, Math.max(0, filler));
  return {
    smartEnabled: Boolean(smart),
    threeDEnabled: Boolean(threeD),
    threeDFillerPercent: filler,
    packagingStrategy: normalizeStrategy(api.packaging_strategy),
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
    enabled: Boolean(config.smartEnabled),
    smart_enabled: Boolean(config.smartEnabled),
    three_d_enabled: Boolean(config.threeDEnabled),
    three_d_filler_percent: Math.min(99, Math.max(0, Number(config.threeDFillerPercent) || 0)),
    packaging_strategy: normalizeStrategy(config.packagingStrategy),
    identical_orders_threshold: config.identicalOrdersThreshold,
    proposal_init_status_id: initId,
    auto_label_enabled: Boolean(config.autoLabelAfterMatchEnabled),
    auto_label_status_ids: [...config.autoLabelWorkflowStatusIds].sort((a, b) => a - b),
  };
}
