import { useMemo } from "react";
import type { OrderIssueTaskListItemApi } from "../../api/wmsOrderIssueTasksApi";
import { deriveBrakiWorkstreams } from "./brakiWorkflowCta";
import { WMS_UI } from "./wmsTerminology";

export type BrakiForceRemoveMode = "full" | "wms_only" | "oms_review";

type Props = {
  task: OrderIssueTaskListItemApi;
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: (mode: BrakiForceRemoveMode) => void;
};

function ActiveOpRow({ label, active }: { label: string; active: boolean }) {
  return (
    <li className={`flex items-center gap-2 text-sm ${active ? "text-slate-800" : "text-slate-400"}`}>
      <span
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          active ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-400"
        }`}
      >
        {active ? "✓" : "·"}
      </span>
      {label}
    </li>
  );
}

/** Modal wymuszonego usunięcia z kolejki Braki — zawsze dostępny dla operatora. */
export function BrakiForceRemoveModal({ task, open, pending, onClose, onConfirm }: Props) {
  const ws = useMemo(() => deriveBrakiWorkstreams(task), [task]);
  const canDirectArchive = task.can_close_shortage === true;

  if (!open) return null;

  const activeOps = {
    recovery: ws.has_pick_work || (task.recovery_active_lines ?? 0) > 0,
    relocation: ws.has_relocation_work,
    oms: ws.has_oms_pending,
    packing: ws.has_packing_ready,
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="braki-force-remove-title"
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 id="braki-force-remove-title" className="text-lg font-bold text-slate-900">
            Usuń z Braki WMS
          </h2>
          <p className="mt-1 font-mono text-sm text-slate-600">{task.order_number}</p>
        </div>

        <div className="space-y-4 px-5 py-4">
          {canDirectArchive ? (
            <p className="text-sm text-slate-600">
              Zamówienie można bezpiecznie usunąć z kolejki — brak blokujących operacji.
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-700">To zamówienie ma aktywne operacje:</p>
              <ul className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <ActiveOpRow label="Zadanie dogrywki" active={activeOps.recovery} />
                <ActiveOpRow label={`Zadanie ${WMS_UI.productRelocation}`} active={activeOps.relocation} />
                <ActiveOpRow label="Decyzja OMS" active={activeOps.oms} />
                <ActiveOpRow label="Przejście do pakowania" active={activeOps.packing} />
              </ul>
              <p className="text-sm text-slate-600">Wybierz akcję:</p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 px-5 py-4">
          {canDirectArchive ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onConfirm("full")}
              className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {pending ? "Usuwanie…" : "Usuń z kolejki Braki"}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => onConfirm("full")}
                className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {pending ? "Zamykanie…" : "(1) Zamknij wszystkie operacje i usuń z Braki"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => onConfirm("wms_only")}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              >
                (2) Anuluj tylko workflow magazynowy
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => onConfirm("oms_review")}
                className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-900 hover:bg-indigo-100 disabled:opacity-60"
              >
                (3) Zwróć do przeglądu OMS
              </button>
            </>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60"
          >
            (4) Anuluj
          </button>
        </div>
      </div>
    </div>
  );
}
