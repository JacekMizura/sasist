/**
 * UI-only WMS operation labels. Backend entity/enum names are unchanged.
 *
 * - Rozlokowanie PZ — inbound putaway after receiving (PZ / putaway tab)
 * - Rozlokowanie produktów — shortage relocation, carrier distribution (RELOCATION task)
 * - Przesunięcie magazynowe — MM stock transfer (separate tab)
 * - Dogrywka — recovery pick after OMS decision
 */
export const WMS_UI = {
  putawayPz: "Rozlokowanie PZ",
  putawayPzPending: "Do rozlokowania PZ",
  productRelocation: "Rozlokowanie produktów",
  productRelocationPending: "Do rozlokowania produktów",
  recoveryPick: "Dogrywka",
  recoveryPickFull: "Dogrywka zbierki",
  mmTransfer: "Przesunięcie magazynowe",
} as const;
