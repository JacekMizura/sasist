import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { getOrderNotes } from "../../../../api/ordersApi";
import type { OrderNoteDto } from "../../orderDetailPageTypes";
import {
  odHeaderActionFooterLinkClass,
  odHeaderActionSectionTitleClass,
} from "../orderHeaderActionTokens";

type Props = {
  orderId: number;
  customerPreview?: string | null;
  hasCustomerComment?: boolean;
  onGoToComms: () => void;
};

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Quick messages preview — full thread lives on Komunikacja tab. */
export function OrderMessagesPreviewPanel({
  orderId,
  customerPreview,
  hasCustomerComment,
  onGoToComms,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<OrderNoteDto[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getOrderNotes(orderId)
      .then((rows) => {
        if (!cancelled) setNotes(Array.isArray(rows) ? rows.slice(0, 8) : []);
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return (
    <div className="space-y-3">
      <div>
        <p className={odHeaderActionSectionTitleClass}>Szybki podgląd</p>
        {hasCustomerComment && (customerPreview || "").trim() ? (
          <div className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-2 text-sm text-emerald-950">
            {(customerPreview || "").trim()}
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-slate-500">Brak wyróżnionego komentarza klienta.</p>
        )}
      </div>

      <div>
        <p className={odHeaderActionSectionTitleClass}>Historia wiadomości</p>
        {loading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Ładowanie…
          </div>
        ) : notes.length === 0 ? (
          <p className="mt-1.5 text-sm text-slate-500">Brak notatek / wiadomości na zamówieniu.</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-slate-200 px-2.5 py-2">
                <p className="text-[11px] font-medium text-slate-500">{fmtWhen(n.created_at)}</p>
                <p className="mt-0.5 line-clamp-3 text-sm text-slate-800">{(n.content || "—").trim()}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-100 pt-2.5 text-center">
        <button type="button" onClick={onGoToComms} className={odHeaderActionFooterLinkClass}>
          Przejdź do zakładki Komunikacja
        </button>
      </div>
    </div>
  );
}
