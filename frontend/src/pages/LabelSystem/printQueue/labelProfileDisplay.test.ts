import { describe, expect, it } from "vitest";

import type { Printer } from "../../../types/printer";
import {
  formatProfileOptionDisplay,
  formatProfileSummaryLabel,
  resolveSystemPrinterName,
} from "./labelProfileDisplay";

describe("labelProfileDisplay", () => {
  const legacyPrinters: Printer[] = [
    {
      id: 10,
      name: "200x40 ZPL",
      profile_id: 5,
      system_printer_name: "ZDesigner ZD220",
    },
  ];

  it("shows profile title and linked system printer subtitle", () => {
    const printer: Printer = {
      id: 10,
      name: "200x40 ZPL",
      profile_id: 5,
      profile: {
        id: 5,
        name: "200x40 ZPL",
        offset_x_mm: 0,
        offset_y_mm: 0,
        scale: 1,
      },
      system_printer_name: "ZDesigner ZD220",
    };

    expect(formatProfileOptionDisplay(printer, legacyPrinters)).toEqual({
      title: "200x40 ZPL",
      subtitle: "ZDesigner ZD220",
    });
    expect(formatProfileSummaryLabel(printer, legacyPrinters)).toBe("200x40 ZPL (ZDesigner ZD220)");
  });

  it("resolves system printer from legacy mapping when missing on selected row", () => {
    const printer: Printer = {
      id: 5,
      name: "200x40 ZPL",
      profile_id: 5,
      profile: {
        id: 5,
        name: "200x40 ZPL",
        offset_x_mm: 0,
        offset_y_mm: 0,
        scale: 1,
      },
    };

    expect(resolveSystemPrinterName(printer, legacyPrinters)).toBe("ZDesigner ZD220");
  });
});
