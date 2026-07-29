import { useCallback, useEffect, useState } from "react";
import { Cable, Clock, History, Link2Off, Printer, Settings2 } from "lucide-react";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { fetchWorkstationHistory } from "../../../api/wmsWorkstationsApi";
import type { HistoryEvent } from "../../../types/wmsWorkstations";
import { wmsSettingsTokens } from "../wmsSettingsTokens";
import { WmsSettingsSection } from "../WmsSettingsSection";
import { WMS_WORKSTATIONS_TENANT_ID } from "./tenant";
import {
  WorkstationEmptyState,
  WorkstationErrorState,
  WorkstationTabShell,
  wsTokens,
} from "./workstationUi";

function historyIcon(eventType: string) {
  const t = eventType.toLowerCase();
  if (t.includes("pair") || t.includes("connect")) return Cable;
  if (t.includes("disconnect") || t.includes("unpair")) return Link2Off;
  if (t.includes("print")) return Printer;
  if (t.includes("update") || t.includes("config") || t.includes("map")) return Settings2;
  return History;
}

export function HistoryTab({ workstationId }: { workstationId: number }) {
  const [items, setItems] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const pageSize = 50;

  const load = useCallback(
    async (nextOffset: number, append: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const page = await fetchWorkstationHistory(WMS_WORKSTATIONS_TENANT_ID, workstationId, {
          limit: pageSize,
          offset: nextOffset,
        });
        setItems((prev) => (append ? [...prev, ...page] : page));
        setOffset(nextOffset);
        setHasMore(page.length === pageSize);
      } catch (e) {
        setError(extractApiErrorMessage(e));
        if (!append) setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [workstationId],
  );

  useEffect(() => {
    void load(0, false);
  }, [load]);

  if (error && items.length === 0) {
    return (
      <WorkstationTabShell>
        <WorkstationErrorState message={error} onRetry={() => void load(0, false)} />
      </WorkstationTabShell>
    );
  }
  if (loading && items.length === 0) {
    return (
      <WorkstationTabShell>
        <p className="text-sm text-slate-500">Ładowanie…</p>
      </WorkstationTabShell>
    );
  }
  if (items.length === 0) {
    return (
      <WorkstationTabShell>
        <WorkstationEmptyState
          title="Brak zdarzeń"
          description="Historia zmian stanowiska pojawi się po utworzeniu, parowaniu lub zmianie konfiguracji."
        />
      </WorkstationTabShell>
    );
  }

  return (
    <WorkstationTabShell
      intro="Historia zmian stanowiska."
      actions={
        hasMore ? (
          <button
            type="button"
            className={wsTokens.mutedBtn}
            disabled={loading}
            onClick={() => void load(offset + pageSize, true)}
          >
            {loading ? "Ładowanie…" : "Pokaż starsze"}
          </button>
        ) : null
      }
    >
      <WmsSettingsSection id="ws-history" title="Timeline">
        <ol className="relative space-y-4 border-l-2 border-slate-200 pl-6">
          {items.map((ev) => {
            const Icon = historyIcon(ev.event_type);
            return (
              <li key={ev.id} className="relative">
                <span className="absolute -left-[1.9rem] top-3 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm">
                  <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </span>
                <article className={wmsSettingsTokens.cardInner}>
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {new Date(ev.created_at).toLocaleString("pl-PL", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </div>
                  <h4 className="mt-2 text-sm font-semibold text-slate-900">{ev.title}</h4>
                  {ev.detail ? <p className="mt-1 text-sm text-slate-600">{ev.detail}</p> : null}
                </article>
              </li>
            );
          })}
        </ol>
      </WmsSettingsSection>
    </WorkstationTabShell>
  );
}
