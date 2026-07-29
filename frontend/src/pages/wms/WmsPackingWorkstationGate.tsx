import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import toast from "react-hot-toast";

import { setMePackingStation } from "../../api/authApi";
import { fetchWorkstationsAvailableForMe } from "../../api/wmsWorkstationsApi";
import { useAuth } from "../../context/AuthContext";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { PrimaryButton, SecondaryButton } from "@/design-system";
import type { WorkstationListItem } from "../../types/wmsWorkstations";
import {
  loadWmsPackingSession,
  packingSessionWorkstationId,
  patchWmsPackingSession,
  PENDING_WORKSTATION_KEY,
} from "./wmsPackingSession";

/**
 * Gate: packing requires an allowed workstation in the packing session.
 * Not a global WMS ActiveWorkstation.
 */
export default function WmsPackingWorkstationGate() {
  const { user, refreshSession } = useAuth();
  const [stations, setStations] = useState<WorkstationListItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyStation = useCallback(
    async (station: WorkstationListItem) => {
      setBusy(true);
      try {
        const session = loadWmsPackingSession();
        if (session) {
          patchWmsPackingSession({
            workstationId: station.id,
            workstationName: station.name,
          });
        } else {
          // Status not chosen yet — stash station until status page creates session.
          sessionStorage.setItem(
            PENDING_WORKSTATION_KEY,
            JSON.stringify({ workstationId: station.id, workstationName: station.name }),
          );
        }
        try {
          await setMePackingStation(station.id);
          await refreshSession();
        } catch {
          /* last-used convenience — non-blocking */
        }
        setReady(true);
      } finally {
        setBusy(false);
      }
    },
    [refreshSession],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (packingSessionWorkstationId() != null) {
        setReady(true);
        return;
      }
      try {
        const pendingRaw = sessionStorage.getItem(PENDING_WORKSTATION_KEY);
        if (pendingRaw) {
          const o = JSON.parse(pendingRaw) as { workstationId?: number };
          if (o.workstationId != null && Number(o.workstationId) >= 1) {
            setReady(true);
            return;
          }
        }
      } catch {
        /* ignore */
      }
      try {
        const list = await fetchWorkstationsAvailableForMe(DAMAGE_TENANT_ID);
        if (cancelled) return;
        setStations(list);
        if (list.length === 0) {
          setError("Nie masz przypisanego stanowiska. Skontaktuj się z administratorem.");
          return;
        }
        if (list.length === 1) {
          await applyStation(list[0]);
          return;
        }
        const last = user?.wms_profile?.packing_station_id ?? null;
        const pre = last != null ? list.find((s) => s.id === last) : null;
        setSelectedId(pre?.id ?? list[0]?.id ?? null);
      } catch {
        if (!cancelled) setError("Nie udało się pobrać listy stanowisk.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyStation, user?.wms_profile?.packing_station_id]);

  if (ready) return <Outlet />;

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Pakowanie</h1>
        <p className="mt-3 text-sm text-slate-600 whitespace-pre-line">{error}</p>
      </div>
    );
  }

  if (!stations) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-slate-500">
        Ładowanie stanowisk…
      </div>
    );
  }

  if (stations.length <= 1) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-slate-500">
        Przygotowywanie stanowiska…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-xl font-semibold text-slate-900">Wybierz stanowisko</h1>
      <p className="mt-2 text-sm text-slate-600">
        Stanowisko obowiązuje wyłącznie podczas pakowania (Agent i drukarki tego stanowiska).
      </p>
      <ul className="mt-6 space-y-2">
        {stations.map((s) => (
          <li key={s.id}>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${
                selectedId === s.id ? "border-orange-300 bg-orange-50/80" : "border-slate-200 bg-white"
              }`}
            >
              <input
                type="radio"
                name="packing-station"
                checked={selectedId === s.id}
                onChange={() => setSelectedId(s.id)}
              />
              <span className="min-w-0">
                <span className="block font-medium text-slate-900">{s.name}</span>
                <span className="block text-xs text-slate-500">
                  {s.warehouse_name ?? `Magazyn #${s.warehouse_id}`} · {s.station_type_label}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex justify-end gap-2">
        <SecondaryButton
          type="button"
          disabled={busy || selectedId == null}
          onClick={() => {
            const s = stations.find((x) => x.id === selectedId);
            if (s) void applyStation(s);
            else toast.error("Wybierz stanowisko.");
          }}
        >
          {busy ? "Zapisywanie…" : "Kontynuuj"}
        </SecondaryButton>
        <PrimaryButton
          type="button"
          disabled={busy || selectedId == null}
          onClick={() => {
            const s = stations.find((x) => x.id === selectedId);
            if (s) void applyStation(s);
            else toast.error("Wybierz stanowisko.");
          }}
        >
          Rozpocznij pakowanie
        </PrimaryButton>
      </div>
    </div>
  );
}

/** Call when creating packing session from status — attach pending station from gate. */
export function consumePendingPackingWorkstation(): {
  workstationId?: number;
  workstationName?: string;
} {
  try {
    const raw = sessionStorage.getItem(PENDING_WORKSTATION_KEY);
    if (!raw) return {};
    sessionStorage.removeItem(PENDING_WORKSTATION_KEY);
    const o = JSON.parse(raw) as { workstationId?: number; workstationName?: string };
    return {
      workstationId: o.workstationId,
      workstationName: o.workstationName,
    };
  } catch {
    return {};
  }
}
