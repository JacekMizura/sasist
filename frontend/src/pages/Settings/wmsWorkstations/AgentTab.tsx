import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { fetchPrinterAgentDownloadInfo } from "../../../api/printingApi";
import {
  disconnectWorkstation,
  fetchWorkstation,
  fetchWorkstationPairingStatus,
  pairWorkstation,
} from "../../../api/wmsWorkstationsApi";
import {
  openPrinterAgentDownload,
  resolvePrinterAgentDownload,
} from "../../../config/printerAgent";
import { brandPrimaryButtonClass } from "../../../design-system/brandUi";
import type { WorkstationDetail } from "../../../types/wmsWorkstations";
import { WMS_WORKSTATIONS_TENANT_ID } from "./tenant";
import {
  ConnectionDot,
  formatRelativePl,
  formatUptime,
  WorkstationEmptyState,
} from "./workstationUi";

const PAIRING_POLL_MS = 3500;

type Props = {
  workstationId: number;
  detail: WorkstationDetail;
  onUpdated: (row: WorkstationDetail) => void;
};

export function AgentTab({ workstationId, detail, onUpdated }: Props) {
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [codeExpired, setCodeExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const pollingRef = useRef(false);
  const toastConnectedRef = useRef(false);

  const refreshFull = useCallback(async () => {
    const row = await fetchWorkstation(WMS_WORKSTATIONS_TENANT_ID, workstationId);
    onUpdated(row);
    return row;
  }, [workstationId, onUpdated]);

  useEffect(() => {
    let cancelled = false;
    void fetchPrinterAgentDownloadInfo(WMS_WORKSTATIONS_TENANT_ID)
      .then((info) => {
        if (cancelled) return;
        setDownloadUrl(resolvePrinterAgentDownload(info).downloadUrl);
      })
      .catch(() => {
        if (!cancelled) setDownloadUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (detail.agent) {
      setPairingCode(null);
      setExpiresAt(null);
      setCodeExpired(false);
      pollingRef.current = false;
    }
  }, [detail.agent]);

  // Poll slim pairing-status while waiting; pause when tab hidden.
  useEffect(() => {
    const waiting =
      Boolean(pairingCode || detail.pairing_active) && !detail.agent && !codeExpired;
    if (!waiting) {
      pollingRef.current = false;
      return;
    }

    pollingRef.current = true;
    toastConnectedRef.current = false;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || !pollingRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const status = await fetchWorkstationPairingStatus(
          WMS_WORKSTATIONS_TENANT_ID,
          workstationId,
        );
        if (status.agent) {
          pollingRef.current = false;
          setPairingCode(null);
          setExpiresAt(null);
          setCodeExpired(false);
          const full = await refreshFull();
          onUpdated(full);
          if (!toastConnectedRef.current) {
            toastConnectedRef.current = true;
            toast.success("Komputer połączony ze stanowiskiem.");
          }
          return;
        }
        if (!status.pairing_active) {
          pollingRef.current = false;
          setCodeExpired(true);
          setPairingCode(null);
          toast.error("Kod połączenia wygasł. Wygeneruj nowy kod.");
        }
      } catch {
        // Keep polling on transient errors.
      }
    };

    const intervalId = window.setInterval(() => void tick(), PAIRING_POLL_MS);
    void tick();
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      pollingRef.current = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [
    pairingCode,
    detail.pairing_active,
    detail.agent,
    codeExpired,
    workstationId,
    refreshFull,
    onUpdated,
  ]);

  useEffect(() => {
    if (!expiresAt || detail.agent) return;
    const expMs = new Date(expiresAt).getTime();
    if (Number.isNaN(expMs)) return;
    const remaining = expMs - Date.now();
    if (remaining <= 0) {
      setCodeExpired(true);
      setPairingCode(null);
      pollingRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      setCodeExpired(true);
      setPairingCode(null);
      pollingRef.current = false;
      toast.error("Kod połączenia wygasł. Wygeneruj nowy kod.");
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [expiresAt, detail.agent]);

  const handlePair = async () => {
    setBusy(true);
    try {
      const res = await pairWorkstation(WMS_WORKSTATIONS_TENANT_ID, workstationId);
      setPairingCode(res.pairing_code);
      setExpiresAt(res.expires_at);
      setCodeExpired(false);
      toast.success("Wygenerowano kod połączenia.");
      await refreshFull();
    } catch (e) {
      toast.error(extractApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!pairingCode) return;
    try {
      await navigator.clipboard.writeText(pairingCode);
      toast.success("Skopiowano kod połączenia.");
    } catch {
      toast.error("Nie udało się skopiować.");
    }
  };

  const handleDownload = () => {
    if (!downloadUrl) {
      toast.error("Brak adresu instalatora Agenta.");
      return;
    }
    openPrinterAgentDownload(downloadUrl);
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Odłączyć komputer od tego stanowiska?")) return;
    setBusy(true);
    try {
      const row = await disconnectWorkstation(WMS_WORKSTATIONS_TENANT_ID, workstationId);
      setPairingCode(null);
      setExpiresAt(null);
      setCodeExpired(false);
      onUpdated(row);
      toast.success("Odłączono komputer.");
    } catch (e) {
      toast.error(extractApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const agent = detail.agent;
  const showPairingPanel = Boolean(pairingCode) && !agent && !codeExpired;

  if (!agent) {
    return (
      <div className="max-w-lg space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Sasist Agent</h3>
          <p className="mt-1 text-sm text-slate-600">
            Ta zakładka dotyczy wyłącznie komputera przypisanego do stanowiska.
          </p>
        </div>

        <WorkstationEmptyState
          title="Brak połączonego komputera"
          description="Zainstaluj Sasist Agent na komputerze przy stanowisku, a następnie wygeneruj kod połączenia."
          action={
            <>
              <button
                type="button"
                className={brandPrimaryButtonClass}
                disabled={!downloadUrl}
                onClick={handleDownload}
              >
                Pobierz Sasist Agent
              </button>
              {!showPairingPanel ? (
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                  disabled={busy}
                  onClick={() => void handlePair()}
                >
                  {codeExpired ? "Wygeneruj nowy kod" : "Połącz komputer"}
                </button>
              ) : null}
            </>
          }
        />

        {codeExpired ? (
          <p className="text-sm text-amber-800">
            Kod połączenia wygasł. Wygeneruj nowy, a następnie wklej go w Agencie.
          </p>
        ) : null}

        {showPairingPanel ? (
          <div className="rounded-xl border border-orange-100 bg-[#FFF7ED] p-5 text-center">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Kod połączenia
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold tracking-widest text-slate-900">
              {pairingCode}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              ważny do {expiresAt ? new Date(expiresAt).toLocaleTimeString("pl-PL") : "15 minut"}
            </div>
            <p className="mt-2 text-xs text-slate-500">Oczekiwanie na połączenie…</p>
            <button
              type="button"
              className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={() => void handleCopy()}
            >
              Kopiuj kod
            </button>
            <ol className="mt-4 space-y-1 text-left text-sm text-slate-600">
              <li>1. Zainstaluj i otwórz Sasist Agent na komputerze przy tym stanowisku</li>
              <li>2. Wklej kod połączenia</li>
              <li>3. Status zmieni się automatycznie na „Połączono”</li>
            </ol>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      <h3 className="text-base font-semibold text-slate-900">Sasist Agent</h3>
      {detail.connection_status === "offline" ? (
        <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Agent jest offline. Sprawdź, czy aplikacja działa na komputerze stanowiska.
        </p>
      ) : null}
      <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
        <dt className="text-slate-500">Status</dt>
        <dd>
          <ConnectionDot status={detail.connection_status} />
        </dd>
        <dt className="text-slate-500">Komputer</dt>
        <dd className="font-medium text-slate-900">{agent.computer_name}</dd>
        <dt className="text-slate-500">System</dt>
        <dd>{agent.os ?? "—"}</dd>
        <dt className="text-slate-500">Wersja Agenta</dt>
        <dd>{agent.agent_version ?? "—"}</dd>
        <dt className="text-slate-500">Adres IP</dt>
        <dd>{agent.last_ip ?? "—"}</dd>
        <dt className="text-slate-500">Uptime</dt>
        <dd>{formatUptime(agent.uptime_seconds)}</dd>
        <dt className="text-slate-500">Ostatnia synchronizacja</dt>
        <dd>{formatRelativePl(agent.last_seen_at)}</dd>
      </dl>
      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
          disabled={busy}
          onClick={() => void handleDisconnect()}
        >
          Odłącz komputer
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          disabled={busy}
          onClick={() => void handlePair()}
        >
          Wygeneruj nowy kod
        </button>
      </div>
    </div>
  );
}
