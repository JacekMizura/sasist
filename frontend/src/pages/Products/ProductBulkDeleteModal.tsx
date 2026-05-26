import { useState } from "react";
import { postProductsBulkDelete, type ProductsBulkDeleteResult } from "../../api/productsBulkApi";
import type { ProductBulkModalSelection } from "./ProductBulkActionModal";

type Props = {
  open: boolean;
  tenantId: number;
  selection: ProductBulkModalSelection;
  onClose: () => void;
  onSuccess: () => void;
};

export function ProductBulkDeleteModal({ open, tenantId, selection, onClose, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const n = selection.mode === "explicit_ids" ? selection.productIds.length : selection.count;

  const submit = async () => {
    if (n === 0) return;
    setErr(null);
    setSubmitting(true);
    try {
      const selectionDto =
        selection.mode === "explicit_ids"
          ? { mode: "explicit_ids" as const, ids: selection.productIds }
          : { mode: "filtered_query" as const, filters: selection.filters };

      const summary: ProductsBulkDeleteResult = await postProductsBulkDelete({
        tenant_id: tenantId,
        selection: selectionDto,
      });

      const parts = [
        summary.errors?.length ? `Błędy: ${summary.errors.join("; ")}` : null,
        `Usunięto trwale: ${summary.success_count ?? 0}`,
        `Zarchiwizowano (soft delete): ${summary.soft_deleted_count ?? 0}`,
        summary.blocked_count ? `Zablokowane: ${summary.blocked_count}` : null,
        summary.skipped_not_found ? `Nie znaleziono: ${summary.skipped_not_found}` : null,
      ].filter(Boolean);

      onSuccess();
      onClose();
      if (parts.length) window.alert(parts.join("\n"));
    } catch (e: unknown) {
      const d =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : null;
      setErr(d != null ? String(d) : "Usuwanie nie powiodło się.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[270] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-black text-slate-900">Usuń produkty</h2>
        <p className="mt-2 text-sm text-slate-700">
          Operacja dotyczy{" "}
          <span className="font-bold tabular-nums text-red-800">{n}</span>{" "}
          {n === 1 ? "produktu" : "produktów"}.
        </p>
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Produkty powiązane z historią (zamówienia, dokumenty magazynowe) zostaną ukryte (archiwizacja), pozostałe
          usunięte trwale.
        </p>
        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Anuluj
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {submitting ? "Usuwanie…" : `Usuń ${n} produktów`}
          </button>
        </div>
      </div>
    </div>
  );
}
