import { FileText, FileWarning, Loader2, RotateCcw, Undo2 } from "lucide-react";

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
  onOpenCustomerReturnForm: () => void;
  onClose: () => void;
};

function CaseRow({ row, onClose }: { row: OrderHeaderCaseRow; onClose: () => void }) {
  const kindLabel = row.kind === "return" ? "Zwrot" : "Reklamacja";
  return (
    <OrderHeaderMenuItem
      to={row.openPath}
      onClick={onClose}
      icon={
        row.kind === "return" ? (
          <RotateCcw className="h-full w-full" strokeWidth={2} />
        ) : (
          <FileWarning className="h-full w-full" strokeWidth={2} />
        )
      }
      label={
        <span className="min-w-0">
          <span className="block truncate font-medium text-slate-900">{row.number}</span>
          <span className="mt-0.5 block truncate text-[11px] font-normal text-slate-500">
            {kindLabel} · {row.status}
          </span>
        </span>
      }
    />
  );
}

/**
 * Lightweight returns/complaints menu.
 * Operator create stays in Order Panel; customer form is a separate screen.
 */
export function OrderReturnsComplaintsPanel({
  loading,
  error,
  returns,
  complaints,
  onNewReturn,
  onNewComplaint,
  onOpenCustomerReturnForm,
  onClose,
}: Props) {
  const cases = [
    ...returns.map((r) => ({ ...r, kind: "return" as const })),
    ...complaints.map((c) => ({ ...c, kind: "complaint" as const })),
  ];

  const createBlock = (
    <>
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
      <div className={odHeaderActionMenuDividerClass} role="separator" />
      <OrderHeaderMenuItem
        icon={<FileText className="h-full w-full" strokeWidth={2} />}
        label="Formularz zwrotu"
        onClick={() => {
          onClose();
          onOpenCustomerReturnForm();
        }}
      />
    </>
  );

  return (
    <div>
      {loading ? (
        <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Ładowanie…
        </div>
      ) : error ? (
        <p className="px-3 py-2.5 text-sm text-red-600">{error}</p>
      ) : cases.length > 0 ? (
        <>
          <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Aktywne zgłoszenia
          </p>
          {cases.map((row) => (
            <CaseRow key={`${row.kind}-${row.id}`} row={row} onClose={onClose} />
          ))}
          <div className={odHeaderActionMenuDividerClass} role="separator" />
          {createBlock}
        </>
      ) : (
        createBlock
      )}
    </div>
  );
}
