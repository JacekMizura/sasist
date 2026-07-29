import { useCallback, useEffect, useState } from "react";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { fetchWorkstationDevices } from "../../../api/wmsWorkstationsApi";
import type { DevicesGrouped, WorkstationDetail } from "../../../types/wmsWorkstations";
import { WMS_WORKSTATIONS_TENANT_ID } from "./tenant";
import {
  DeviceCard,
  WorkstationEmptyState,
  WorkstationErrorState,
  WorkstationTabShell,
  wsTokens,
} from "./workstationUi";

type Props = {
  workstationId: number;
  detail: WorkstationDetail;
  onContinue?: () => void;
};

type DeviceItem = DevicesGrouped["printers"][number];

const SECTIONS: Array<{ key: keyof DevicesGrouped; title: string }> = [
  { key: "printers", title: "Drukarki" },
  { key: "scanners", title: "Skanery" },
  { key: "scales", title: "Wagi" },
  { key: "cameras", title: "Kamery" },
  { key: "rfid", title: "RFID" },
  { key: "barcode_readers", title: "Czytniki" },
  { key: "other", title: "Inne" },
];

function DeviceSection({ title, items }: { title: string; items: DeviceItem[] }) {
  return (
    <section className="space-y-3">
      <h4 className={wsTokens.sectionLabel}>{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">Brak urządzeń w tej kategorii.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((d) => (
            <DeviceCard
              key={d.id}
              name={d.name}
              detail={d.detail}
              status={d.status}
              lastSeenAt={d.last_seen_at}
              deviceKind={d.device_kind}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function DevicesTab({ workstationId, detail, onContinue }: Props) {
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
      <WorkstationTabShell>
        <WorkstationEmptyState
          title="Brak urządzeń"
          description="Sprzęt pojawi się tutaj po podłączeniu komputera (Sasist Agent) do stanowiska."
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
  if (loading || !devices) {
    return (
      <WorkstationTabShell>
        <p className="text-sm text-slate-500">Ładowanie…</p>
      </WorkstationTabShell>
    );
  }

  const total = SECTIONS.reduce((sum, s) => sum + devices[s.key].length, 0);

  if (total === 0) {
    return (
      <WorkstationTabShell
        actions={
          <>
            <button type="button" className={wsTokens.mutedBtn} onClick={() => void load()}>
              Odśwież
            </button>
            {onContinue ? (
              <button type="button" className={wsTokens.primaryBtn} onClick={onContinue}>
                Dalej: drukarki
              </button>
            ) : null}
          </>
        }
      >
        <WorkstationEmptyState
          title="Brak zgłoszonych urządzeń"
          description="Agent nie zgłosił jeszcze drukarek ani innych urządzeń. Sprawdź połączenie i odśwież."
        />
      </WorkstationTabShell>
    );
  }

  return (
    <WorkstationTabShell
      intro="Sprzęt zgłoszony przez komputer przypisany do tego stanowiska."
      actions={
        <>
          <button type="button" className={wsTokens.mutedBtn} onClick={() => void load()}>
            Odśwież
          </button>
          {onContinue ? (
            <button type="button" className={wsTokens.primaryBtn} onClick={onContinue}>
              Dalej: skonfiguruj drukarki
            </button>
          ) : null}
        </>
      }
    >
      {SECTIONS.map((s) => (
        <DeviceSection key={s.key} title={s.title} items={devices[s.key]} />
      ))}
    </WorkstationTabShell>
  );
}
