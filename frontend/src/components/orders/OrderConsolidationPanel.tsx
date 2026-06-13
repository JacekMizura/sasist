import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2, Package, Truck } from "lucide-react";
import toast from "react-hot-toast";

import {
  consolidationItemStatusLabel,
  consolidationPlanStatusLabel,
  fetchOrderConsolidationPlan,
  generateConsolidationMmDrafts,
  generateOrderConsolidationPlan,
  type ConsolidationPlanDto,
} from "../../api/orderConsolidationApi";

type Props = {
  orderId: number;
  onChanged?: () => void | Promise<void>;
};

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

export default function OrderConsolidationPanel({ orderId, onChanged }: Props) {
  const [plan, setPlan] = useState<ConsolidationPlanDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [mmGenerating, setMmGenerating] = useState(false);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOrderConsolidationPlan(orderId);
      setPlan(data);
    } catch {
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const handleGeneratePlan = async () => {
    setGenerating(true);
    try {
      const result = await generateOrderConsolidationPlan(orderId);
      if (result.outcome === "CONSOLIDATION_NOT_REQUIRED") {
        toast.success(result.message ?? "Konsolidacja nie jest wymagana — jeden magazyn obsłuży zamówienie.");
      } else if (result.outcome === "MANUAL_REVIEW_REQUIRED") {
        toast.error(result.message ?? "Wymagana ręczna weryfikacja operatora.");
      } else {
        toast.success(result.message ?? "Utworzono plan konsolidacji.");
      }
      await loadPlan();
      await onChanged?.();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      toast.error(msg ?? "Nie udało się wygenerować planu konsolidacji.");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateMm = async () => {
    if (!plan?.id) return;
    setMmGenerating(true);
    try {
      const result = await generateConsolidationMmDrafts(plan.id);
      toast.success(`Utworzono ${result.documents_created} roboczych MM.`);
      await loadPlan();
      await onChanged?.();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      toast.error(msg ?? "Nie udało się utworzyć roboczych MM.");
    } finally {
      setMmGenerating(false);
    }
  };

  const transferItems = (plan?.items ?? []).filter(
    (it) => it.source_warehouse_id !== it.target_warehouse_id,
  );
  const showMmButton =
    plan != null &&
    plan.status !== "COMPLETED" &&
    plan.status !== "CANCELLED" &&
    transferItems.some((it) => it.status === "WAITING");

  return (
    <section className={cardClass}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
          <h3 className="text-base font-semibold text-slate-900">Konsolidacja zamówienia</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleGeneratePlan()}
            disabled={generating || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-slate-300 disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Analizuj / utwórz plan
          </button>
          {showMmButton ? (
            <button
              type="button"
              onClick={() => void handleGenerateMm()}
              disabled={mmGenerating}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-cyan-700 disabled:opacity-50"
            >
              {mmGenerating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Truck className="h-4 w-4" aria-hidden />}
              Utwórz robocze MM
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Wczytywanie…
        </div>
      ) : plan ? (
        <div className="space-y-4">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Magazyn docelowy</dt>
              <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                {plan.target_warehouse_name ?? `#${plan.target_warehouse_id}`}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt>
              <dd className="mt-0.5">
                <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-800">
                  {consolidationPlanStatusLabel(plan.status)}
                </span>
              </dd>
            </div>
          </dl>

          {transferItems.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Pozycje do przeniesienia
              </p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {transferItems.map((it) => (
                  <li key={it.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                    <span className="font-medium text-slate-800">
                      {it.source_warehouse_name ?? `#${it.source_warehouse_id}`}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <span className="font-medium text-slate-800">
                      {it.target_warehouse_name ?? `#${it.target_warehouse_id}`}
                    </span>
                    <span className="ml-auto text-xs text-slate-500">
                      prod. #{it.product_id} × {it.quantity}
                    </span>
                    <span className="w-full text-xs text-slate-500 sm:w-auto">
                      {consolidationItemStatusLabel(it.status)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Brak pozycji wymagających przeniesienia między magazynami.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          Brak planu konsolidacji. Użyj analizy, aby sprawdzić czy zamówienie wymaga ściągnięcia towaru do jednego
          magazynu.
        </p>
      )}
    </section>
  );
}
