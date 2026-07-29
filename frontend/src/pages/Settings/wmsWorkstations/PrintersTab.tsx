import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { sendAgentTestPage } from "../../../api/printingApi";
import {
  fetchWorkstationPrinters,
  putWorkstationPrinterMapping,
} from "../../../api/wmsWorkstationsApi";
import type { PrintersConfig, WorkstationDetail } from "../../../types/wmsWorkstations";
import { WMS_WORKSTATIONS_TENANT_ID } from "./tenant";
import {
  WorkstationCard,
  WorkstationEmptyState,
  WorkstationErrorState,
  WorkstationTabShell,
  WsStatusBadge,
  wsTokens,
} from "./workstationUi";

type Props = {
  workstationId: number;
  detail: WorkstationDetail;
};

export function PrintersTab({ workstationId, detail }: Props) {
  const [config, setConfig] = useState<PrintersConfig | null>(null);
  const [draft, setDraft] = useState<Record<string, number | "">>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWorkstationPrinters(WMS_WORKSTATIONS_TENANT_ID, workstationId);
      setConfig(data);
      const next: Record<string, number | ""> = {};
      for (const m of data.mappings) {
        next[m.print_type] = m.agent_printer_id ?? "";
      }
      setDraft(next);
    } catch (e) {
      setError(extractApiErrorMessage(e));
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [workstationId]);

  useEffect(() => {
    if (!detail.agent) return;
    void load();
  }, [detail.agent, load]);

  const save = async () => {
    if (!config) return;
    setBusy(true);
    try {
      const mappings = config.mappings.map((m) => ({
        print_type: m.print_type,
        agent_printer_id: draft[m.print_type] === "" ? null : Number(draft[m.print_type]),
      }));
      const updated = await putWorkstationPrinterMapping(
        WMS_WORKSTATIONS_TENANT_ID,
        workstationId,
        mappings,
      );
      setConfig(updated);
      const next: Record<string, number | ""> = {};
      for (const m of updated.mappings) {
        next[m.print_type] = m.agent_printer_id ?? "";
      }
      setDraft(next);
      toast.success("Zapisano mapowanie drukarek.");
    } catch (e) {
      toast.error(extractApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const runTestPrint = async () => {
    if (!detail.agent?.id) return;
    setTestBusy(true);
    try {
      await sendAgentTestPage(WMS_WORKSTATIONS_TENANT_ID, detail.agent.id);
      toast.success("Wysłano wydruk testowy do Agenta.");
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się wysłać wydruku testowego."));
    } finally {
      setTestBusy(false);
    }
  };

  if (!detail.agent) {
    return (
      <WorkstationTabShell>
        <WorkstationEmptyState
          title="Brak komputera"
          description="Połącz komputer ze stanowiskiem w zakładce Sasist Agent, aby skonfigurować drukarki."
        />
      </WorkstationTabShell>
    );
  }
  if (error) {
    return (
      <WorkstationTabShell>
        <WorkstationErrorState message={error} onRetry={() => void load()} />
      </WorkstationTabShell>
    );
  }
  if (loading || !config) {
    return (
      <WorkstationTabShell>
        <p className="text-sm text-slate-500">Ładowanie…</p>
      </WorkstationTabShell>
    );
  }
  if (config.available_printers.length === 0) {
    return (
      <WorkstationTabShell
        actions={
          <button type="button" className={wsTokens.mutedBtn} onClick={() => void load()}>
            Odśwież
          </button>
        }
      >
        <WorkstationEmptyState
          title="Brak drukarek"
          description={
            detail.connection_status === "offline"
              ? "Agent jest offline i nie zgłasza drukarek. Uruchom Sasist Agent na komputerze stanowiska."
              : "Agent nie zgłosił żadnej drukarki. Sprawdź urządzenia w zakładce Urządzenia oraz instalację sterowników na komputerze."
          }
        />
      </WorkstationTabShell>
    );
  }

  return (
    <WorkstationTabShell
      intro="Przypisz drukarkę wykrytą przez Agenta do każdego typu wydruku. Lista sprzętu jest w zakładce Urządzenia."
      actions={
        <>
          <button type="button" className={wsTokens.primaryBtn} disabled={busy} onClick={() => void save()}>
            {busy ? "Zapisywanie…" : "Zapisz mapowanie"}
          </button>
          <button
            type="button"
            className={wsTokens.mutedBtn}
            disabled={testBusy || detail.connection_status === "offline"}
            onClick={() => void runTestPrint()}
          >
            {testBusy ? "Wysyłanie…" : "Wydruk testowy"}
          </button>
        </>
      }
    >
      {detail.connection_status === "offline" ? (
        <WorkstationCard>
          <p className="text-sm text-amber-900">Agent jest offline — status drukarek może być nieaktualny.</p>
        </WorkstationCard>
      ) : null}

      <div className="space-y-3">
        {config.mappings.map((m) => {
          const selected = draft[m.print_type];
          const configured = selected !== "" && selected != null;
          return (
            <WorkstationCard key={m.print_type} title={m.print_type_label}>
              <label className={wsTokens.fieldLabel}>
                Drukarka
                <select
                  className={wsTokens.select}
                  value={selected}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      [m.print_type]: e.target.value ? Number(e.target.value) : "",
                    }))
                  }
                >
                  <option value="">wybierz drukarkę</option>
                  {config.available_printers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-3">
                {configured ? (
                  <WsStatusBadge tone="success">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Skonfigurowano
                  </WsStatusBadge>
                ) : (
                  <WsStatusBadge tone="neutral">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    Nie skonfigurowano
                  </WsStatusBadge>
                )}
              </div>
            </WorkstationCard>
          );
        })}
      </div>
    </WorkstationTabShell>
  );
}
