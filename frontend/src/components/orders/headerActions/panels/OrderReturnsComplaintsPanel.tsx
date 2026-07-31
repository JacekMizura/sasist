import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import type { OrderHeaderCaseRow } from "../useOrderHeaderCases";
import {
  odHeaderActionFooterLinkClass,
  odHeaderActionPrimaryCtaClass,
  odHeaderActionSectionTitleClass,
} from "../orderHeaderActionTokens";

type Props = {
  loading: boolean;
  error: string | null;
  returns: OrderHeaderCaseRow[];
  complaints: OrderHeaderCaseRow[];
  onAddReturn: () => void;
  onAddComplaint: () => void;
};

function CaseList({ title, rows }: { title: string; rows: OrderHeaderCaseRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="space-y-1.5">
      <p className={odHeaderActionSectionTitleClass}>{title}</p>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li
            key={`${row.kind}-${row.id}`}
            className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{row.number}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {row.status}
                  {row.date ? ` · ${row.date}` : ""}
                  {row.owner ? ` · ${row.owner}` : ""}
                </p>
              </div>
              <Link
                to={row.openPath}
                className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
              >
                Otwórz
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OrderReturnsComplaintsPanel({
  loading,
  error,
  returns,
  complaints,
  onAddReturn,
  onAddComplaint,
}: Props) {
  const hasAny = returns.length > 0 || complaints.length > 0;

  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <p className={odHeaderActionSectionTitleClass}>Aktywne zgłoszenia</p>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Ładowanie…
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !hasAny ? (
          <p className="text-sm text-slate-500">Brak aktywnych zwrotów i reklamacji dla tego zamówienia.</p>
        ) : (
          <div className="space-y-3">
            <CaseList title="Zwroty" rows={returns} />
            <CaseList title="Reklamacje" rows={complaints} />
          </div>
        )}
      </section>

      <section className="space-y-2 border-t border-slate-100 pt-3">
        <p className={odHeaderActionSectionTitleClass}>Nowe zgłoszenie</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onAddReturn} className={odHeaderActionPrimaryCtaClass}>
            Dodaj zwrot
          </button>
          <button type="button" onClick={onAddComplaint} className={odHeaderActionPrimaryCtaClass}>
            Dodaj reklamację
          </button>
        </div>
        <p className="pt-1 text-center">
          <Link to="/wms/returns" className={odHeaderActionFooterLinkClass}>
            Przejdź do zwrotów WMS
          </Link>
        </p>
      </section>
    </div>
  );
}
