import { describe, expect, it } from "vitest";

import { ADMINISTRATORS_TABS } from "./administratorsTabs";
import { WORKFORCE_TABS } from "./workforceTabs";

describe("Administrators module tabs", () => {
  it("exposes all six settings tabs in screenshot order", () => {
    expect(ADMINISTRATORS_TABS.map((t) => t.label)).toEqual([
      "Użytkownicy",
      "Role i uprawnienia",
      "Grupy użytkowników",
      "Historia aktywności",
      "Koszty pracowników",
      "Czas pracy",
    ]);
  });

  it("keeps work-time subtabs", () => {
    expect(WORKFORCE_TABS.map((t) => t.label)).toEqual(["Podsumowanie", "Ostatnia aktywność"]);
  });
});
