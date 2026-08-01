import { Link } from "react-router-dom";
import { FileWarning, Loader2, RotateCcw, Undo2 } from "lucide-react";

import type { OrderHeaderCaseRow } from "../useOrderHeaderCases";
import { OrderHeaderMenuItem } from "../OrderHeaderMenuItem";
import { odHeaderActionMenuDividerClass } from "../orderHeaderActionTokens";

type Props = {
  loading: boolean;
  error: string | null;
  returns: OrderHeaderCaseRow[];
  complaints: OrderHeaderCaseRow[];
  onNewReturn: () => void;
  onNewComplaint: () => void;
  onClose: () => void;
};

/**
 * Returns/complaints header menu — create in Order Panel; open existing cards.
 */
export function OrderReturnsComplaintsPanel({
  loading,
  error,
  returns,
  complaints,
  onNewReturn,
  onNewComplaint,
  onClose,
}: Props) {
  const hasCases = returns.length > 0 || complaints.length > 0;

  return (
    <div>
      <OrderHeaderMenuItem
        icon={<Undo2 className="h-full w-full" strokeWidth={2} />}
        label="Nowy zwrot"
        onClick={() => {
          onClose();
          onNewReturn();
        }}
      />
      <div className={odHeaderActionMenuDividerClass} role="separator" />
      <OrderHeaderMenuItem
        icon={<FileWarning className="h-full w-full" strokeWidth={2} />}
        label="Nowa reklamacja"
        onClick={() => {
          onClose();
          onNewComplaint();
        }}
      />

      {loading ? (
        <>
          <div className={odHeaderActionMenuDividerClass} role="separator" />
          <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Ładowanie zgłoszeń…
          </div>
        </>
      ) : error ? (
        <>
          <div className={odHeaderActionMenuDividerClass} role="separator" />
          <p className="px-3 py-2.5 text-sm text-red-600">{error}</p>
        </>
      ) : hasCases ? (
        <>
          <div className={odHeaderActionMenuDividerClass} role="separator" />
          <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Aktywne zgłoszenia
          </p>
          {complaints.map((row) => (
            <OrderHeaderMenuItem
              key={`c-${row.id}`}
              to={row.openPath}
              onClick={onClose}
              icon={<FileWarning className="h-full w-full" strokeWidth={2} />}
              label={row.number}
              trailing={<span className="text-[11px] text-slate-400">{row.status}</span>}
            />
          ))}
          {returns.map((row) => (
            <OrderHeaderMenuItem
              key={`r-${row.id}`}
              to={row.openPath}
              onClick={onClose}
              icon={<RotateCcw className="h-full w-full" strokeWidth={2} />}
              label={row.number}
              trailing={<span className="text-[11px] text-slate-400">{row.status}</span>}
            />
          ))}
        </>
      ) : (
        <>
          <div className={odHeaderActionMenuDividerClass} role="separator" />
          <p className="px-3 py-2.5 text-sm text-slate-500">Brak aktywnych zwrotów i reklamacji.</p>
        </>
      )}

      <div className={odHeaderActionMenuDividerClass} role="separator" />
      <Link
        to="/wms/returns"
        onClick={onClose}
        className="block px-3 py-2.5 text-left text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
      >
        Realizacja magazynowa (WMS) — opcjonalnie
      </Link>
    </div>
  );
}
