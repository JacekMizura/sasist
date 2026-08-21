/**
 * Sellasist-style status action panel — projection of one STATUS_ACTION rule + ordered effects.
 * Backend SSOT via listStatusActions / upsertStatusActions.
 *
 * Edited status = trigger. Checkboxes = side-effects after entering that status.
 * Does NOT expose change_status (advanced; managed in Automation Editor only).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";

import {
  listStatusActions,
  upsertStatusActions,
  type AutomationEffectDto,
  type AutomationEntityType,
  type StatusActionRuleDto,
} from "../../api/automationsApi";
import { MessageTemplatePicker } from "../messaging/MessageTemplatePicker";
import { InternalUserPicker } from "../messaging/InternalUserPicker";

export type StatusOption = { id: number; name: string; disabled?: boolean };

type Props = {
  tenantId: number;
  warehouseId?: number | null;
  entityType: AutomationEntityType;
  statusId: number | null;
  statusName?: string;
  /** When false, panel is read-only (inactive status). */
  statusActive?: boolean;
  /** Used for status name fallback when statusName omitted. */
  statusOptions: StatusOption[];
  canWrite?: boolean;
};

/** Panel-owned (managed) action keys — must match backend MANAGED_STATUS_ACTION_KEYS. */
type ActionKey = "send_email_customer" | "send_email_internal" | "warehouse_commit";

type ActionDraft = {
  key: ActionKey;
  enabled: boolean;
  templateId: number | "";
  userId: number | "";
};

const LABELS: Record<ActionKey, string> = {
  send_email_customer: "Wyślij e-mail klientowi",
  send_email_internal: "Wyślij e-mail wewnętrzny",
  warehouse_commit: "Zatwierdź przyjęcie zwrotu w magazynie",
};

function availableKeys(entityType: AutomationEntityType): ActionKey[] {
  if (entityType === "RETURN") {
    return ["warehouse_commit", "send_email_customer", "send_email_internal"];
  }
  return ["send_email_customer", "send_email_internal"];
}

function emptyDraft(key: ActionKey): ActionDraft {
  return { key, enabled: false, templateId: "", userId: "" };
}

function effectManagedKey(e: AutomationEffectDto): ActionKey | null {
  const t = String(e.effect_type || "");
  if (t === "warehouse_commit") return "warehouse_commit";
  if (t === "send_email" || t === "send_message") {
    const r = String(e.config?.recipient_type || "CUSTOMER").toUpperCase();
    return r === "INTERNAL" ? "send_email_internal" : "send_email_customer";
  }
  return null;
}

function hasEnabledAdvancedChangeStatus(rules: StatusActionRuleDto[]): boolean {
  const ordered = [...rules].sort((a, b) => a.id - b.id);
  for (const rule of ordered) {
    for (const eff of rule.effects ?? []) {
      if (String(eff.effect_type || "") !== "change_status") continue;
      if (Boolean(eff.enabled)) return true;
    }
  }
  return false;
}

function hydrateFromRules(rules: StatusActionRuleDto[], keys: ActionKey[]): ActionDraft[] {
  const byKey = new Map<ActionKey, { draft: ActionDraft; position: number }>();
  const ordered = [...rules].sort((a, b) => a.id - b.id);
  for (const rule of ordered) {
    const effects = [...(rule.effects ?? [])].sort((a, b) => a.position - b.position);
    for (const eff of effects) {
      const key = effectManagedKey(eff);
      if (!key || !keys.includes(key) || byKey.has(key)) continue;
      const draft = emptyDraft(key);
      draft.enabled = Boolean(eff.enabled) && Boolean(rule.enabled);
      if (key === "send_email_customer" || key === "send_email_internal") {
        const n = Number(eff.config?.template_id);
        draft.templateId = Number.isFinite(n) && n > 0 ? n : "";
      }
      if (key === "send_email_internal") {
        const u = Number(eff.config?.user_id);
        draft.userId = Number.isFinite(u) && u > 0 ? u : "";
      }
      byKey.set(key, { draft, position: Number(eff.position) || 0 });
    }
  }
  const enabledOrdered = [...byKey.values()]
    .filter((x) => x.draft.enabled)
    .sort((a, b) => a.position - b.position)
    .map((x) => x.draft);
  const disabledRest = keys
    .filter((k) => !enabledOrdered.some((d) => d.key === k))
    .map((k) => byKey.get(k)?.draft ?? emptyDraft(k));
  return [...enabledOrdered, ...disabledRest];
}

