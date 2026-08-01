import { Check, Minus, Plus, ImagePlus } from "lucide-react";
import { useEffect, useState } from "react";

import { CustomerReturnProductImage } from "./CustomerReturnProductImage";
import {
  CUSTOMER_RETURN_FIELD_CLASS,
  CUSTOMER_RETURN_LABEL_CLASS,
  CUSTOMER_RETURN_TEXTAREA_CLASS,
  ORDER_CASE_CONDITIONS,
  ORDER_CASE_RETURN_REASONS,
} from "./customerReturnFormConstants";
import { customerReturnMoney } from "./customerReturnFormUtils";
import type {
  CustomerReturnCatalogRow,
  CustomerReturnLineDraft,
} from "./customerReturnFormTypes";

type Props = {
  row: CustomerReturnCatalogRow;
  draft: CustomerReturnLineDraft | undefined;
  onAdd: () => void;
  onRemove: () => void;
  onPatch: (patch: Partial<CustomerReturnLineDraft>) => void;
};

export function CustomerReturnProductCard({ row, draft, onAdd, onRemove, onPatch }: Props) {
  const added = Boolean(draft);
  const lineTotal = row.unitPrice * row.purchasedQty;
  const [photoPreviews, setPhotoPreviews] = useState<{ name: string; url: string }[]>([]);

  useEffect(() => {
    const files = draft?.photoFiles ?? [];
    const next = files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
    setPhotoPreviews(next);
    return () => {
      for (const p of next) URL.revokeObjectURL(p.url);
    };
  }, [draft?.photoFiles]);

  return (
    <article
      className={`rounded-xl border px-5 py-5 transition-all duration-300 ease-out ${
        added
          ? "border-emerald-200/90 bg-emerald-50/45 shadow-[0_0_0_1px_rgba(16,185,129,0.06)]"
          : "border-slate-200/80 bg-white hover:border-slate-300/90"
      }`}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <CustomerReturnProductImage url={row.imageUrl} name={row.name} sizeClass="h-24 w-24" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold leading-snug text-slate-900">{row.name}</h3>
              <p className="mt-1.5 space-x-3 text-[12px] text-slate-500">
                <span>SKU {row.sku || "—"}</span>
                <span className="text-slate-300">·</span>
                <span>EAN {row.ean || "—"}</span>
              </p>
              {added ? (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                  <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  W zwrocie
                </span>
              ) : null}
            </div>

            {added ? (
              <button
                type="button"
                onClick={onRemove}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-4 text-[13px] font-semibold text-emerald-800 transition-colors hover:bg-emerald-50"
              >
                <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                Dodano
              </button>
            ) : (
              <button
                type="button"
                onClick={onAdd}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                Dodaj do zwrotu
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Zakupiono</p>
              <p className="mt-0.5 font-medium tabular-nums text-slate-800">{row.purchasedQty} szt.</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cena</p>
              <p className="mt-0.5 font-medium tabular-nums text-slate-800">
                {customerReturnMoney(row.unitPrice)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Wartość</p>
              <p className="mt-0.5 font-medium tabular-nums text-slate-800">
                {customerReturnMoney(lineTotal)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          added ? "mt-5 grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          {draft ? (
            <div className="space-y-4 border-t border-emerald-100/80 pt-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={CUSTOMER_RETURN_LABEL_CLASS}>Ilość do zwrotu</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50"
                      onClick={() => onPatch({ returnQty: Math.max(1, draft.returnQty - 1) })}
                      aria-label="Zmniejsz ilość"
                    >
                      <Minus className="h-4 w-4" strokeWidth={2} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={row.purchasedQty}
                      value={draft.returnQty}
                      onChange={(e) => {
                        const n = Math.floor(Number(e.target.value) || 1);
                        onPatch({ returnQty: Math.min(row.purchasedQty, Math.max(1, n)) });
                      }}
                      className={`${CUSTOMER_RETURN_FIELD_CLASS} text-center tabular-nums`}
                    />
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50"
                      onClick={() =>
                        onPatch({ returnQty: Math.min(row.purchasedQty, draft.returnQty + 1) })
                      }
                      aria-label="Zwiększ ilość"
                    >
                      <Plus className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>
                </label>

                <label className="block">
                  <span className={CUSTOMER_RETURN_LABEL_CLASS}>Powód</span>
                  <select
                    value={draft.reasonId}
                    onChange={(e) => onPatch({ reasonId: e.target.value })}
                    className={CUSTOMER_RETURN_FIELD_CLASS}
                  >
                    {ORDER_CASE_RETURN_REASONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className={CUSTOMER_RETURN_LABEL_CLASS}>Stan produktu</span>
                  <select
                    value={draft.condition}
                    onChange={(e) =>
                      onPatch({
                        condition: e.target.value as CustomerReturnLineDraft["condition"],
                      })
                    }
                    className={CUSTOMER_RETURN_FIELD_CLASS}
                  >
                    {ORDER_CASE_CONDITIONS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block sm:col-span-2">
                  <span className={CUSTOMER_RETURN_LABEL_CLASS}>Komentarz</span>
                  <textarea
                    value={draft.comment}
                    onChange={(e) => onPatch({ comment: e.target.value })}
                    rows={3}
                    placeholder="Opisz krótko problem (opcjonalnie)…"
                    className={CUSTOMER_RETURN_TEXTAREA_CLASS}
                  />
                </label>
              </div>

              <div>
                <span className={CUSTOMER_RETURN_LABEL_CLASS}>Dodaj zdjęcia</span>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-200/90 bg-white/60 px-4 py-3 transition-colors hover:border-slate-300 hover:bg-white">
                  <ImagePlus className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={1.5} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-slate-700">
                      Wybierz pliki
                    </span>
                    <span className="text-[11px] text-slate-500">JPG, PNG — opcjonalnie</span>
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (!files.length) return;
                      onPatch({ photoFiles: [...draft.photoFiles, ...files].slice(0, 8) });
                      e.target.value = "";
                    }}
                  />
                </label>
                {photoPreviews.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-3">
                    {photoPreviews.map((p) => (
                      <li key={p.url} className="h-16 w-16">
                        <img src={p.url} alt={p.name} className="h-full w-full object-contain" />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
