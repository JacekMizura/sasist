/**
 * Shared validation: required product master data at WMS receiving.
 * Keep in sync with backend/services/product_receiving_requirements.py
 */

export type ProductReceivingValues = {
  height?: number | null;
  width?: number | null;
  length?: number | null;
  weight?: number | null;
  bulk_ean?: string | null;
  units_per_carton?: number | null;
  carton_length_cm?: number | null;
  carton_width_cm?: number | null;
  carton_height_cm?: number | null;
  carton_weight_kg?: number | null;
  metadata_json?: string | Record<string, unknown> | null;
};

export type ProductReceivingRequirements = {
  require_recv_height?: boolean;
  require_recv_width?: boolean;
  require_recv_length?: boolean;
  require_recv_weight?: boolean;
  require_recv_master_carton?: boolean;
  require_recv_master_carton_ean?: boolean;
  require_recv_master_carton_qty?: boolean;
  require_recv_master_carton_dims?: boolean;
  require_recv_master_carton_weight?: boolean;
};

export type MissingReceivingField = {
  key: string;
  label: string;
  group: "basic" | "carton";
};

export type ProductReceivingValidation = {
  complete: boolean;
  missing: MissingReceivingField[];
  badgeLabels: string[];
  showCompletionModal: boolean;
  forceWmsCompletion: boolean;
};

function positive(v: unknown): boolean {
  const n = Number(v);
  return Number.isFinite(n) && n > 1e-9;
}

/** Master has an explicit weight including verified 0 kg (null/undefined = not provided). Sync with BE weight_provided. */
function weightProvided(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false;
  return Number.isFinite(Number(v));
}

function nonEmpty(v: unknown): boolean {
  return Boolean(String(v ?? "").trim());
}

export function productCreatedInWms(metadataJson?: string | Record<string, unknown> | null): boolean {
  if (!metadataJson) return false;
  let meta: Record<string, unknown> | null = null;
  if (typeof metadataJson === "string") {
    try {
      const p = JSON.parse(metadataJson) as unknown;
      meta = p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
    } catch {
      return false;
    }
  } else {
    meta = metadataJson;
  }
  if (!meta) return false;
  const src = String(meta.creation_source ?? "").trim().toUpperCase();
  return src === "WMS_RECEIVING" || meta.is_incomplete === true;
}

function badgeLabelsFromMissing(missing: MissingReceivingField[]): string[] {
  const keys = new Set(missing.map((m) => m.key));
  const labels: string[] = [];
  if (keys.has("height") || keys.has("width") || keys.has("length")) labels.push("Brak wymiarów");
  if (keys.has("weight")) labels.push("Brak wagi");
  if (keys.has("bulk_ean") && keys.size === 1) labels.push("Brak EAN kartonu");
  else if (keys.has("master_carton")) labels.push("Brak kartonu");
  else if ([...keys].some((k) => k.startsWith("carton") || k === "bulk_ean" || k === "units_per_carton"))
    labels.push("Brak danych kartonu");
  return labels;
}

/** Keys of missing required master-data fields (for badges, lists, filters). */
export function getMissingRequiredFields(
  product: ProductReceivingValues & ProductReceivingRequirements,
): string[] {
  return validateRequiredProductData(product).missing.map((m) => m.key);
}

export function validateRequiredProductData(
  product: ProductReceivingValues & ProductReceivingRequirements,
  effectiveRequirements?: ProductReceivingRequirements,
): ProductReceivingValidation {
  const req = effectiveRequirements ?? product;
  const missing: MissingReceivingField[] = [];
  const forceWms = productCreatedInWms(product.metadata_json);

  if (req.require_recv_height && !positive(product.height))
    missing.push({ key: "height", label: "Wysokość", group: "basic" });
  if (req.require_recv_width && !positive(product.width))
    missing.push({ key: "width", label: "Szerokość", group: "basic" });
  if (req.require_recv_length && !positive(product.length))
    missing.push({ key: "length", label: "Długość", group: "basic" });
  // Explicit 0 kg counts as provided (same as backend master_weight_complete_for_receiving).
  if (req.require_recv_weight && !weightProvided(product.weight))
    missing.push({ key: "weight", label: "Waga", group: "basic" });

  const hasCarton = nonEmpty(product.bulk_ean) || positive(product.units_per_carton);
  if (req.require_recv_master_carton && !hasCarton)
    missing.push({ key: "master_carton", label: "Opakowanie zbiorcze", group: "carton" });
  if (req.require_recv_master_carton_ean && !nonEmpty(product.bulk_ean))
    missing.push({ key: "bulk_ean", label: "EAN opakowania zbiorczego", group: "carton" });
  if (req.require_recv_master_carton_qty && !positive(product.units_per_carton))
    missing.push({ key: "units_per_carton", label: "Ilość w opakowaniu zbiorczym", group: "carton" });
  const dimsOk =
    positive(product.carton_length_cm) && positive(product.carton_width_cm) && positive(product.carton_height_cm);
  if (req.require_recv_master_carton_dims && !dimsOk)
    missing.push({ key: "carton_dimensions", label: "Wymiary opakowania zbiorczego", group: "carton" });
  if (req.require_recv_master_carton_weight && !positive(product.carton_weight_kg))
    missing.push({ key: "carton_weight_kg", label: "Waga opakowania zbiorczego", group: "carton" });

  const hasRequirements = Boolean(
    req.require_recv_height ||
      req.require_recv_width ||
      req.require_recv_length ||
      req.require_recv_weight ||
      req.require_recv_master_carton ||
      req.require_recv_master_carton_ean ||
      req.require_recv_master_carton_qty ||
      req.require_recv_master_carton_dims ||
      req.require_recv_master_carton_weight,
  );

  const complete = missing.length === 0;
  const showCompletionModal = forceWms || (hasRequirements && missing.length > 0);

  return {
    complete,
    missing,
    badgeLabels: badgeLabelsFromMissing(missing),
    showCompletionModal,
    forceWmsCompletion: forceWms,
  };
}
