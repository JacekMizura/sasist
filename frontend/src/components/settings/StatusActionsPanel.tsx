/**
 * Shared status-action editor — projection of backend AutomationRule (source=STATUS_ACTION).
 * Runtime-supported effects: change_status, send_email.
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
import { listMessageTemplates, type MessageTemplateDto } from "../../api/messageTemplatesApi";

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

type AddKind = "change_status" | "send_email" | null;

function changeStatusTargetId(rule: StatusActionRuleDto): number | null {
  const fx = (rule.effects ?? []).find((e) => e.effect_type === "change_status" && e.enabled !== false);
  if (!fx) return null;
  const raw = fx.config?.status_id ?? fx.config?.order_ui_status_id ?? fx.config?.return_ui_status_id;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sendEmailTemplateId(rule: StatusActionRuleDto): number | null {
  const fx = (rule.effects ?? []).find(
    (e) => (e.effect_type === "send_email" || e.effect_type === "send_message") && e.enabled !== false,
  );
  if (!fx) return null;
  const n = Number(fx.config?.template_id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function primaryEffectType(rule: StatusActionRuleDto): string {
  const fx = (rule.effects ?? []).find((e) => e.enabled !== false);
  return String(fx?.effect_type || "");
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
  const [addKind, setAddKind] = useState<AddKind>(null);
  const [targetId, setTargetId] = useState<number | "">("");
  const [templateId, setTemplateId] = useState<number | "">("");
  const [templates, setTemplates] = useState<MessageTemplateDto[]>([]);
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

  const loadTemplates = useCallback(async () => {
    try {
      const rows = await listMessageTemplates({
        tenantId,
        entityType,
        warehouseId,
        activeOnly: true,
      });
      setTemplates(rows);
    } catch {
      setTemplates([]);
    }
  }, [tenantId, warehouseId, entityType]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  if (statusId == null) {
    return (
      <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
        <h3 className="text-sm font-semibold text-slate-800">Automatyczne akcje po wejściu w status</h3>
        <p className="mt-1 text-xs text-slate-500">Zapisz status, aby dodać akcje automatyczne.</p>
      </section>
    );
  }

  const resetAdd = () => {
    setAdding(false);
    setAddKind(null);
    setTargetId("");
    setTemplateId("");
  };

  const onAdd = async () => {
    if (!canWrite || busy || !addKind) return;
    setBusy(true);
    try {
      if (addKind === "change_status") {
        const tid = Number(targetId);
        if (!Number.isFinite(tid) || tid <= 0) return;
        if (tid === statusId) {
          toast.error("Status docelowy musi być inny niż bieżący");
          return;
        }
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
      } else {
        const tid = Number(templateId);
        if (!Number.isFinite(tid) || tid <= 0) {
          toast.error("Wybierz szablon e-mail");
          return;
        }
        const tmpl = templates.find((t) => t.id === tid);
        await createAutomation({
          tenant_id: tenantId,
          warehouse_id: warehouseId ?? null,
          entity_type: entityType,
          name: `E-mail: ${tmpl?.name ?? tid}`,
          enabled: true,
          trigger_type: "entity_status_entered",
          trigger_config: { status_id: statusId },
          source: "STATUS_ACTION",
          effects: [
            {
              position: 0,
              effect_type: "send_email",
              config: { recipient_type: "CUSTOMER", template_id: tid },
              enabled: true,
            },
          ],
        });
      }
      resetAdd();
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

  const onChangeTemplate = async (rule: StatusActionRuleDto, nextTemplate: number) => {
    if (!canWrite || busy || nextTemplate <= 0) return;
    setBusy(true);
    try {
      await updateAutomation(rule.id, tenantId, {
        effects: [
          {
            position: 0,
            effect_type: "send_email",
            config: { recipient_type: "CUSTOMER", template_id: nextTemplate },
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
          <p className="mt-0.5 text-xs text-slate-500">
            Reguły backendowe (źródło: akcja statusu). Efekty: zmiana statusu, e-mail do klienta.
          </p>
        </div>
        {canWrite ? (
          <button
            type="button"
            disabled={busy}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => {
              setAdding((v) => !v);
              setAddKind(null);
            }}
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
          const kind = primaryEffectType(rule);
          const isEmail = kind === "send_email" || kind === "send_message";
          const cur = changeStatusTargetId(rule);
          const tmplId = sendEmailTemplateId(rule);
          return (
            <li
              key={rule.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2"
            >
              <span className="text-xs font-medium text-slate-700">
                {isEmail ? "Wyślij e-mail" : "Zmień status →"}
              </span>
              {isEmail ? (
                <select
                  className="min-w-[10rem] rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                  disabled={!canWrite || busy}
                  value={tmplId ?? ""}
                  onChange={(e) => void onChangeTemplate(rule, Number(e.target.value))}
                >
                  <option value="">— szablon —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  className="min-w-[10rem] rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                  disabled={!canWrite || busy}
                  value={cur ?? ""}
                  onChange={(e) => void onChangeTarget(rule, Number(e.target.value))}
                >
                  <option value="">—</option>
                  {targets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  disabled={!canWrite || busy}
                  onChange={() => void onToggle(rule)}
                />
                Aktywna
              </label>
              {canWrite ? (
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline"
                  disabled={busy}
                  onClick={() => void onRemove(rule)}
                >
                  Usuń
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="mt-3 space-y-2 rounded-lg border border-dashed border-slate-200 bg-white p-3">
          {!addKind ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                onClick={() => setAddKind("change_status")}
              >
                Zmień status
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                onClick={() => setAddKind("send_email")}
              >
                Wyślij e-mail
              </button>
              <button type="button" className="text-xs text-slate-500 hover:underline" onClick={resetAdd}>
                Anuluj
              </button>
            </div>
          ) : addKind === "change_status" ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-600">
                Status docelowy
                <select
                  className="mt-1 block min-w-[12rem] rounded border border-slate-200 px-2 py-1.5 text-sm"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value === "" ? "" : Number(e.target.value))}
                >
                  <option value="">— wybierz —</option>
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
                Zapisz
              </button>
              <button type="button" className="text-xs text-slate-500 hover:underline" onClick={resetAdd}>
                Anuluj
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="text-xs text-slate-600">
                <span className="block font-medium text-slate-800">Odbiorca</span>
                <span className="mt-1 inline-block rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                  Klient
                </span>
              </div>
              <label className="text-xs text-slate-600">
                Szablon
                <select
                  className="mt-1 block min-w-[12rem] rounded border border-slate-200 px-2 py-1.5 text-sm"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value === "" ? "" : Number(e.target.value))}
                >
                  <option value="">— wybierz —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy || templateId === "" || templates.length === 0}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                onClick={() => void onAdd()}
              >
                Zapisz
              </button>
              <button type="button" className="text-xs text-slate-500 hover:underline" onClick={resetAdd}>
                Anuluj
              </button>
              {templates.length === 0 ? (
                <p className="w-full text-xs text-amber-700">Brak aktywnych szablonów e-mail dla tenanta.</p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
