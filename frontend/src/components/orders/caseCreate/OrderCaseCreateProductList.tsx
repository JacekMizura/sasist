import { ImageIcon, Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { OrderCaseKind, OrderCaseLineDraft } from "./orderCaseCreateTypes";
import {
  ORDER_CASE_COMPLAINT_REASONS,
  ORDER_CASE_CONDITIONS,
  ORDER_CASE_RETURN_REASONS,
} from "./orderCaseCreateConstants";

type Props = {
  kind: OrderCaseKind;
  lines: OrderCaseLineDraft[];
  catalog: Array<{
    orderItemId: number;
    productId: number;
    name: string;
    sku: string | null;
    imageUrl: string | null;
    purchasedQty: number;
    unitPrice: number;
    added: boolean;
  }>;
  onAdd: (orderItemId: number) => void;
  onRemove: (orderItemId: number) => void;
  onPatch: (orderItemId: number, patch: Partial<OrderCaseLineDraft>) => void;
};

function Thumb({ url, name }: { url: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center text-slate-300" aria-hidden>
        <ImageIcon className="h-5 w-5" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      className="h-12 w-12 shrink-0 object-contain"
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

const fieldClass =
  "h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-800 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100";

export function OrderCaseCreateProductList({
  kind,
  lines,
  catalog,
  onAdd,
  onRemove,
  onPatch,
}: Props) {
  const reasons = kind === "return" ? ORDER_CASE_RETURN_REASONS : ORDER_CASE_COMPLAINT_REASONS;
  const addLabel = kind === "return" ? "Dodaj do zwrotu" : "Dodaj do reklamacji";
  const badgeLabel = kind === "return" ? "Dodano do zwrotu" : "Dodano do reklamacji";
  const lineById = new Map(lines.map((l) => [l.orderItemId, l]));

  return (
    <div className="space-y-2">
      {catalog.map((row) => {
        const draft = lineById.get(row.orderItemId);
        const added = Boolean(draft);

        return (
          <div
            key={row.orderItemId}
            className={`rounded-xl border px-3 py-3 transition-colors ${
              added ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="flex items-start gap-3">
              <Thumb url={row.imageUrl} name={row.name} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-slate-900">{row.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {row.sku ? `SKU ${row.sku}` : "SKU —"}
                      <span className="mx-1 text-slate-300">·</span>
                      Zakupiono: {row.purchasedQty} szt.
                      <span className="mx-1 text-slate-300">·</span>
                      {row.unitPrice.toFixed(2)} zł
                    </p>
                  </div>
                  {added ? (
                    <span className="inline-flex h-[22px] items-center rounded-md border border-emerald-200 bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-800">
                      {badgeLabel}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAdd(row.orderItemId)}
                      className="inline-flex h-[34px] items-center rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50"
                    >
                      {addLabel}
                    </button>
                  )}
                </div>

                {draft ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Ilość zwracana
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                          onClick={() =>
                            onPatch(row.orderItemId, {
                              returnQty: Math.max(1, draft.returnQty - 1),
                            })
                          }
                          aria-label="Zmniejsz ilość"
                        >
                          <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={row.purchasedQty}
                          value={draft.returnQty}
                          onChange={(e) => {
                            const n = Math.floor(Number(e.target.value) || 1);
                            onPatch(row.orderItemId, {
                              returnQty: Math.min(row.purchasedQty, Math.max(1, n)),
                            });
                          }}
                          className={`${fieldClass} text-center tabular-nums`}
                        />
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                          onClick={() =>
                            onPatch(row.orderItemId, {
                              returnQty: Math.min(row.purchasedQty, draft.returnQty + 1),
                            })
                          }
                          aria-label="Zwiększ ilość"
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </div>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Powód
                      </span>
                      <select
                        value={draft.reasonId}
                        onChange={(e) => onPatch(row.orderItemId, { reasonId: e.target.value })}
                        className={fieldClass}
                      >
                        {reasons.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Stan produktu
                      </span>
                      <select
                        value={draft.condition}
                        onChange={(e) =>
                          onPatch(row.orderItemId, {
                            condition: e.target.value as OrderCaseLineDraft["condition"],
                          })
                        }
                        className={fieldClass}
                      >
                        {ORDER_CASE_CONDITIONS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block sm:col-span-2 lg:col-span-1">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Komentarz
                      </span>
                      <div className="flex gap-1">
                        <input
                          value={draft.comment}
                          onChange={(e) => onPatch(row.orderItemId, { comment: e.target.value })}
                          placeholder="Opcjonalnie…"
                          className={fieldClass}
                        />
                        <button
                          type="button"
                          title="Usuń z listy"
                          aria-label="Usuń z listy"
                          onClick={() => onRemove(row.orderItemId)}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </div>
                    </label>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
      {catalog.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          Brak produktów na zamówieniu.
        </p>
      ) : null}
    </div>
  );
}
