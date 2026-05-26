/** Operacyjne powody odrzucenia zwrotu (WMS + panel) — brak osobnego API słownika. */

export const WMS_REJECT_OTHER_ID = "ops_other";

type WmsRejectReasonGroup = { label: string; reasons: { id: string; label: string }[] };

export const WMS_REJECT_REASON_GROUPS: WmsRejectReasonGroup[] = [
  {
    label: "Zamówienie",
    reasons: [
      { id: "order_no_link", label: "Brak powiązania z zamówieniem" },
      { id: "order_wrong_product", label: "Nie ten produkt" },
      { id: "order_missing_in_pack", label: "Brak produktu w paczce" },
      { id: "order_incomplete_set", label: "Niekompletny zestaw" },
    ],
  },
  {
    label: "Termin",
    reasons: [{ id: "time_past_deadline", label: "Po terminie zwrotu" }],
  },
  {
    label: "Produkt",
    reasons: [
      { id: "product_used", label: "Produkt używany" },
      { id: "product_damaged_by_customer", label: "Produkt uszkodzony przez klienta" },
    ],
  },
  {
    label: "Regulamin",
    reasons: [
      { id: "policy_non_returnable", label: "Produkt wyłączony ze zwrotu" },
      { id: "policy_hygiene", label: "Produkt higieniczny" },
    ],
  },
  {
    label: "Operacyjne",
    reasons: [
      { id: "ops_cancelled", label: "Zwrot anulowany" },
      { id: "ops_duplicate", label: "Duplikat zwrotu" },
      { id: WMS_REJECT_OTHER_ID, label: "Inny powód" },
    ],
  },
];

/** Opcjonalne powody z konfiguracji modułu zwrotów (kategoria REJECTED). */
export function wmsRejectReasonSelectOptions(productRejectDecisions?: { code: string; label: string }[] | null) {
  const extra =
    productRejectDecisions?.filter((r) => String(r.code ?? "").trim()) ?? [];
  return (
    <>
      {extra.length > 0 ? (
        <optgroup key="decyzje-produktowe" label="Decyzja produktowa">
          {extra.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </optgroup>
      ) : null}
      {WMS_REJECT_REASON_GROUPS.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.reasons.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
