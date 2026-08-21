/**
 * Shared status-action editor — projection of backend AutomationRule (source=STATUS_ACTION).
 * Only runtime-supported effects (change_status). No localStorage.
 */
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import {
  createAutomation,
  deleteAutomation,
  disableAutomation,
  enableAutomation,
  listStatusActions,
  updateAutomation,
  type AutomationEntityType,
  type StatusActionRuleDto,
} from "../../api/automationsApi";

export type StatusOption = { id: number; name: string; disabled?: boolean };

type Props = {
  tenantId: number;
  warehouseId?: number | null;
  entityType: AutomationEntityType;
  /** Trigger status (must exist — edit mode only). */
  statusId: number | null;
  statusOptions: StatusOption[];
  canWrite?: boolean;
};

function changeStatusTargetId(rule: StatusActionRuleDto): number | null {
  const fx = (rule.effects ?? []).find((e) => e.effect_type === "change_status" && e.enabled !== false);
  if (!fx) return null;
  const raw = fx.config?.status_id ?? fx.config?.order_ui_status_id ?? fx.config?.return_ui_status_id;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function StatusActionsPanel({
  tenantId,
  warehouseId = null,
  entityType,
  statusId,
  statusOptions,
  canWrite = true,
}: Props) {
  const [rules, setRules] = useState<StatusActionRuleDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [targetId, setTargetId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (statusId == null) {
      setRules([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await listStatusActions({
        tenantId,
        entityType,
        statusId,
        warehouseId,
      });
      setRules(rows);
    } catch {
      toast.error("Nie udało się wczytać akcji statusu");
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId, entityType, statusId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (statusId == null) {
    return (
      <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
        <h3 className="text-sm font-semibold text-slate-800">Automatyczne akcje po wejściu w status</h3>
        <p className="mt-1 text-xs text-slate-500">Zapisz status, aby dodać akcje automatyczne.</p>
      </section>
    );
  }

  const onAdd = async () => {
    if (!canWrite || targetId === "" || busy) return;
    const tid = Number(targetId);
    if (!Number.isFinite(tid) || tid <= 0) return;
    if (tid === statusId) {
      toast.error("Status docelowy musi być inny niż bieżący");
      return;
    }
    setBusy(true);
    try {
      await createAutomation({
        tenant_id: tenantId,
        warehouse_id: warehouseId ?? null,
        entity_type: entityType,
        name: `Akcja statusu → ${statusOptions.find((s) => s.id === tid)?.name ?? tid}`,
        enabled: true,
        trigger_type: "entity_status_entered",
        trigger_config: { status_id: statusId },
        source: "STATUS_ACTION",
        effects: [
          {
            position: 0,
            effect_type: "change_status",
            config: { status_id: tid },
            enabled: true,
          },
        ],
      });
      setAdding(false);
      setTargetId("");
      await load();
      toast.success("Dodano akcję");
    } catch {
      toast.error("Nie udało się dodać akcji");
    } finally {
      setBusy(false);
    }
  };

  const onToggle = async (rule: StatusActionRuleDto) => {
    if (!canWrite || busy) return;
    setBusy(true);
    try {
      if (rule.enabled) await disableAutomation(rule.id, tenantId);
      else await enableAutomation(rule.id, tenantId);
      await load();
    } catch {
      toast.error("Nie udało się zmienić stanu reguły");
    } finally {
      setBusy(false);
    }
  };

  const onChangeTarget = async (rule: StatusActionRuleDto, nextTarget: number) => {
    if (!canWrite || busy || nextTarget === statusId) return;
    setBusy(true);
    try {
      await updateAutomation(rule.id, tenantId, {
        effects: [
          {
            position: 0,
            effect_type: "change_status",
            config: { status_id: nextTarget },
            enabled: true,
          },
        ],
      });
      await load();
    } catch {
      toast.error("Nie udało się zaktualizować akcji");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (rule: StatusActionRuleDto) => {
    if (!canWrite || busy) return;
    setBusy(true);
    try {
      await deleteAutomation(rule.id, tenantId);
      await load();
    } catch {
      toast.error("Nie udało się usunąć akcji");
    } finally {
      setBusy(false);
    }
  };

  const targets = statusOptions.filter((s) => s.id !== statusId && !s.disabled);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Automatyczne akcje po wejściu w status</h3>
          <p className="mt-0.5 text-xs text-slate-500">Reguły backendowe (źródło: akcja statusu). Tylko obsługiwane efekty.</p>
        </div>
        {canWrite ? (
          <button
            type="button"
            disabled={busy}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setAdding((v) => !v)}
          >
            + Dodaj akcję
          </button>
        ) : null}
      </div>

      {loading ? <p className="mt-3 text-xs text-slate-500">Ładowanie…</p> : null}

      {!loading && rules.length === 0 && !adding ? (
        <p className="mt-3 text-xs text-slate-500">Brak akcji dla tego statusu.</p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {rules.map((rule) => {
          const tid = changeStatusTargetId(rule);
          return (
            <li key={rule.id} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm">
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                Zmień status
              </span>
              <select
                className="min-w-[10rem] flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                disabled={!canWrite || busy}
                value={tid ?? ""}
                onChange={(e) => void onChangeTarget(rule, Number(e.target.value))}
              >
                <option value="" disabled>
                  Wybierz status…
                </option>
                {targets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                {tid != null && !targets.some((t) => t.id === tid) ? (
                  <option value={tid}>#{tid}</option>
                ) : null}
              </select>
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input type="checkbox" checked={rule.enabled} disabled={!canWrite || busy} onChange={() => void onToggle(rule)} />
                Włączona
              </label>
              {rule.last_execution_status ? (
                <span className="text-[10px] text-slate-500" title={rule.last_run_at ?? undefined}>
                  ostatnio: {rule.last_execution_status}
                </span>
              ) : null}
              {canWrite ? (
                <button type="button" className="text-xs text-red-600 hover:underline" disabled={busy} onClick={() => void onRemove(rule)}>
                  Usuń
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-slate-300 bg-white p-3">
          <label className="block text-xs font-medium text-slate-600">
            Zmień status na
            <select
              className="mt-1 block w-full min-w-[12rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Wybierz…</option>
              {targets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || targetId === ""}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            onClick={() => void onAdd()}
          >
            Zapisz akcję
          </button>
          <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setAdding(false)}>
            Anuluj
          </button>
        </div>
      ) : null}
    </section>
  );
}
