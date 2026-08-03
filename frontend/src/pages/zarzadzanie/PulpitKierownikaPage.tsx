import { useEffect } from "react";
import { ManagerDecisionsPanel } from "./ManagerDecisionsPanel";
import { PulpitSection } from "./PulpitSection";
import CentrumOperacyjnePage from "../centrum-operacyjne/CentrumOperacyjnePage";

/**
 * Jedyny ekran live kierownika — Pulpit (dashboard).
 * Sekcje zwijane, nie osobne moduły / routingi.
 */
export default function PulpitKierownikaPage() {
  useEffect(() => {
    if (window.location.hash === "#decyzje") {
      document.getElementById("decyzje")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <div className="min-w-0 space-y-4">
      <header>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Pulpit kierownika</h1>
        <p className="mt-1 text-sm text-slate-500">
          Nadzór zmiany i decyzje — wykonanie pracy odbywa się na hali (WMS).
        </p>
      </header>

      <PulpitSection id="decyzje" title="Decyzje" defaultOpen>
        <ManagerDecisionsPanel />
      </PulpitSection>

      <CentrumOperacyjnePage embedInPulpit />
    </div>
  );
}
