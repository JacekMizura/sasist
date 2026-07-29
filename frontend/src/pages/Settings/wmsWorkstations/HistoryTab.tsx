import { useCallback, useEffect, useState } from "react";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { fetchWorkstationHistory } from "../../../api/wmsWorkstationsApi";
import type { HistoryEvent } from "../../../types/wmsWorkstations";
import { WMS_WORKSTATIONS_TENANT_ID } from "./tenant";
import {
  WorkstationEmptyState,
  WorkstationErrorState,
  WorkstationTabShell,
  wsTokens,
} from "./workstationUi";

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
      <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5">
        {items.map((ev) => (
          <li key={ev.id} className="relative">
            <span className="absolute -left-[1.55rem] top-4 h-2.5 w-2.5 rounded-full bg-orange-500 ring-4 ring-white" />
            <article className={wsTokens.cardTight}>
              <div className="text-xs font-medium text-slate-400">
                {new Date(ev.created_at).toLocaleString("pl-PL", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </div>
              <h4 className="mt-1 text-sm font-semibold text-slate-900">{ev.title}</h4>
              {ev.detail ? <p className="mt-1 text-sm text-slate-600">{ev.detail}</p> : null}
            </article>
          </li>
        ))}
      </ol>
    </WorkstationTabShell>
  );
}
