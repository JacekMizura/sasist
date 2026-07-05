import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Clock, XCircle } from "lucide-react";

import type { ProductionMaterialNeed } from "@/api/productionShortageApi";
import { ProductThumb } from "./ProductThumb";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  open: { label: "Otwarte", className: "bg-slate-100 text-slate-700" },
  linked: { label: "Powiązane z PO", className: "bg-blue-50 text-blue-800" },
  partial: { label: "Częściowo pokryte", className: "bg-amber-50 text-amber-900" },
  fulfilled: { label: "Zamknięte", className: "bg-emerald-50 text-emerald-800" },
  cancelled: { label: "Anulowane", className: "bg-slate-100 text-slate-500" },
};

const EVENT_LABEL: Record<string, string> = {
  created: "Utworzone",
  partially_covered: "Częściowo pokryte",
  closed: "Zamknięte",
  cancelled: "Anulowane",
  receipt_sync: "Przyjęcie magazynowe",
};

type Props = {
  rows: ProductionMaterialNeed[];
};

function NeedRow({ row }: { row: ProductionMaterialNeed }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_LABEL[row.status] ?? STATUS_LABEL.open;
  const remaining = Math.max(0, row.shortage_qty - row.covered_qty);

  return (
    <li className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
        <ProductThumb imageUrl={row.product_image_url} name={row.product_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{row.product_name}</p>
          {row.product_sku ? <p className="font-mono text-xs text-slate-500">{row.product_sku}</p> : null}
        </div>
        <div className="text-xs tabular-nums text-slate-600">
          Potrzeba: <strong>{row.shortage_qty}</strong> · Pokryto: <strong>{row.covered_qty}</strong>
          {remaining > 0 ? <span className="text-rose-700"> · Brakuje {remaining.toFixed(2)}</span> : null}
        </div>
        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${cfg.className}`}>{cfg.label}</span>
      </button>
      {open && row.history.length > 0 ? (
        <div className="border-t border-slate-100 px-4 py-3">
          <p className="mb-2 text-xs font-bold uppercase text-slate-500">Historia</p>
          <ol className="space-y-2">
            {row.history.map((ev, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                {ev.event === "closed" ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-600" aria-hidden />
                ) : ev.event === "cancelled" ? (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 text-slate-400" aria-hidden />
                ) : (
                  <Clock className="mt-0.5 h-3.5 w-3.5 text-slate-400" aria-hidden />
                )}
                <div>
                  <p className="font-semibold text-slate-800">{EVENT_LABEL[ev.event] ?? ev.event}</p>
                  <p className="text-slate-500">
                    {new Date(ev.at).toLocaleString("pl-PL")} · status: {ev.status}
                    {ev.covered_qty > 0 ? ` · pokryto ${ev.covered_qty}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </li>
  );
}

export function MaterialNeedsPanel({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500">Brak aktywnych zapotrzebowań materiałowych w tym magazynie.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <NeedRow key={row.id} row={row} />
      ))}
    </ul>
  );
}