/** Managed effects only — never seeds change_status. */
function draftsToEffects(drafts: ActionDraft[]): Omit<AutomationEffectDto, "id">[] {
  const enabled = drafts.filter((d) => d.enabled);
  const disabled = drafts.filter((d) => !d.enabled);
  const out: Omit<AutomationEffectDto, "id">[] = [];
  for (const d of [...enabled, ...disabled]) {
    if (d.key === "send_email_customer") {
      const tid = Number(d.templateId);
      out.push({
        position: out.length,
        effect_type: "send_email",
        enabled: d.enabled,
        config: {
          recipient_type: "CUSTOMER",
          ...(Number.isFinite(tid) && tid > 0 ? { template_id: tid } : {}),
        },
      });
    } else if (d.key === "send_email_internal") {
      const tid = Number(d.templateId);
      const uid = Number(d.userId);
      out.push({
        position: out.length,
        effect_type: "send_email",
        enabled: d.enabled,
        config: {
          recipient_type: "INTERNAL",
          ...(Number.isFinite(tid) && tid > 0 ? { template_id: tid } : {}),
          ...(Number.isFinite(uid) && uid > 0 ? { user_id: uid } : {}),
        },
      });
    } else if (d.key === "warehouse_commit") {
      out.push({
        position: out.length,
        effect_type: "warehouse_commit",
        enabled: d.enabled,
        config: {},
      });
    }
  }
  return out;
}

function validateDraft(d: ActionDraft): string | null {
  if (!d.enabled) return null;
  if (d.key === "send_email_customer" || d.key === "send_email_internal") {
    const tid = Number(d.templateId);
    if (!Number.isFinite(tid) || tid <= 0) return "Wybierz szablon e-mail";
  }
  if (d.key === "send_email_internal") {
    const uid = Number(d.userId);
    if (!Number.isFinite(uid) || uid <= 0) return "Wybierz użytkownika";
  }
  return null;
}

