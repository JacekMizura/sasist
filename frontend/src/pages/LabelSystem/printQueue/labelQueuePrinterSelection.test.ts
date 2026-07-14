import { describe, expect, it } from "vitest";

import type { Printer } from "../../../types/printer";
import type { AgentPrinterRead } from "../../../types/printing";
import { resolveLabelQueuePrinterSelection } from "./labelQueuePrinterSelection";

describe("resolveLabelQueuePrinterSelection", () => {
  it("maps legacy printer system name to agent_printer_id", () => {
    const selectedPrinter: Printer = {
      id: 10,
      name: "Epson profile",
      profile_id: 5,
      system_printer_name: "EPSONB0294C (L4260 Series)",
    };
    const profiles = [{ id: 5, name: "Epson profile", offset_x_mm: 0, offset_y_mm: 0, scale: 1, agent_printer_id: 99 }];
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
      {
        id: 100,
        agent_id: 1,
        name: "Zebra",
        system_name: "ZDesigner ZD220-203dpi ZPL",
        printer_type: "label",
        is_default: true,
        is_active: true,
      },
    ];

    expect(resolveLabelQueuePrinterSelection(selectedPrinter, agentPrinters, profiles, [])).toEqual({
      printer_id: 99,
      printer_profile_id: 5,
    });
  });
});
