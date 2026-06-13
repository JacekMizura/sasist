import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

import {
  fetchWmsConsolidationPlanDetail,
  postCancelConsolidationPlan,
  postChangeConsolidationTargetWarehouse,
  postConsolidationRecoveryAction,
  postStageConsolidationItem,
  postStartConsolidationStaging,
  consolidationStagingErrorMessage,
  type ConsolidationPlanDetail,
} from "../../../api/wmsConsolidationApi";
import { consolidationItemStatusLabel } from "../../../api/orderConsolidationApi";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { WMS_ROUTES } from "../wmsRoutes";
import {
  consolidationPlanStatusClass,
  consolidationPlanStatusLabel,
} from "./consolidationStatusUi";
import { ConsolidationOperatorPage, WMS_CONSOLIDATION_LABELS } from "./consolidationOperatorUi";

export default function ConsolidationDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const pid = Number(planId);
  const [plan, setPlan] = useState<ConsolidationPlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [changeWhId, setChangeWhId] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(pid) || pid <= 0) {
      setPlan(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchWmsConsolidationPlanDetail(pid, DAMAGE_TENANT_ID);
      setPlan(data);
    } catch {
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => {
    void load();
  }, [load]);

  const runRecovery = async (
    itemId: number,
    action: "ADDITIONAL_MM" | "OPERATOR_DECISION" | "LOST_ESCALATION",
  ) => {
    if (!plan) return;
    setActionBusy(true);
    try {
      await postConsolidationRecoveryAction(plan.id, itemId, DAMAGE_TENANT_ID, action);
      await load();
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!plan || !cancelReason.trim()) return;
    setActionBusy(true);
    try {
      await postCancelConsolidationPlan(plan.id, DAMAGE_TENANT_ID, cancelReason.trim());
      await load();
    } finally {
      setActionBusy(false);
    }
  };

  const handleChangeWarehouse = async () => {
    if (!plan || !changeReason.trim()) return;
    const wid = Number(changeWhId);
    if (!Number.isFinite(wid) || wid <= 0) return;
    setActionBusy(true);
    try {
      await postChangeConsolidationTargetWarehouse(plan.id, DAMAGE_TENANT_ID, wid, changeReason.trim());
      await load();
    } finally {
      setActionBusy(false);
    }
  };

  const handleStartStaging = async () => {
    if (!plan) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await postStartConsolidationStaging(plan.id, DAMAGE_TENANT_ID);
      await load();
    } catch (e: unknown) {
      setActionError(consolidationStagingErrorMessage(e, "Nie udało się rozpocząć rozkładania."));
    } finally {
      setActionBusy(false);
    }
  };

  const handleStageItem = async (itemId: number) => {
    if (!plan) return;
    setActionBusy(true);
    try {
      await postStageConsolidationItem(plan.id, itemId, DAMAGE_TENANT_ID);
      await load();
    } finally {
      setActionBusy(false);
    }
  };

  const orderLabel = plan?.order_number ?? (plan ? `#${plan.order_id}` : "—");
  const canMutate = plan && !["COMPLETED", "CANCELLED"].includes(plan.status.toUpperCase());
  const canStartStaging = plan?.status.toUpperCase() === "READY_FOR_STAGING";
  const isStaging = plan?.status.toUpperCase() === "STAGING";

  return (
    <ConsolidationOperatorPage>
      <Link
        to={WMS_ROUTES.consolidations}
        className="mb-4 inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {WMS_CONSOLIDATION_LABELS.backToTodo}
      </Link>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Wczytywanie szczegółów…
        </div>
      ) : plan ? (
        <>
          <header className="border border-slate-200 bg-white p-5">
            <h1 className="text-xl font-bold text-slate-900">Zamówienie {orderLabel}</h1>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Magazyn docelowy</dt>
                <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                  {plan.target_warehouse_name ?? `#${plan.target_warehouse_id}`}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt>
                <dd className="mt-0.5">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${consolidationPlanStatusClass(plan.status)}`}
                  >
                    {consolidationPlanStatusLabel(plan.status)}
                  </span>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Postęp transferów</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{plan.progress_label}</dd>
              </div>
              {(plan.mm_staging_total ?? 0) > 0 ? (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">MM — odłożone</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                    {plan.mm_staging_label ?? `${plan.mm_staged_count ?? 0} / ${plan.mm_staging_total}`}
                  </dd>
                </div>
              ) : null}
              {(plan.local_staging_total ?? 0) > 0 ? (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Lokalne — odłożone</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                    {plan.local_staging_label ?? `${plan.local_staged_count ?? 0} / ${plan.local_staging_total}`}
                  </dd>
                </div>
              ) : null}
              {plan.shelf_label ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Półka kompletacyjna</dt>
                  <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900">{plan.shelf_label}</dd>
                </div>
              ) : null}
              {isStaging || plan.status.toUpperCase() === "COMPLETED" ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Gotowość do pakowania</dt>
                  <dd className="mt-0.5">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        plan.packing_ready
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-amber-200 bg-amber-50 text-amber-950"
                      }`}
                    >
                      {plan.packing_ready_label ?? (plan.packing_ready ? "READY_TO_PACK" : "NIEGOTOWE")}
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>
            {canStartStaging ? (
              <div className="mt-4 space-y-2">
                {actionError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                    {actionError}
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handleStartStaging()}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  Rozpocznij rozkładanie
                </button>
              </div>
            ) : null}
          </header>

          {canMutate ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Operacje planu</h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-600">Zmiana magazynu docelowego (ID)</label>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={changeWhId}
                    onChange={(e) => setChangeWhId(e.target.value)}
                    placeholder="np. 3"
                  />
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    placeholder="Powód zmiany"
                  />
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleChangeWarehouse()}
                    className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Zmień magazyn docelowy
                  </button>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-600">Anulowanie konsolidacji</label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Powód anulowania (wymagany)"
                  />
                  <button
                    type="button"
                    disabled={actionBusy || !cancelReason.trim()}
                    onClick={() => void handleCancel()}
                    className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 disabled:opacity-50"
                  >
                    Anuluj konsolidację
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            {plan.items.map((it) => (
              <article key={it.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-base font-semibold text-slate-900">
                  {it.product_name ?? `Produkt #${it.product_id}`}
                </h2>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                  <span>{it.source_warehouse_name ?? `#${it.source_warehouse_id}`}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <span>{it.target_warehouse_name ?? `#${it.target_warehouse_id}`}</span>
                  <span className="text-slate-500">× {it.quantity}</span>
                </p>
                <p className="mt-2 text-xs font-medium text-slate-500">
                  Status: {consolidationItemStatusLabel(it.status)}
                </p>
                {isStaging && (it.status.toUpperCase() === "RECEIVED" || it.status.toUpperCase() === "PICKED") ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleStageItem(it.id)}
                    className="mt-3 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Odłożono na półkę
                  </button>
                ) : null}
                {canMutate && it.status.toUpperCase() === "SHORTAGE" ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void runRecovery(it.id, "ADDITIONAL_MM")}
                    className="mt-3 rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Utwórz dodatkowe MM
                  </button>
                ) : null}
                {canMutate && it.status.toUpperCase() === "DAMAGED" ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void runRecovery(it.id, "OPERATOR_DECISION")}
                    className="mt-3 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Oznacz do decyzji operatora
                  </button>
                ) : null}
                {canMutate && (it.status.toUpperCase() === "LOST" || it.status.toUpperCase() === "SHORTAGE") ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void runRecovery(it.id, "LOST_ESCALATION")}
                    className="mt-2 ml-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-50 sm:ml-2 sm:mt-3 sm:inline-block"
                  >
                    Przekaż do wyjaśnienia
                  </button>
                ) : null}
              </article>
            ))}
          </section>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          Nie znaleziono planu konsolidacji.
        </div>
      )}
    </ConsolidationOperatorPage>
  );
}
