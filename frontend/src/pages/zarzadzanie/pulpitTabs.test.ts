import { describe, expect, it } from "vitest";
import { getPulpitTabId, PULPIT_ROOT, PULPIT_TABS } from "./pulpitTabs";

describe("pulpitTabs", () => {
  it("defaults to Decyzja on root path", () => {
    expect(getPulpitTabId(PULPIT_ROOT)).toBe("decyzja");
    expect(getPulpitTabId(`${PULPIT_ROOT}/`)).toBe("decyzja");
  });

  it("resolves section tabs", () => {
    expect(getPulpitTabId(`${PULPIT_ROOT}/alerty`)).toBe("alerty");
    expect(getPulpitTabId(`${PULPIT_ROOT}/operatorzy`)).toBe("operatorzy");
    expect(getPulpitTabId(`${PULPIT_ROOT}/kolejki`)).toBe("kolejki");
    expect(getPulpitTabId(`${PULPIT_ROOT}/dostawy`)).toBe("dostawy");
    expect(getPulpitTabId(`${PULPIT_ROOT}/historia`)).toBe("historia");
  });

  it("exposes TabsNav labels in order", () => {
    expect(PULPIT_TABS.map((t) => t.label)).toEqual([
      "Decyzja",
      "Alerty",
      "Operatorzy",
      "Kolejki",
      "Dostawy",
      "Historia",
    ]);
  });
});
