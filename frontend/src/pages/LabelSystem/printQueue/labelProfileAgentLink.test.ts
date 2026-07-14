import { describe, expect, it } from "vitest";

import type { Printer } from "../../../types/printer";
import type { AgentPrinterRead } from "../../../types/printing";
import {
  formatProfileAgentLinkMessage,
  isProfileAgentLinkBroken,
  resolveProfileAgentLinkStatus,
} from "./labelProfileAgentLink";

describe("labelProfileAgentLink", () => {
  const legacyPrinters: Printer[] = [
    {
      id: 10,
      name: "Epson profile",
      profile_id: 5,
      system_printer_name: "EPSONB0294C (L4260 Series)",
    },
  ];

  const agentPrinters: AgentPrinterRead[] = [
    {
      id: 99,
      agent_id: 1,
      name: "Epson",
      system_name: "EPSONB0294C (L4260 Series)",
      printer_type: "label",
      is_default: false,
      is_active: true,
    },
  ];

  it("shows linked physical printer for profile with agent_printer_id", () => {
    const status = resolveProfileAgentLinkStatus(
      {
        id: 10,
        name: "Epson profile",
        profile_id: 5,
      },
      legacyPrinters,
      agentPrinters,
      [{ id: 5, name: "Epson profile", offset_x_mm: 0, offset_y_mm: 0, scale: 1, agent_printer_id: 99 }],
    );

    expect(status).toEqual({
      state: "linked",
      systemName: "EPSONB0294C (L4260 Series)",
      agentPrinterId: 99,
    });
    expect(formatProfileAgentLinkMessage(status)).toBe(
      "Fizyczna drukarka: EPSONB0294C (L4260 Series)",
    );
    expect(isProfileAgentLinkBroken(status)).toBe(false);
  });

  it("warns when profile points to missing agent printer", () => {
    const status = resolveProfileAgentLinkStatus(
      {
        id: 10,
        name: "Epson profile",
        profile_id: 5,
      },
      legacyPrinters,
      [],
      [{ id: 5, name: "Epson profile", offset_x_mm: 0, offset_y_mm: 0, scale: 1, agent_printer_id: 404 }],
    );

    expect(status).toEqual({
      state: "agent_missing",
      systemName: "EPSONB0294C (L4260 Series)",
      profileName: "Epson profile",
    });
    expect(isProfileAgentLinkBroken(status)).toBe(true);
  });
});
