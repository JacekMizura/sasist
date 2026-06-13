import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Warehouse } from "lucide-react";
import toast from "react-hot-toast";

import {
  FULFILLMENT_PHASE_BADGE_CLASS,
  FULFILLMENT_PHASE_LABELS,
  assignOrderFulfillmentWarehouse,
  type FulfillmentAssignmentPhase,
} from "../../api/orderFulfillmentApi";
import { warehouseService, type TenantWarehouseAssignment } from "../../services/warehouseService";

type Props = {
  orderId: number;
  tenantId: number;
  warehouseId: number | null;
  warehouseName: string | null;
  phase: FulfillmentAssignmentPhase | string | null | undefined;
  locked: boolean;
  strategy?: string | null;
  assignedAt?: string | null;
  assignedByLabel?: string | null;
  assignmentReason?: string | null;
  onAssigned: () => void | Promise<void>;
};

function fmtAssignedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function OrderFulfillmentWarehousePanel({
  orderId,
  tenantId,
  warehouseId,
  warehouseName,
  phase,
  locked,
  strategy,
  assignedAt,
  assignedByLabel,
  assignmentReason,
  onAssigned,
}: Props) {
  const normalizedPhase = (phase ?? "FULFILLMENT_ASSIGNED").toUpperCase() as FulfillmentAssignmentPhase;
  const phaseLabel = FULFILLMENT_PHASE_LABELS[normalizedPhase] ?? normalizedPhase;
  const phaseClass =
    FULFILLMENT_PHASE_BADGE_CLASS[normalizedPhase] ?? "border-slate-200 bg-slate-50 text-slate-700";

  const [assignments, setAssignments] = useState<TenantWarehouseAssignment[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: number; name: string }[]>([]);
  const [loadingWh, setLoadingWh] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedWh, setSelectedWh] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const eligibleWarehouses = useMemo(
    () => assignments.filter((a) => a.tenant_id === tenantId && a.fulfillment_eligible !== false),
    [assignments, tenantId],
  );

  const loadAssignments = useCallback(async () => {
    setLoadingWh(true);
    try {
      const [aRes, wRes] = await Promise.all([
        warehouseService.getAssignments({ tenant_id: tenantId }),
        warehouseService.getAllWarehouses(),
      ]);
      setAssignments(Array.isArray(aRes.data) ? aRes.data : []);
      const whRows = Array.isArray(wRes.data) ? wRes.data : [];
      setWarehouses(whRows.map((w) => ({ id: w.id, name: w.name })));
    } catch {
      setAssignments([]);
      setWarehouses([]);
    } finally {
      setLoadingWh(false);
    }
  }, [tenantId]);

  const warehouseNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const w of warehouses) m.set(w.id, w.name);
    return m;
  }, [warehouses]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const whLabel =
    warehouseName?.trim() ||
    (warehouseId != null ? warehouseNameById.get(warehouseId) ?? `Magazyn #${warehouseId}` : "—");

  const openAssign = () => {
    setSelectedWh(warehouseId ?? eligibleWarehouses[0]?.warehouse_id ?? "");
    setReason("");
    setModalOpen(true);
  };

  const submitAssign = async () => {
    if (saving) return;
    const wid = selectedWh === "" ? null : Number(selectedWh);
    const r = reason.trim();
    if (wid == null || !Number.isFinite(wid) || wid <= 0) {
      toast.error("Wybierz magazyn realizacji.");
      return;
    }
    if (!r) {
      toast.error("Podaj uzasadnienie przypisania.");
      return;
    }
    setSaving(true);
    try {
      await assignOrderFulfillmentWarehouse(orderId, { warehouse_id: wid, reason: r });
      toast.success("Przypisano magazyn realizacji.");
      setModalOpen(false);
      await onAssigned();
    } catch {
      toast.error("Nie udało się przypisać magazynu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="w-full rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Warehouse className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            Magazyn realizacji
          </div>
          <span className="text-sm font-medium text-slate-900">{whLabel}</span>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${phaseClass}`}>{phaseLabel}</span>
          {normalizedPhase === "UNASSIGNED" && !locked ? (
            <button
              type="button"
              onClick={openAssign}
              className="ml-auto rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700"
            >
              Przypisz magazyn
            </button>
          ) : null}
          {loadingWh ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden /> : null}
        </div>

        <dl className="mt-4 grid gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Strategia</dt>
            <dd className="mt-0.5 font-mono text-xs text-slate-900">{strategy?.trim() || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Przypisano</dt>
            <dd className="mt-0.5 tabular-nums text-slate-900">{fmtAssignedAt(assignedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Przypisał</dt>
            <dd className="mt-0.5 text-slate-900">{assignedByLabel?.trim() || "—"}</dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Powód</dt>
            <dd className="mt-0.5 text-slate-700">{assignmentReason?.trim() || "—"}</dd>
          </div>
        </dl>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Przypisz magazyn realizacji</h3>
            <p className="mt-1 text-sm text-slate-500">Wybierz magazyn i podaj uzasadnienie decyzji.</p>
            <label className="mt-4 block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Magazyn</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={selectedWh}
                onChange={(e) => setSelectedWh(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">— wybierz —</option>
                {eligibleWarehouses.map((a) => (
                  <option key={a.id} value={a.warehouse_id}>
                    {warehouseNameById.get(a.warehouse_id) ?? `Magazyn #${a.warehouse_id}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Uzasadnienie</span>
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="np. dostępność towaru, decyzja klienta…"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitAssign()}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Zapisz
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
