/** Backend status-action rules section for the automation list (SSOT = /api/automations). */
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import {
  disableAutomation,
  enableAutomation,
  listAutomations,
  type AutomationRuleDto,
} from "../../../api/automationsApi";

const ENTITY_LABEL: Record<string, string> = {
  ORDER: "Zamówienie",
  RETURN: "Zwrot",
  COMPLAINT: "Reklamacja",
};

type Props = {
  tenantId: number;
  warehouseId: number | null;
};

export function BackendStatusActionsListSection({ tenantId, warehouseId }: Props) {
  const [rules, setRules] = useState<AutomationRuleDto[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listAutomations({ tenantId, warehouseId });
      setRules(all.filter((r) => r.source === "STATUS_ACTION"));
    } catch {
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (rule: AutomationRuleDto) => {
    try {
      if (rule.enabled) await disableAutomation(rule.id, tenantId);
      else await enableAutomation(rule.id, tenantId);
      await load();
    } catch {
      toast.error("Nie udało się zmienić stanu reguły");
    }
  };

  if (loading && rules.length === 0) {
    return <p className="mt-6 text-xs text-slate-500">Ładowanie akcji statusu…</p>;
  }
  if (rules.length === 0) return null;

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-900">Akcje statusu (backend)</h3>
        <p className="mt-0.5 text-xs text-slate-500">Te same reguły co w konfiguratorze statusu — jedno SSOT.</p>
      </div>
      <ul className="divide-y divide-slate-100">
        {rules.map((rule) => {
          const triggerStatus = rule.trigger_config?.status_id ?? rule.trigger_config?.status_ids;
          const fx = (rule.effects ?? []).find((e) => e.effect_type === "change_status");
          const target = fx?.config?.status_id;
          return (
            <li key={rule.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-900">
                Akcja statusu
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                {ENTITY_LABEL[String(rule.entity_type).toUpperCase()] ?? rule.entity_type}
              </span>
              <span className="font-medium text-slate-800">{rule.name}</span>
              <span className="text-xs text-slate-500">
                trigger #{Array.isArray(triggerStatus) ? triggerStatus.join(",") : String(triggerStatus ?? "—")}
                {target != null ? ` → #${String(target)}` : ""}
              </span>
              <span className="text-[10px] text-slate-400">id={rule.id}</span>
              <label className="ml-auto flex items-center gap-1 text-xs text-slate-600">
                <input type="checkbox" checked={rule.enabled} onChange={() => void toggle(rule)} />
                Włączona
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
