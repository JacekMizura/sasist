import { useCallback, useEffect, useState } from "react";

import api from "../../../api/axios";
import {
  fetchAgentPrinters,
  fetchPrintingAgents,
  fetchSystemPrinters,
} from "../../../api/printingApi";
import type { Printer } from "../../../types/printer";
import type { PrinterProfile } from "../../../types/printerProfiles";
import type { AgentPrinterRead, PrinterAgentRead } from "../../../types/printing";

function profilesAsPrinters(profiles: PrinterProfile[]): Printer[] {
  return profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    profile_id: profile.id,
    profile: {
      id: profile.id,
      name: profile.name,
      offset_x_mm: profile.offset_x_mm,
      offset_y_mm: profile.offset_y_mm,
      scale: profile.scale,
      dpi: profile.dpi ?? null,
    },
  }));
}

function mergeUniqueNames(...lists: Array<string[] | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    if (!list) continue;
    for (const raw of list) {
      const name = raw.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "pl"));
}

type Options = {
  tenantId: number;
  warehouseId?: number | null;
};

export function useLabelPrintingPrinters({ tenantId, warehouseId }: Options) {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [legacyPrinters, setLegacyPrinters] = useState<Printer[]>([]);
  const [agentPrinters, setAgentPrinters] = useState<AgentPrinterRead[]>([]);
  const [agents, setAgents] = useState<PrinterAgentRead[]>([]);
  const [systemPrinters, setSystemPrinters] = useState<string[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  const reloadPrinters = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [legacyRes, profilesRes, agentsScoped, agentPrintersScoped, systemScoped] =
          await Promise.all([
            api.get<Printer[]>("/printers", { params: { tenant_id: tenantId } }),
            api.get<PrinterProfile[]>("/printer-profiles", { params: { tenant_id: tenantId } }),
            fetchPrintingAgents(tenantId, warehouseId ?? undefined),
            fetchAgentPrinters(tenantId, { warehouseId }),
            fetchSystemPrinters(tenantId, { warehouseId }),
          ]);

        let agentsData = agentsScoped;
        let agentPrintersData = agentPrintersScoped;
        let systemData = systemScoped;

        if (
          warehouseId != null &&
          agentPrintersData.length === 0 &&
          systemData.length === 0
        ) {
          const [agentsAll, agentPrintersAll, systemAll] = await Promise.all([
            fetchPrintingAgents(tenantId),
            fetchAgentPrinters(tenantId),
            fetchSystemPrinters(tenantId),
          ]);
          agentsData = agentsAll;
          agentPrintersData = agentPrintersAll;
          systemData = systemAll;
        }

        const legacyRows = Array.isArray(legacyRes.data) ? legacyRes.data : [];
        const profileRows = Array.isArray(profilesRes.data) ? profilesRes.data : [];
        const dropdownPrinters =
          legacyRows.length > 0 ? legacyRows : profilesAsPrinters(profileRows);

        const agentSystemNames = agentPrintersData
          .filter((row) => row.is_active)
          .map((row) => row.system_name)
          .filter(Boolean);
        const mergedSystem = mergeUniqueNames(systemData, agentSystemNames);

        if (cancelled) return;

        setPrinters(dropdownPrinters);
        setProfiles(profileRows);
        setLegacyPrinters(legacyRows);
        setAgents(agentsData);
        setAgentPrinters(agentPrintersData);
        setSystemPrinters(mergedSystem);

        console.log("[printing]", {
          profiles: profileRows,
          systemPrinters: mergedSystem,
          agents: agentsData,
          agentPrinters: agentPrintersData,
          legacyPrinters: legacyRows,
          dropdownPrinters,
        });
      } catch (err) {
        if (cancelled) return;
        console.error("[printing] load failed:", err);
        setPrinters([]);
        setProfiles([]);
        setLegacyPrinters([]);
        setAgents([]);
        setAgentPrinters([]);
        setSystemPrinters([]);
        console.log("[printing]", { profiles: [], systemPrinters: [], agents: [] });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantId, warehouseId, reloadToken]);

  return {
    printers,
    profiles,
    legacyPrinters,
    agentPrinters,
    agents,
    systemPrinters,
    setSystemPrinters,
    reloadPrinters,
  };
}
