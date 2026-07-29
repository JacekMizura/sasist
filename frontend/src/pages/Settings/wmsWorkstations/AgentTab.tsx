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
import type { WorkstationDetail } from "../../../types/wmsWorkstations";
import { WmsSettingsSection } from "../WmsSettingsSection";
import { WmsSettingsLayout } from "../WmsSettingsLayout";
import { WMS_WORKSTATIONS_TENANT_ID } from "./tenant";
import {
  ConnectionDot,
  formatRelativePl,
  formatUptime,
  WorkstationDescList,
  WorkstationEmptyState,
  WorkstationTabShell,
  WsStatusBadge,
  wsTokens,
} from "./workstationUi";

const PAIRING_POLL_MS = 2500;

type Props = {
  workstationId: number;
  detail: WorkstationDetail;
  onUpdated: (row: WorkstationDetail) => void;
  /** Called once after Agent successfully pairs — parent can advance onboarding tabs. */
  onPaired?: () => void;
};

type StoredPairing = { code: string; expiresAt: string };

function pairingStorageKey(workstationId: number): string {
  return `wms-ws-pairing:${workstationId}`;
}

/** Parse API datetimes as UTC when timezone suffix is missing (naive UTC from backend). */
function parseApiUtcMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const raw = String(iso).trim();
  if (!raw) return null;
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = hasTz ? raw : `${raw}Z`;
  const ms = new Date(normalized).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function readStoredPairing(workstationId: number): StoredPairing | null {
  try {
    const raw = sessionStorage.getItem(pairingStorageKey(workstationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPairing;
    if (!parsed?.code || !parsed?.expiresAt) return null;
    const exp = parseApiUtcMs(parsed.expiresAt);
    if (exp == null || exp <= Date.now()) {
      sessionStorage.removeItem(pairingStorageKey(workstationId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredPairing(workstationId: number, code: string, expiresAt: string): void {
  try {
    sessionStorage.setItem(
      pairingStorageKey(workstationId),
      JSON.stringify({ code, expiresAt } satisfies StoredPairing),
    );
  } catch {
    // ignore quota / private mode
  }
}

function clearStoredPairing(workstationId: number): void {
  try {
    sessionStorage.removeItem(pairingStorageKey(workstationId));
  } catch {
    // ignore
  }
}

export function AgentTab({ workstationId, detail, onUpdated, onPaired }: Props) {
  const stored = readStoredPairing(workstationId);
  const [pairingCode, setPairingCode] = useState<string | null>(stored?.code ?? null);
  const [expiresAt, setExpiresAt] = useState<string | null>(stored?.expiresAt ?? null);
  const [codeExpired, setCodeExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const pollingRef = useRef(false);
  const toastConnectedRef = useRef(false);
  const issuedAtRef = useRef<number>(stored ? Date.now() : 0);
  const onPairedRef = useRef(onPaired);
  onPairedRef.current = onPaired;

  const clearLocalPairing = useCallback(
    (markExpired: boolean) => {
      setPairingCode(null);
      setExpiresAt(null);
      setCodeExpired(markExpired);
      clearStoredPairing(workstationId);
      pollingRef.current = false;
    },
    [workstationId],
  );

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
      clearLocalPairing(false);
      toastConnectedRef.current = false;
    }
  }, [detail.agent, clearLocalPairing]);

  // Poll slim pairing-status while waiting; pause when tab hidden.
  useEffect(() => {
    const waiting =
      Boolean(pairingCode || detail.pairing_active) && !detail.agent && !codeExpired;
    if (!waiting) {
      pollingRef.current = false;
      return;
    }

    pollingRef.current = true;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || !pollingRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const status = await fetchWorkstationPairingStatus(
          WMS_WORKSTATIONS_TENANT_ID,
          workstationId,
        );
        if (cancelled || !pollingRef.current) return;

        console.info("[wms-pairing] poll", {
          workstationId,
          pairing_active: status.pairing_active,
          hasAgent: Boolean(status.agent),
          connection_status: status.connection_status,
          agentId: status.agent?.id ?? null,
        });

        if (status.agent) {
          pollingRef.current = false;
          clearLocalPairing(false);
          const full = await refreshFull();
          console.info("[wms-pairing] status→Połączono", {
            workstationId,
            connection_status: full.connection_status,
            agentId: full.agent?.id ?? null,
          });
          onUpdated(full);
          if (!toastConnectedRef.current) {
            toastConnectedRef.current = true;
            toast.success("Połączono — komputer przypisany do stanowiska.");
            onPairedRef.current?.();
          }
          return;
        }

        // Server says inactive: only expire if local TTL also passed (avoid race right after POST /pair).
        if (!status.pairing_active) {
          const expMs = parseApiUtcMs(expiresAt);
          const graceMs = 8_000;
          const recentlyIssued = Date.now() - issuedAtRef.current < graceMs;
          const locallyValid = expMs != null && expMs > Date.now();
          if (recentlyIssued || locallyValid) {
            return;
          }
          pollingRef.current = false;
          clearLocalPairing(true);
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
    expiresAt,
    detail.pairing_active,
    detail.agent,
    codeExpired,
    workstationId,
    refreshFull,
    onUpdated,
    clearLocalPairing,
  ]);

  useEffect(() => {
    if (!expiresAt || detail.agent) return;
    const expMs = parseApiUtcMs(expiresAt);
    if (expMs == null) return;
    const remaining = expMs - Date.now();
    if (remaining <= 0) {
      clearLocalPairing(true);
      return;
    }
    const timer = window.setTimeout(() => {
      clearLocalPairing(true);
      toast.error("Kod połączenia wygasł. Wygeneruj nowy kod.");
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [expiresAt, detail.agent, clearLocalPairing]);

  const handlePair = async () => {
    setBusy(true);
    try {
      const res = await pairWorkstation(WMS_WORKSTATIONS_TENANT_ID, workstationId);
      const code = String(res.pairing_code || "").trim();
      const exp = String(res.expires_at || "").trim();
      // TEMP pairing diag — no full code/secret
      console.info("[wms-pairing] POST /pair", {
        workstationId,
        codeLen: code.length,
        expires_at: exp,
        pairing_active_hint: Boolean(code),
      });
      if (!code) {
        toast.error("Serwer nie zwrócił kodu połączenia.");
        return;
      }
      issuedAtRef.current = Date.now();
      setPairingCode(code);
      setExpiresAt(exp);
      setCodeExpired(false);
      writeStoredPairing(workstationId, code, exp);
      // Optimistic detail — do NOT refetch in a way that races local code display.
      onUpdated({
        ...detail,
        agent: null,
        computer_name: null,
        connection_status: "unpaired",
        pairing_active: true,
        pairing_expires_at: exp,
        device_count: 0,
        last_sync_at: null,
      });
      toast.success("Wygenerowano kod połączenia — skopiuj i wklej w Sasist Agent.");
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
      toast.error("Nie udało się skopiować — zaznacz kod ręcznie.");
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
      clearLocalPairing(false);
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
  const expiresLabel = (() => {
    const ms = parseApiUtcMs(expiresAt);
    if (ms == null) return "15 minut";
    return new Date(ms).toLocaleTimeString("pl-PL");
  })();

  if (!agent) {
    return (
      <WorkstationTabShell intro="Połącz komputer przy tym stanowisku, aby drukować etykiety i dokumenty.">
        {!showPairingPanel ? (
          <WorkstationEmptyState
            title="Brak połączonego komputera"
            description="1) Pobierz i zainstaluj Sasist Agent na komputerze stanowiska. 2) Wygeneruj kod poniżej. 3) Wklej kod w Agencie."
            action={
              <>
                <button
                  type="button"
                  className={wsTokens.primaryBtn}
                  disabled={!downloadUrl}
                  onClick={handleDownload}
                >
                  Pobierz Sasist Agent
                </button>
                <button
                  type="button"
                  className={wsTokens.mutedBtn}
                  disabled={busy}
                  onClick={() => void handlePair()}
                >
                  {codeExpired ? "Wygeneruj nowy kod" : "Wygeneruj kod połączenia"}
                </button>
              </>
            }
          />
        ) : null}

        {codeExpired && !showPairingPanel ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
            Kod połączenia wygasł. Wygeneruj nowy, a następnie wklej go w Agencie.
          </div>
        ) : null}

        {showPairingPanel ? (
          <WmsSettingsSection id="ws-pairing-code" title="Kod połączenia" summary={`Ważny do ${expiresLabel}`}>
            <div className="text-center">
              <div
                className="select-all font-mono text-2xl font-semibold tracking-widest text-slate-900"
                data-testid="pairing-code"
              >
                {pairingCode}
              </div>
              <p className="mt-2 text-xs text-slate-500">Oczekiwanie na połączenie z Agentem…</p>
              <ol className="mx-auto mt-4 max-w-sm space-y-1 text-left text-sm text-slate-600">
                <li>1. Otwórz Sasist Agent na komputerze przy tym stanowisku</li>
                <li>2. Wklej kod połączenia</li>
                <li>3. Status zmieni się automatycznie na „Połączono”</li>
              </ol>
            </div>
            <div className={wsTokens.actions}>
              <button type="button" className={wsTokens.primaryBtn} onClick={() => void handleCopy()}>
                Kopiuj kod
              </button>
              <button
                type="button"
                className={wsTokens.mutedBtn}
                disabled={busy}
                onClick={() => void handlePair()}
              >
                Wygeneruj nowy kod
              </button>
            </div>
          </WmsSettingsSection>
        ) : null}
      </WorkstationTabShell>
    );
  }

  return (
    <WmsSettingsLayout
      sections={[
        { id: "ws-agent-status", label: "Status połączenia" },
        { id: "ws-agent-params", label: "Parametry Agenta" },
      ]}
    >
      <WorkstationTabShell
        intro="Komputer przypisany do tego stanowiska."
        actions={
          <>
            <button
              type="button"
              className={wsTokens.dangerBtn}
              disabled={busy}
              onClick={() => void handleDisconnect()}
            >
              Odłącz komputer
            </button>
            <button
              type="button"
              className={wsTokens.mutedBtn}
              disabled={busy}
              onClick={() => void handlePair()}
            >
              Wygeneruj nowy kod
            </button>
          </>
        }
      >
        <WmsSettingsSection
          id="ws-agent-status"
          title="Status połączenia"
          summary={
            detail.connection_status === "offline"
              ? "Agent jest offline. Sprawdź, czy aplikacja działa na komputerze stanowiska."
              : "Połączono. Sprawdź urządzenia, potem mapowanie drukarek i wykonaj wydruk testowy."
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <ConnectionDot status={detail.connection_status} />
            {detail.connection_status === "offline" ? (
              <WsStatusBadge tone="warning">Offline</WsStatusBadge>
            ) : (
              <WsStatusBadge tone="success">Aktywny</WsStatusBadge>
            )}
          </div>
        </WmsSettingsSection>

        <WmsSettingsSection id="ws-agent-params" title="Parametry Agenta">
          <WorkstationDescList
            rows={[
              { label: "Komputer", value: agent.computer_name },
              { label: "System", value: agent.os ?? "—" },
              { label: "Wersja", value: agent.agent_version ?? "—" },
              { label: "IP", value: agent.last_ip ?? "—" },
              { label: "Uptime", value: formatUptime(agent.uptime_seconds) },
              { label: "Synchronizacja", value: formatRelativePl(agent.last_seen_at) },
            ]}
          />
        </WmsSettingsSection>
      </WorkstationTabShell>
    </WmsSettingsLayout>
  );
}
