/**
 * UI-only WMS operation labels. Backend entity/enum names are unchanged.
 *
 * DOMAIN (do not merge):
 * - Narzędzie zbierania — wózek / koszyk / tote (krótkotrwała sesja pickingu)
 * - Nośnik logistyczny — paleta, skrzynia, kontener (jednostka magazynowa, encja WMS)
 *
 * Rozlokowanie — jeden workflow; cel: LOCATION lub CARRIER_UNIT (nie osobna kolejka).
 */
export const WMS_UI = {
  putawayPz: "Rozlokowanie PZ",
  putawayPzPending: "Do rozlokowania PZ",
  productRelocation: "Rozlokowanie produktów",
  productRelocationPending: "Do rozlokowania produktów",
  recoveryPick: "Dogrywka",
  recoveryPickFull: "Dogrywka zbierki",
  mmTransfer: "Przesunięcie magazynowe",
  pickingTool: "Narzędzie zbierania",
  packingCart: "Wózek pakowania",
  relocationTargetCarrier: "Nośnik",
  relocationTargetLocation: "Lokacja",
} as const;

/** UI alias for backend relocation_mode / relocation_target_type. */
export type RelocationTargetTypeUi = "LOCATION" | "CARRIER_UNIT";

export function mapRelocationModeToTargetType(
  mode: string | null | undefined,
): RelocationTargetTypeUi {
  const m = (mode ?? "").trim().toUpperCase();
  if (m === "LOCATION") return "LOCATION";
  return "CARRIER_UNIT";
}

export function relocationTargetRowLabel(type: RelocationTargetTypeUi): string {
  return type === "LOCATION" ? WMS_UI.relocationTargetLocation : WMS_UI.relocationTargetCarrier;
}
