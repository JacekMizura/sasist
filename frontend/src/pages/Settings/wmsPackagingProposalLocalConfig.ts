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
  /** Status inicjujący Smart Matching. */
  smartProposalInitStatusId: number | null;
  /** Status inicjujący 3D Matching. */
  threeDProposalInitStatusId: number | null;
  smartAutoLabelEnabled: boolean;
  smartAutoLabelStatusIds: number[];
  threeDAutoLabelEnabled: boolean;
  threeDAutoLabelStatusIds: number[];
  /** @deprecated legacy mirror — prefer smartProposalInitStatusId */
  proposalInitStatusId: number | null;
  /** @deprecated */
  proposalInitStatusIds: number[];
  /** @deprecated legacy mirror — prefer smartAutoLabel* */
  autoLabelAfterMatchEnabled: boolean;
  /** @deprecated */
  autoLabelWorkflowStatusIds: number[];
};

export const DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG: WmsPackagingProposalLocalConfigV1 = {
  smartEnabled: true,
  threeDEnabled: true,
  threeDFillerPercent: 0,
  packagingStrategy: "SMART_THEN_3D",
  identicalOrdersThreshold: 3,
  smartProposalInitStatusId: null,
  threeDProposalInitStatusId: null,
  smartAutoLabelEnabled: false,
  smartAutoLabelStatusIds: [],
  threeDAutoLabelEnabled: false,
  threeDAutoLabelStatusIds: [],
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

function statusId(raw: unknown): number | null {
  return raw != null && Number(raw) > 0 ? Number(raw) : null;
}

function statusIds(raw: unknown): number[] {
  return Array.isArray(raw)
    ? raw.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : [];
}

export function configFromApi(api: {
  enabled?: boolean;
  smart_enabled?: boolean;
  three_d_enabled?: boolean;
  three_d_filler_percent?: number;
  packaging_strategy?: string;
  identical_orders_threshold: number;
  proposal_init_status_id?: number | null;
  auto_label_enabled?: boolean;
  auto_label_status_ids?: number[];
  smart_proposal_init_status_id?: number | null;
  smart_auto_label_enabled?: boolean;
  smart_auto_label_status_ids?: number[];
  three_d_proposal_init_status_id?: number | null;
  three_d_auto_label_enabled?: boolean;
  three_d_auto_label_status_ids?: number[];
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

  const smartInit =
    statusId(api.smart_proposal_init_status_id) ?? statusId(api.proposal_init_status_id);
  const threeDInit =
    statusId(api.three_d_proposal_init_status_id) ?? statusId(api.proposal_init_status_id);
  const smartAl =
    typeof api.smart_auto_label_enabled === "boolean"
      ? api.smart_auto_label_enabled
      : Boolean(api.auto_label_enabled);
  const threeDAl =
    typeof api.three_d_auto_label_enabled === "boolean"
      ? api.three_d_auto_label_enabled
      : Boolean(api.auto_label_enabled);
  const smartAlIds =
    api.smart_auto_label_status_ids != null
      ? statusIds(api.smart_auto_label_status_ids)
      : statusIds(api.auto_label_status_ids);
  const threeDAlIds =
    api.three_d_auto_label_status_ids != null
      ? statusIds(api.three_d_auto_label_status_ids)
      : statusIds(api.auto_label_status_ids);

  return {
    smartEnabled: Boolean(smart),
    threeDEnabled: Boolean(threeD),
    threeDFillerPercent: filler,
    packagingStrategy: normalizeStrategy(api.packaging_strategy),
    identicalOrdersThreshold: th === 2 || th === 3 || th === 5 ? th : 3,
    smartProposalInitStatusId: smartInit,
    threeDProposalInitStatusId: threeDInit,
    smartAutoLabelEnabled: smartAl,
    smartAutoLabelStatusIds: smartAlIds,
    threeDAutoLabelEnabled: threeDAl,
    threeDAutoLabelStatusIds: threeDAlIds,
    proposalInitStatusId: smartInit,
    proposalInitStatusIds: smartInit != null ? [smartInit] : [],
    autoLabelAfterMatchEnabled: smartAl,
    autoLabelWorkflowStatusIds: smartAlIds,
  };
}

export function configToApiBody(
  config: WmsPackagingProposalLocalConfigV1,
  tenantId: number,
  warehouseId: number,
): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    enabled: Boolean(config.smartEnabled),
    smart_enabled: Boolean(config.smartEnabled),
    three_d_enabled: Boolean(config.threeDEnabled),
    three_d_filler_percent: config.threeDFillerPercent,
    packaging_strategy: normalizeStrategy(config.packagingStrategy),
    identical_orders_threshold: config.identicalOrdersThreshold,
    smart_proposal_init_status_id: config.smartProposalInitStatusId,
    smart_auto_label_enabled: Boolean(config.smartAutoLabelEnabled),
    smart_auto_label_status_ids: [...config.smartAutoLabelStatusIds].sort((a, b) => a - b),
    three_d_proposal_init_status_id: config.threeDProposalInitStatusId,
    three_d_auto_label_enabled: Boolean(config.threeDAutoLabelEnabled),
    three_d_auto_label_status_ids: [...config.threeDAutoLabelStatusIds].sort((a, b) => a - b),
    // Legacy mirrors (Smart) for older readers.
    proposal_init_status_id: config.smartProposalInitStatusId,
    auto_label_enabled: Boolean(config.smartAutoLabelEnabled),
    auto_label_status_ids: [...config.smartAutoLabelStatusIds].sort((a, b) => a - b),
  };
}
