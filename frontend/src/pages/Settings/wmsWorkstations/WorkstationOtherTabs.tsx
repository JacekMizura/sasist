import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { sendAgentTestPage } from "../../../api/printingApi";
import {
  fetchWorkstationDevices,
  fetchWorkstationHistory,
  fetchWorkstationPrinters,
  putWorkstationPrinterMapping,
} from "../../../api/wmsWorkstationsApi";
import { brandPrimaryButtonClass } from "../../../design-system/brandUi";
import type {
  DevicesGrouped,
  HistoryEvent,
  PrintersConfig,
  WorkstationDetail,
} from "../../../types/wmsWorkstations";
import { WMS_WORKSTATIONS_TENANT_ID } from "./tenant";
import { formatRelativePl, WorkstationEmptyState, WorkstationErrorState } from "./workstationUi";

type BaseProps = {
  workstationId: number;
  detail: WorkstationDetail;
};

type DevicesTabProps = BaseProps & {
  onContinue?: () => void;
};

export function PrintersTab({ workstationId, detail }: BaseProps) {
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
      <WorkstationEmptyState
        title="Brak komputera"
        description="Połącz komputer ze stanowiskiem w zakładce Sasist Agent, aby skonfigurować drukarki."
      />
    );
  }
  if (error) {
    return <WorkstationErrorState message={error} onRetry={() => void load()} />;
  }
  if (loading || !config) {
    return <p className="text-sm text-slate-500">Ładowanie…</p>;
  }
  if (config.available_printers.length === 0) {
    return (
      <WorkstationEmptyState
        title="Brak drukarek"
        description={
          detail.connection_status === "offline"
            ? "Agent jest offline i nie zgłasza drukarek. Uruchom Sasist Agent na komputerze stanowiska."
            : "Agent nie zgłosił żadnej drukarki. Sprawdź urządzenia w zakładce Urządzenia oraz instalację sterowników na komputerze."
        }
        action={
          <button type="button" className="text-sm text-orange-700" onClick={() => void load()}>
            Odśwież
          </button>
        }
      />
    );
  }

  const hasAnyMapping = config.mappings.some((m) => {
    const v = draft[m.print_type];
    return v !== "" && v != null;
  });

  return (
    <div className="space-y-4">
      {detail.connection_status === "offline" ? (
        <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Agent jest offline — status drukarek może być nieaktualny.
        </p>
      ) : null}
      <p className="text-sm text-slate-600">
        Przypisz drukarkę wykrytą przez Agenta do każdego typu wydruku. To nie jest lista sprzętu —
        sprzęt widać w zakładce Urządzenia.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Typ wydruku</th>
              <th className="px-4 py-3">Drukarka</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {config.mappings.map((m) => {
              const selected = draft[m.print_type];
              const printer =
                selected === ""
                  ? null
                  : config.available_printers.find((p) => p.id === Number(selected));
              return (
                <tr key={m.print_type}>
                  <td className="px-4 py-3 font-medium text-slate-800">{m.print_type_label}</td>
                  <td className="px-4 py-3">
                    <select
                      className="w-full max-w-xs rounded-lg border border-slate-200 px-2 py-1.5"
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
                  </td>
                  <td className="px-4 py-3">
                    {printer ? (
                      <span className={printer.is_online ? "text-emerald-700" : "text-slate-400"}>
                        ● {printer.is_online ? "Online" : "Offline"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={brandPrimaryButtonClass} disabled={busy} onClick={() => void save()}>
          {busy ? "Zapisywanie…" : "Zapisz mapowanie"}
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          disabled={testBusy || detail.connection_status === "offline"}
          onClick={() => void runTestPrint()}
        >
          {testBusy ? "Wysyłanie…" : "Wydruk testowy"}
        </button>
      </div>
      {!hasAnyMapping ? (
        <p className="text-xs text-slate-500">
          Wybierz drukarki i zapisz mapowanie przed produkcyjnym drukowaniem.
        </p>
      ) : null}
    </div>
  );
}

function DeviceSection({
  title,
  items,
  emptyHint,
}: {
  title: string;
  items: { id: number; name: string; status: string; last_seen_at: string | null; detail?: string | null }[];
  emptyHint: string;
}) {
  return (
    <section>
      <h4 className="mb-2 border-b border-slate-100 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">{emptyHint}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium text-slate-900">{d.name}</div>
                {d.detail ? <div className="text-xs text-slate-500">{d.detail}</div> : null}
              </div>
              <div className="text-right text-xs text-slate-500">
                <div className={d.status === "online" ? "text-emerald-600" : "text-slate-400"}>
                  ● {d.status === "online" ? "Online" : "Offline"}
                </div>
                <div>sync {formatRelativePl(d.last_seen_at)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DevicesTab({ workstationId, detail, onContinue }: DevicesTabProps) {
  const [devices, setDevices] = useState<DevicesGrouped | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!detail.agent) {
      setDevices(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setDevices(await fetchWorkstationDevices(WMS_WORKSTATIONS_TENANT_ID, workstationId));
    } catch (e) {
      setError(extractApiErrorMessage(e));
      setDevices(null);
    } finally {
      setLoading(false);
    }
  }, [workstationId, detail.agent]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!detail.agent) {
    return (
      <WorkstationEmptyState
        title="Brak urządzeń"
        description="Sprzęt pojawi się tutaj po podłączeniu komputera (Sasist Agent) do stanowiska."
      />
    );
  }
  if (error) {
    return <WorkstationErrorState message={error} onRetry={() => void load()} />;
  }
  if (loading || !devices) {
    return <p className="text-sm text-slate-500">Ładowanie…</p>;
  }

  const total =
    devices.printers.length +
    devices.scanners.length +
    devices.scales.length +
    devices.cameras.length +
    devices.rfid.length +
    devices.barcode_readers.length +
    devices.other.length;

  if (total === 0) {
    return (
      <WorkstationEmptyState
        title="Brak zgłoszonych urządzeń"
        description="Agent nie zgłosił jeszcze drukarek ani innych urządzeń. Sprawdź połączenie i odśwież."
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="text-sm text-orange-700" onClick={() => void load()}>
              Odśwież
            </button>
            {onContinue ? (
              <button type="button" className={brandPrimaryButtonClass} onClick={onContinue}>
                Dalej: drukarki
              </button>
            ) : null}
          </div>
        }
      />
    );
  }

  const empty = "Brak urządzeń w tej kategorii.";

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Sprzęt zgłoszony przez komputer przypisany do tego stanowiska.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="text-sm text-orange-700" onClick={() => void load()}>
            Odśwież
          </button>
          {onContinue ? (
            <button type="button" className={brandPrimaryButtonClass} onClick={onContinue}>
              Dalej: skonfiguruj drukarki
            </button>
          ) : null}
        </div>
      </div>
      <DeviceSection title="Drukarki" items={devices.printers} emptyHint={empty} />
      <DeviceSection title="Skanery" items={devices.scanners} emptyHint={empty} />
      <DeviceSection title="Wagi" items={devices.scales} emptyHint={empty} />
      <DeviceSection title="Kamery" items={devices.cameras} emptyHint={empty} />
      <DeviceSection title="RFID" items={devices.rfid} emptyHint={empty} />
      <DeviceSection title="Czytniki kodów" items={devices.barcode_readers} emptyHint={empty} />
      <DeviceSection title="Inne" items={devices.other} emptyHint={empty} />
    </div>
  );
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
    return <WorkstationErrorState message={error} onRetry={() => void load(0, false)} />;
  }
  if (loading && items.length === 0) {
    return <p className="text-sm text-slate-500">Ładowanie…</p>;
  }
  if (items.length === 0) {
    return (
      <WorkstationEmptyState
        title="Brak zdarzeń"
        description="Historia zmian stanowiska pojawi się po utworzeniu, parowaniu lub zmianie konfiguracji."
      />
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <ol className="relative space-y-0 border-l border-slate-200 pl-6">
        {items.map((ev) => (
          <li key={ev.id} className="relative pb-6">
            <span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-orange-500 ring-4 ring-white" />
            <div className="text-xs text-slate-400">
              {new Date(ev.created_at).toLocaleString("pl-PL", {
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "2-digit",
              })}
            </div>
            <div className="font-medium text-slate-900">{ev.title}</div>
            {ev.detail ? <div className="text-sm text-slate-600">{ev.detail}</div> : null}
          </li>
        ))}
      </ol>
      {hasMore ? (
        <button
          type="button"
          className="text-sm text-orange-700"
          disabled={loading}
          onClick={() => void load(offset + pageSize, true)}
        >
          {loading ? "Ładowanie…" : "Pokaż starsze"}
        </button>
      ) : null}
    </div>
  );
}
