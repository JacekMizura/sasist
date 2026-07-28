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

        if (status.agent) {
          pollingRef.current = false;
          clearLocalPairing(false);
          const full = await refreshFull();
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
      <div className="max-w-lg space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Sasist Agent</h3>
          <p className="mt-1 text-sm text-slate-600">
            Połącz komputer przy tym stanowisku, aby drukować etykiety i dokumenty.
          </p>
        </div>

        {!showPairingPanel ? (
          <WorkstationEmptyState
            title="Brak połączonego komputera"
            description="1) Pobierz i zainstaluj Sasist Agent na komputerze stanowiska. 2) Wygeneruj kod poniżej. 3) Wklej kod w Agencie."
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
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
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
          <p className="text-sm text-amber-800">
            Kod połączenia wygasł. Wygeneruj nowy, a następnie wklej go w Agencie.
          </p>
        ) : null}

        {showPairingPanel ? (
          <div className="rounded-xl border border-orange-100 bg-[#FFF7ED] p-5 text-center">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Kod połączenia
            </div>
            <div
              className="mt-2 select-all font-mono text-2xl font-semibold tracking-widest text-slate-900"
              data-testid="pairing-code"
            >
              {pairingCode}
            </div>
            <div className="mt-1 text-sm text-slate-500">ważny do {expiresLabel}</div>
            <p className="mt-2 text-xs text-slate-500">Oczekiwanie na połączenie z Agentem…</p>
            <button
              type="button"
              className={`${brandPrimaryButtonClass} mt-3`}
              onClick={() => void handleCopy()}
            >
              Kopiuj kod
            </button>
            <button
              type="button"
              className="mt-2 block w-full text-sm text-slate-600 underline"
              disabled={busy}
              onClick={() => void handlePair()}
            >
              Wygeneruj nowy kod
            </button>
            <ol className="mt-4 space-y-1 text-left text-sm text-slate-600">
              <li>1. Otwórz Sasist Agent na komputerze przy tym stanowisku</li>
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
      <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        Połączono. Sprawdź urządzenia, potem mapowanie drukarek i wykonaj wydruk testowy.
      </p>
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
