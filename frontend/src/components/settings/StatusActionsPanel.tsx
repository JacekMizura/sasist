/**
 * Compact Sellasist-style status action panel.
 * Edited status = trigger; checkboxes = side-effects. No change_status here.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import toast from "react-hot-toast";

import {
  listStatusActions,
  upsertStatusActions,
  type AutomationEffectDto,
  type AutomationEntityType,
  type StatusActionRuleDto,
} from "../../api/automationsApi";
import {
  STATUS_ACTION_CHECKBOX_LABELS,
  STATUS_ACTION_COLUMN_TOOLTIPS,
  STATUS_ACTION_SIMPLE_TOGGLE_KEYS,
  managedKeysForEntity,
  type StatusActionManagedKey,
} from "../../utils/statusActionManagedCatalog";
import { MessageTemplatePicker } from "../messaging/MessageTemplatePicker";
import { InternalUserPicker } from "../messaging/InternalUserPicker";

export type StatusOption = { id: number; name: string; disabled?: boolean };

type Props = {
  tenantId: number;
  warehouseId?: number | null;
  entityType: AutomationEntityType;
  statusId: number | null;
  statusName?: string;
  statusActive?: boolean;
  statusOptions: StatusOption[];
  canWrite?: boolean;
  /** Fired after successful upsert so parent list overview can refetch. */
  onChanged?: () => void;
};

type ActionDraft = {
  key: StatusActionManagedKey;
  enabled: boolean;
  templateId: number | "";
  userId: number | "";
  includeShippingCost: boolean;
};

function emptyDraft(key: StatusActionManagedKey): ActionDraft {
  return { key, enabled: false, templateId: "", userId: "", includeShippingCost: false };
}

function effectManagedKey(e: AutomationEffectDto): StatusActionManagedKey | null {
  const t = String(e.effect_type || "");
  if (t === "warehouse_commit") return "warehouse_commit";
  if (t === "generate_sale_correction" || t === "generate_correction") return "generate_sale_correction";
  if (t === "send_email" || t === "send_message") {
    const r = String(e.config?.recipient_type || "CUSTOMER").toUpperCase();
    return r === "INTERNAL" ? "send_email_internal" : "send_email_customer";
  }
  return null;
}

function hasEnabledAdvancedChangeStatus(rules: StatusActionRuleDto[]): boolean {
  for (const rule of [...rules].sort((a, b) => a.id - b.id)) {
    for (const eff of rule.effects ?? []) {
      if (String(eff.effect_type || "") === "change_status" && Boolean(eff.enabled)) return true;
    }
  }
  return false;
}

function hydrateFromRules(rules: StatusActionRuleDto[], keys: StatusActionManagedKey[]): ActionDraft[] {
  const byKey = new Map<StatusActionManagedKey, ActionDraft>();
  for (const rule of [...rules].sort((a, b) => a.id - b.id)) {
    for (const eff of [...(rule.effects ?? [])].sort((a, b) => a.position - b.position)) {
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
      if (key === "generate_sale_correction") {
        draft.includeShippingCost = Boolean(eff.config?.include_shipping_cost);
      }
      byKey.set(key, draft);
    }
  }
  return keys.map((k) => byKey.get(k) ?? emptyDraft(k));
}

function draftsToEffects(drafts: ActionDraft[]): Omit<AutomationEffectDto, "id">[] {
  const out: Omit<AutomationEffectDto, "id">[] = [];
  for (const d of drafts) {
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
    } else if (d.key === "generate_sale_correction") {
      out.push({
        position: out.length,
        effect_type: "generate_sale_correction",
        enabled: d.enabled,
        config: {
          include_shipping_cost: Boolean(d.includeShippingCost),
        },
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
  onChanged,
}: Props) {
  const keys = useMemo(() => managedKeysForEntity(entityType), [entityType]);
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
      const rows = await listStatusActions({
        tenantId,
        entityType,
        statusId,
        warehouseId,
      });
      setDrafts(hydrateFromRules(rows, keys));
      setAdvancedChangeStatusHint(hasEnabledAdvancedChangeStatus(rows));
      onChanged?.();
    } catch {
      toast.error("Nie udało się zapisać akcji");
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (statusId == null) {
    return (
      <section className="border-t border-slate-100 pt-3">
        <h3 className="text-sm font-semibold text-slate-800">Automatyczne akcje po wejściu w status</h3>
        <p className="mt-0.5 text-xs text-slate-500">Zapisz status, aby skonfigurować akcje.</p>
      </section>
    );
  }

  return (
    <section className="border-t border-slate-100 pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Automatyczne akcje po wejściu w status</h3>
        {loading ? <span className="text-[11px] text-slate-400">Ładowanie…</span> : null}
      </div>
      <p className="mt-0.5 text-[11px] text-slate-500">
        Zaznaczone akcje zostaną wykonane automatycznie, gdy obiekt otrzyma ten status.
      </p>
      {!statusActive ? (
        <p className="mt-1 text-[11px] text-amber-800">Status nieaktywny — akcje tylko do podglądu.</p>
      ) : null}
      {advancedChangeStatusHint ? (
        <p className="mt-1.5 text-[11px] leading-snug text-amber-900">
          Ten status zawiera zaawansowaną akcję zmiany statusu utworzoną wcześniej. Możesz zarządzać nią w Akcjach
          automatycznych.
        </p>
      ) : null}

      <ul className="mt-2 space-y-1.5">
        {drafts.map((d) => (
          <li key={d.key}>
            <div className="flex items-center gap-2">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 rounded border-slate-300 accent-emerald-600"
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
                    void persist(drafts.map((x) => (x.key === d.key ? { ...x, enabled: on } : x)));
                  }}
                />
                <span className="text-sm text-slate-800">{STATUS_ACTION_CHECKBOX_LABELS[d.key]}</span>
              </label>
              {STATUS_ACTION_SIMPLE_TOGGLE_KEYS.has(d.key) ? (
                <span
                  className="inline-flex shrink-0 text-slate-400"
                  title={STATUS_ACTION_COLUMN_TOOLTIPS[d.key]}
                  aria-label={STATUS_ACTION_COLUMN_TOOLTIPS[d.key]}
                >
                  <Info className="h-3.5 w-3.5" strokeWidth={2} />
                </span>
              ) : null}
            </div>

            {d.key === "generate_sale_correction" && d.enabled ? (
              <label className="ml-6 mt-1 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 accent-emerald-600"
                  checked={d.includeShippingCost}
                  disabled={readOnly || busy}
                  onChange={(e) => {
                    void persist(
                      drafts.map((x) =>
                        x.key === d.key ? { ...x, includeShippingCost: e.target.checked, enabled: true } : x,
                      ),
                    );
                  }}
                />
                <span className="text-xs text-slate-700">Uwzględnij koszt dostawy</span>
              </label>
            ) : null}

            {d.enabled && d.key === "send_email_customer" ? (
              <div className="ml-6 mt-1">
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
                          drafts.map((x) => (x.key === d.key ? { ...x, templateId: id, enabled: true } : x)),
                        );
                      }}
                    />
                  </div>
                </label>
              </div>
            ) : null}

            {d.enabled && d.key === "send_email_internal" ? (
              <div className="ml-6 mt-1 space-y-1">
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
                            x.key === d.key ? { ...x, templateId: id, userId: d.userId, enabled: true } : x,
                          ),
                        );
                      }}
                    />
                  </div>
                </label>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
