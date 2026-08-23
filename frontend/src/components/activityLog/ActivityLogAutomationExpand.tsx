import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, X } from "lucide-react";

import {
  getAutomationExecutionDetail,
  type AutomationExecutionExpandDto,
} from "../../api/automationsApi";

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ") || "—";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

type Props = {
  executionId: number;
  tenantId: number;
};

/**
 * Lazy-loaded expand panel for automation Activity Log rows.
 */
export function ActivityLogAutomationExpand({ executionId, tenantId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AutomationExecutionExpandDto | null>(null);

  useEffect(() => {
    if (!open || detail != null || loading) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAutomationExecutionDetail(executionId, tenantId)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch(() => {
        if (!cancelled) setError("Nie udało się wczytać szczegółów automatyzacji.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, executionId, tenantId, detail, loading]);

  return (
    <div className="mt-1.5">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-sky-700 hover:text-sky-900"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
        {open ? "Zwiń pełne szczegóły" : "Pełne warunki i efekty"}
      </button>
      {open ? (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-[12px] leading-snug text-slate-700">
          {loading ? <p className="text-slate-400">Ładowanie…</p> : null}
          {error ? <p className="text-rose-600">{error}</p> : null}
          {detail ? (
            <div className="space-y-3">
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Automatyzacja</p>
                <p className="mt-0.5 font-semibold text-slate-900">{detail.rule.name}</p>
              </section>
              {detail.trigger?.summary || detail.trigger?.old_status_name ? (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Wyzwalacz</p>
                  <p className="mt-0.5 text-slate-800">
                    {detail.trigger.summary ||
                      `Zmiana statusu: ${detail.trigger.old_status_name || "—"} → ${detail.trigger.new_status_name || "—"}`}
                  </p>
                </section>
              ) : null}
              {detail.conditions.length > 0 ? (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Warunki</p>
                  <ul className="mt-1 space-y-1">
                    {detail.conditions.map((c, idx) => {
                      const ok = Boolean(c.matched);
                      const Icon = ok ? Check : X;
                      const label = c.label || c.condition_type || "Warunek";
                      const op = c.operator_label || c.operator || "";
                      const configured = formatValue(c.configured_value);
                      return (
                        <li key={`${c.condition_type}-${idx}`} className="flex items-start gap-1.5">
                          <Icon
                            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${ok ? "text-emerald-600" : "text-rose-600"}`}
                            strokeWidth={2.5}
                            aria-hidden
                          />
                          <span>
                            <span className="font-medium text-slate-800">{label}</span>
                            {op ? <span className="text-slate-500"> — {op} — </span> : <span> </span>}
                            <span className="text-slate-700">{configured}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
              {detail.effects.length > 0 ? (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Efekty</p>
                  <ul className="mt-1 space-y-1">
                    {detail.effects.map((ef) => {
                      const ok = String(ef.status).toUpperCase() === "SUCCEEDED";
                      const Icon = ok ? Check : X;
                      return (
                        <li key={`${ef.position}-${ef.effect_type}`} className="flex items-start gap-1.5">
                          <Icon
                            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${ok ? "text-emerald-600" : "text-rose-600"}`}
                            strokeWidth={2.5}
                            aria-hidden
                          />
                          <span>
                            <span className="font-medium text-slate-800">{ef.summary}</span>
                            {ef.error ? (
                              <span className="mt-0.5 block text-rose-700">{ef.error}</span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
              {detail.error ? (
                <p className="text-rose-700">
                  <span className="font-semibold">Błąd: </span>
                  {detail.error}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
