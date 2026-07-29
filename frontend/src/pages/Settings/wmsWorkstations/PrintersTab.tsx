import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { sendAgentTestPage } from "../../../api/printingApi";
import {
  fetchWorkstationPrinters,
  putWorkstationPrinterMapping,
} from "../../../api/wmsWorkstationsApi";
import { mappingProfileKey } from "../../../printing/profiles";
import type { PrintersConfig, WorkstationDetail } from "../../../types/wmsWorkstations";
import { WmsSettingsSection } from "../WmsSettingsSection";
import { WMS_WORKSTATIONS_TENANT_ID } from "./tenant";
import {
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
        next[mappingProfileKey(m)] = m.agent_printer_id ?? "";
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
      const mappings = config.mappings.map((m) => {
        const key = mappingProfileKey(m);
        return {
          print_profile: key,
          agent_printer_id: draft[key] === "" ? null : Number(draft[key]),
        };
      });
      const updated = await putWorkstationPrinterMapping(
        WMS_WORKSTATIONS_TENANT_ID,
        workstationId,
        mappings,
      );
      setConfig(updated);
      const next: Record<string, number | ""> = {};
      for (const m of updated.mappings) {
        next[mappingProfileKey(m)] = m.agent_printer_id ?? "";
      }
      setDraft(next);
      toast.success("Zapisano konfigurację drukarek.");
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
      await sendAgentTestPage(WMS_WORKSTATIONS_TENANT_ID, detail.agent.id, {
        workstationId,
      });
      toast.success("Wysłano wydruk testowy. Sprawdź zakładkę Historia.");
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
      intro="Przypisz drukarkę do profilu wydruku. Nowy typ dokumentu wystarczy dodać do profilu w systemie — tu nic nie zmieniasz."
      actions={
        <>
          <button type="button" className={wsTokens.primaryBtn} disabled={busy} onClick={() => void save()}>
            {busy ? "Zapisywanie…" : "Zapisz"}
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
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
          Agent jest offline — status drukarek może być nieaktualny.
        </div>
      ) : null}

      <WmsSettingsSection id="ws-printer-mapping" title="Profile wydruku">
        {config.mappings.map((m) => {
          const key = mappingProfileKey(m);
          const label = m.print_profile_label || m.print_type_label || key;
          const icon = m.print_profile_icon ? `${m.print_profile_icon} ` : "";
          const selected = draft[key];
          const configured = selected !== "" && selected != null;
          return (
            <div key={key} className={wsTokens.settingsRow}>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">
                  {icon}
                  {label}
                </div>
                <div className="mt-1">
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
              </div>
              <div className="w-full sm:max-w-sm">
                <label className="sr-only" htmlFor={`printer-${key}`}>
                  Drukarka dla {label}
                </label>
                <select
                  id={`printer-${key}`}
                  className={wsTokens.select}
                  value={selected}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      [key]: e.target.value ? Number(e.target.value) : "",
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
              </div>
            </div>
          );
        })}
      </WmsSettingsSection>
    </WorkstationTabShell>
  );
}
