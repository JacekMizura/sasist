import { Loader2 } from "lucide-react";
import type { GusLookupResult } from "../../api/gusLookupApi";
import { CustomerGusBadges } from "./CustomerGusBadges";

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}

type Props = {
  result: GusLookupResult | null;
  loading: boolean;
  error: string | null;
  onApply: () => void;
  onDismiss: () => void;
};

export function CustomerGusLookupPanel({ result, loading, error, onApply, onDismiss }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-4 py-3 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden />
        Wyszukiwanie w GUS…
      </div>
    );
  }

  if (error && !result) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{error}</p>
    );
  }

  if (!result?.ok || !result.found) return null;

  return (
    <section className="rounded-lg border border-slate-200/90 bg-white p-4 shadow-none ring-1 ring-slate-200/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-800">Znaleziono dane firmy</h3>
          <CustomerGusBadges result={result} />
          {error ? <p className="text-xs text-amber-800">{error}</p> : null}
          {result.from_cache ? (
            <p className="text-[11px] text-slate-500">Dane z pamięci podręcznej (do 24 h).</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onApply}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Uzupełnij dane
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Zamknij
          </button>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2">
        <FieldRow label="Nazwa firmy" value={result.company_name} />
        <FieldRow label="NIP" value={result.nip} />
        <FieldRow label="REGON" value={result.regon} />
        <FieldRow label="Typ podmiotu" value={result.entity_type} />
        <FieldRow label="Status działalności" value={result.business_status} />
        <FieldRow label="Data rozpoczęcia" value={result.activity_start_date} />
        <FieldRow label="Ulica" value={result.street} />
        <FieldRow
          label="Nr / lokal"
          value={[result.house_number, result.apartment_number].filter(Boolean).join(" / ") || null}
        />
        <FieldRow label="Kod pocztowy" value={result.postal_code} />
        <FieldRow label="Miasto" value={result.city} />
        <FieldRow label="Województwo" value={result.voivodeship} />
        <FieldRow label="PKD" value={result.pkd} />
        <FieldRow label="Status VAT" value={result.vat_status} />
      </dl>
    </section>
  );
}
