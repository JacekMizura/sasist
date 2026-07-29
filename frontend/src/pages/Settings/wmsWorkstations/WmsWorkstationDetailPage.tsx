import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { fetchWorkstation } from "../../../api/wmsWorkstationsApi";
import PageLayout from "../../../components/layout/PageLayout";
import { tabsNavItemClassName } from "../../../components/layout/TabsNav";
import type { WorkstationDetail } from "../../../types/wmsWorkstations";
import { AgentTab } from "./AgentTab";
import { InfoTab } from "./InfoTab";
import { WMS_WORKSTATIONS_TENANT_ID } from "./tenant";
import { DevicesTab, HistoryTab, PrintersTab } from "./WorkstationOtherTabs";
import {
  StationTypeBadge,
  WorkstationErrorState,
  WorkstationsBreadcrumb,
} from "./workstationUi";

const TABS = [
  { id: "info", label: "Informacje" },
  { id: "agent", label: "Sasist Agent" },
  { id: "devices", label: "Urządzenia" },
  { id: "printers", label: "Drukarki" },
  { id: "history", label: "Historia" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function WmsWorkstationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const workstationId = Number(id);
  const [detail, setDetail] = useState<WorkstationDetail | null>(null);
  const [tab, setTab] = useState<TabId>("agent");
  const [error, setError] = useState<string | null>(null);
  const defaultedTabRef = useRef(false);

  const reload = useCallback(async () => {
    if (!Number.isFinite(workstationId) || workstationId < 1) return;
    try {
      setDetail(await fetchWorkstation(WMS_WORKSTATIONS_TENANT_ID, workstationId));
      setError(null);
    } catch (e) {
      const msg = extractApiErrorMessage(e);
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 401) {
        setError("Brak uprawnień do tego stanowiska.");
      } else if (status === 404) {
        setError("Nie znaleziono stanowiska.");
      } else {
        setError(msg || "Nie udało się wczytać stanowiska (timeout lub błąd sieci).");
      }
      setDetail(null);
    }
  }, [workstationId]);

  useEffect(() => {
    defaultedTabRef.current = false;
    void reload();
  }, [reload]);

  // Onboarding: unpaired stations open on Agent tab (code + pair).
  useEffect(() => {
    if (!detail || defaultedTabRef.current) return;
    defaultedTabRef.current = true;
    if (!detail.agent) setTab("agent");
  }, [detail]);

  if (!Number.isFinite(workstationId) || workstationId < 1) {
    return (
      <PageLayout>
        <WorkstationErrorState message="Nieprawidłowy identyfikator stanowiska." />
        <Link to="/settings/wms/workstations" className="mt-3 inline-block text-orange-600">
          ← Wróć do listy
        </Link>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout>
        <WorkstationsBreadcrumb />
        <div className="mt-4">
          <WorkstationErrorState message={error} onRetry={() => void reload()} />
        </div>
        <Link to="/settings/wms/workstations" className="mt-3 inline-block text-sm text-orange-600">
          ← Wróć do listy
        </Link>
      </PageLayout>
    );
  }

  if (!detail) {
    return (
      <PageLayout>
        <p className="text-sm text-slate-500">Ładowanie…</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <WorkstationsBreadcrumb current={detail.name} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{detail.name}</h1>
            <StationTypeBadge stationType={detail.station_type} label={detail.station_type_label} />
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tabsNavItemClassName(tab === t.id)}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {tab === "info" ? (
          <InfoTab workstationId={workstationId} detail={detail} onUpdated={setDetail} />
        ) : null}
        {tab === "agent" ? (
          <AgentTab
            workstationId={workstationId}
            detail={detail}
            onUpdated={setDetail}
            onPaired={() => setTab("devices")}
          />
        ) : null}
        {tab === "devices" ? (
          <DevicesTab
            workstationId={workstationId}
            detail={detail}
            onContinue={() => setTab("printers")}
          />
        ) : null}
        {tab === "printers" ? <PrintersTab workstationId={workstationId} detail={detail} /> : null}
        {tab === "history" ? <HistoryTab workstationId={workstationId} /> : null}
      </div>
    </PageLayout>
  );
}
