import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { fetchWorkstation } from "../../../api/wmsWorkstationsApi";
import { TabsContainer } from "../../../components/layout/TabsContainer";
import { tabsNavItemClassName } from "../../../components/layout/TabsNav";
import type { WorkstationDetail } from "../../../types/wmsWorkstations";
import { WmsSettingsChrome, WMS_WORKSTATIONS_PATH } from "../WmsSettingsChrome";
import { AgentTab } from "./AgentTab";
import { InfoTab } from "./InfoTab";
import { WMS_WORKSTATIONS_TENANT_ID } from "./tenant";
import { DevicesTab, HistoryTab, PrintersTab } from "./WorkstationOtherTabs";
import { StationTypeBadge, WorkstationErrorState } from "./workstationUi";

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
      <WmsSettingsChrome trail={[{ label: "Stanowiska", to: WMS_WORKSTATIONS_PATH }]}>
        <WorkstationErrorState message="Nieprawidłowy identyfikator stanowiska." />
        <Link to={WMS_WORKSTATIONS_PATH} className="mt-3 inline-block text-sm text-orange-700 hover:text-orange-800">
          ← Wróć do listy
        </Link>
      </WmsSettingsChrome>
    );
  }

  if (error) {
    return (
      <WmsSettingsChrome trail={[{ label: "Stanowiska", to: WMS_WORKSTATIONS_PATH }]}>
        <WorkstationErrorState message={error} onRetry={() => void reload()} />
        <Link to={WMS_WORKSTATIONS_PATH} className="mt-3 inline-block text-sm text-orange-700 hover:text-orange-800">
          ← Wróć do listy
        </Link>
      </WmsSettingsChrome>
    );
  }

  if (!detail) {
    return (
      <WmsSettingsChrome trail={[{ label: "Stanowiska", to: WMS_WORKSTATIONS_PATH }]}>
        <p className="text-sm text-slate-500">Ładowanie…</p>
      </WmsSettingsChrome>
    );
  }

  return (
    <WmsSettingsChrome
      trail={[
        { label: "Stanowiska", to: WMS_WORKSTATIONS_PATH },
        { label: detail.name },
      ]}
      title={
        <span className="inline-flex flex-wrap items-center gap-3">
          <span>{detail.name}</span>
          <StationTypeBadge stationType={detail.station_type} label={detail.station_type_label} />
        </span>
      }
      subtitle={detail.warehouse_name ? `Magazyn: ${detail.warehouse_name}` : undefined}
    >
      <TabsContainer className="w-full [-webkit-overflow-scrolling:touch]">
        <nav
          className="flex w-full flex-nowrap gap-6 overflow-x-auto sm:justify-start"
          aria-label="Sekcje stanowiska"
          role="tablist"
        >
          {TABS.map((t) => {
            const selected = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                className={tabsNavItemClassName(selected)}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      </TabsContainer>

      <div className="mt-6 w-full min-w-0" role="tabpanel">
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
    </WmsSettingsChrome>
  );
}
