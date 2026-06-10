import type { GusLookupResult } from "../../api/customersGusApi";

const pill = "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 sm:text-sm";

export function CustomerGusBadges({ result }: { result: GusLookupResult | null }) {
  if (!result?.ok || !result.found) return null;

  const badges: { label: string; cls: string }[] = [];

  if (result.gus_verified) {
    badges.push({
      label: "Zweryfikowano w GUS",
      cls: "bg-sky-50 text-sky-900 ring-sky-200/90",
    });
  }
  if (result.vat_active === true && result.vat_status_source === "rejestr_vat") {
    badges.push({
      label: "Aktywny VAT",
      cls: "bg-emerald-50 text-emerald-800 ring-emerald-200/90",
    });
  }
  if (result.vat_ue === true && result.vat_ue_source === "vies") {
    badges.push({
      label: "VAT UE",
      cls: "bg-violet-50 text-violet-900 ring-violet-200/90",
    });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((b) => (
        <span key={b.label} className={`${pill} ${b.cls}`}>
          {b.label}
        </span>
      ))}
    </div>
  );
}