export function StatusActionsPanel({
  tenantId,
  warehouseId = null,
  entityType,
  statusId,
  statusName,
  statusActive = true,
  statusOptions,
  canWrite = true,
}: Props) {
  const keys = useMemo(() => availableKeys(entityType), [entityType]);
  const [drafts, setDrafts] = useState<ActionDraft[]>(() => keys.map(emptyDraft));
  const [advancedChangeStatusHint, setAdvancedChangeStatusHint] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const readOnly = !canWrite || !statusActive || statusId == null;

  const load = useCallback(async () => {
    if (statusId == null) {
      setDrafts(keys.map(emptyDraft));
      setAdvancedChangeStatusHint(false);
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
      setDrafts(hydrateFromRules(rows, keys));
      setAdvancedChangeStatusHint(hasEnabledAdvancedChangeStatus(rows));
    } catch {
      toast.error("Nie udało się wczytać akcji statusu");
      setDrafts(keys.map(emptyDraft));
      setAdvancedChangeStatusHint(false);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId, entityType, statusId, keys]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = async (next: ActionDraft[]) => {
    if (statusId == null || readOnly) return;
    for (const d of next) {
      const err = validateDraft(d);
      if (err) {
        toast.error(err);
        await load();
        return;
      }
    }
    setBusy(true);
    try {
      await upsertStatusActions({
        tenant_id: tenantId,
        entity_type: entityType,
        status_id: statusId,
        warehouse_id: warehouseId,
        status_name: statusName ?? statusOptions.find((s) => s.id === statusId)?.name,
        effects: draftsToEffects(next),
      });
      setDrafts(next);
      const rows = await listStatusActions({
        tenantId,
        entityType,
        statusId,
        warehouseId,
      });
      setDrafts(hydrateFromRules(rows, keys));
      setAdvancedChangeStatusHint(hasEnabledAdvancedChangeStatus(rows));
    } catch {
      toast.error("Nie udało się zapisać akcji");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const moveEnabled = (key: ActionKey, dir: -1 | 1) => {
    const enabled = drafts.filter((d) => d.enabled);
    const idx = enabled.findIndex((d) => d.key === key);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= enabled.length) return;
    const swapped = [...enabled];
    [swapped[idx], swapped[j]] = [swapped[j], swapped[idx]];
    const disabled = drafts.filter((d) => !d.enabled);
    void persist([...swapped, ...disabled]);
  };

  if (statusId == null) {
    return (
      <section className="rounded border border-slate-200 bg-slate-50 px-3 py-2.5">
        <h3 className="text-sm font-semibold text-slate-800">Automatyczne akcje po wejściu w status</h3>
        <p className="mt-0.5 text-xs text-slate-500">Zapisz status, aby skonfigurować akcje.</p>
      </section>
    );
  }

  const enabledKeys = drafts.filter((d) => d.enabled).map((d) => d.key);

  return (
    <section className="rounded border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Automatyczne akcje po wejściu w status</h3>
        {loading ? <span className="text-[11px] text-slate-400">Ładowanie…</span> : null}
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
        Zaznaczone akcje zostaną wykonane automatycznie, gdy obiekt otrzyma ten status.
      </p>
      {!statusActive ? (
        <p className="mt-1 text-[11px] text-amber-800">Status nieaktywny — akcje tylko do podglądu.</p>
      ) : null}
      {advancedChangeStatusHint ? (
        <p className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900">
          Ten status zawiera zaawansowaną akcję zmiany statusu utworzoną wcześniej. Możesz zarządzać nią w Akcjach
          automatycznych.
        </p>
      ) : null}

      <ul className="mt-2 divide-y divide-slate-100">
        {drafts.map((d) => {
          const enIdx = enabledKeys.indexOf(d.key);
          return (
            <li key={d.key} className="py-2">
              <div className="flex items-start gap-2">
                {d.enabled && !readOnly ? (
                  <div className="mt-0.5 flex flex-col gap-0">
                    <button
                      type="button"
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      disabled={busy || enIdx <= 0}
                      aria-label="Przenieś wyżej"
                      onClick={() => moveEnabled(d.key, -1)}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      disabled={busy || enIdx < 0 || enIdx >= enabledKeys.length - 1}
                      aria-label="Przenieś niżej"
                      onClick={() => moveEnabled(d.key, 1)}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="w-5 shrink-0" />
                )}
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-emerald-600"
                    checked={d.enabled}
                    disabled={readOnly || busy}
                    onChange={(e) => {
                      const on = e.target.checked;
                      if (on) {
                        const err = validateDraft({ ...d, enabled: true });
                        if (err && d.key.startsWith("send_email")) {
                          setDrafts(drafts.map((x) => (x.key === d.key ? { ...x, enabled: true } : x)));
                          return;
                        }
                      }
                      void persist(
                        drafts.map((x) => (x.key === d.key ? { ...x, enabled: on } : x)),
                      );
                    }}
                  />
                  <span className="text-sm font-medium text-slate-800">{LABELS[d.key]}</span>
                </label>
              </div>

              {d.enabled ? (
                <div className="ml-9 mt-1.5 space-y-1.5 border-l-2 border-slate-100 pl-3">
                  {d.key === "send_email_customer" ? (
                    <label className="block text-[11px] text-slate-500">
                      Szablon
                      <div className="mt-0.5">
                        <MessageTemplatePicker
                          tenantId={tenantId}
                          warehouseId={warehouseId}
                          entityType={entityType}
                          value={d.templateId}
                          disabled={readOnly || busy}
                          inputClassName="block w-full max-w-xs rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                          onChange={(id) => {
                            void persist(
                              drafts.map((x) =>
                                x.key === d.key ? { ...x, templateId: id, enabled: true } : x,
                              ),
                            );
                          }}
                        />
                      </div>
                    </label>
                  ) : null}

                  {d.key === "send_email_internal" ? (
                    <>
                      <label className="block text-[11px] text-slate-500">
                        Odbiorca
                        <div className="mt-0.5">
                          <InternalUserPicker
                            value={d.userId}
                            disabled={readOnly || busy}
                            inputClassName="block w-full max-w-xs rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                            onChange={(id) => {
                              const next = drafts.map((x) =>
                                x.key === d.key ? { ...x, userId: id, enabled: true } : x,
                              );
                              setDrafts(next);
                              const cur = next.find((x) => x.key === d.key)!;
                              if (cur.templateId !== "" && id !== "") void persist(next);
                            }}
                          />
                        </div>
                      </label>
                      <label className="block text-[11px] text-slate-500">
                        Szablon
                        <div className="mt-0.5">
                          <MessageTemplatePicker
                            tenantId={tenantId}
                            warehouseId={warehouseId}
                            entityType={entityType}
                            value={d.templateId}
                            disabled={readOnly || busy}
                            inputClassName="block w-full max-w-xs rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                            onChange={(id) => {
                              void persist(
                                drafts.map((x) =>
                                  x.key === d.key
                                    ? { ...x, templateId: id, userId: d.userId, enabled: true }
                                    : x,
                                ),
                              );
                            }}
                          />
                        </div>
                      </label>
                    </>
                  ) : null}

                  {d.key === "warehouse_commit" ? (
                    <p className="text-[11px] leading-snug text-slate-500">
                      Akcja wykona przyjęcie zwrotu przez istniejący workflow RMZ. Jeśli zwrot nie jest gotowy do
                      przyjęcia, automatyzacja zakończy się błędem. Utworzy Z-PZ — nie jest to „przywrócenie stanu”.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
