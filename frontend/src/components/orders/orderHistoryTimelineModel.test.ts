import { describe, expect, it } from "vitest";
import { buildOrderHistoryTimelineEvents } from "./orderHistoryTimelineModel";

describe("buildOrderHistoryTimelineEvents wms mode", () => {
  it("uses only WMS timeline and omits redundant WMS badge", () => {
    const events = buildOrderHistoryTimelineEvents(
      {
        id: 1,
        created_at: "2026-08-23T10:00:00Z",
        order_activity_logs: [
          {
            id: 9,
            event_type: "PACKING_AUTOMATION_FINISHED",
            message: "Automatyka pakowania zakończona",
            created_at: "2026-08-23T14:11:00Z",
          },
        ],
      },
      {
        timeline: [
          {
            at: "2026-08-23T14:11:00Z",
            title: "Automatyka pakowania zakończona",
            badge: "WMS",
            user_label: "Super Admin",
            event_type: "PACKING_AUTOMATION_FINISHED",
            details: [
              { label: "Status", value: "Spakowane" },
              { label: "Dokument", value: "FV/2026/08/000006" },
              { label: "Przesyłka", value: "Nie utworzono (wyłączona)" },
            ],
          },
          {
            at: "2026-08-23T13:00:00Z",
            title: "Zebrano 2 × ST-001",
            badge: "",
            user_label: "Super Admin",
            event_type: "PICKED_ITEM",
            details: [{ label: "Lokalizacja", value: "A1-A-1" }],
          },
        ],
      } as any,
      { mode: "wms" },
    );

    expect(events).toHaveLength(2);
    expect(events.every((e) => e.variant === "wms_event")).toBe(true);
    expect(events.some((e) => e.title === "Pobranie zamówienia")).toBe(false);
    // Activity duplicate of automation must not appear in wms mode
    expect(events.filter((e) => e.title.includes("Automatyka"))).toHaveLength(1);
    expect(events[0]!.badge).toBeUndefined();
    expect(events[0]!.details?.[0]).toEqual({ label: "Status", value: "Spakowane" });
    const rendered = events
      .flatMap((e) => [e.title, e.description ?? "", ...(e.details ?? []).map((d) => `${d.label} ${d.value}`)])
      .join(" ");
    expect(rendered).not.toMatch(/change_order_status|disabled_in_settings|c749a28f|no_consumables/i);
  });

  it("full mode skips PACKING_AUTOMATION_FINISHED activity when WMS timeline present", () => {
    const events = buildOrderHistoryTimelineEvents(
      {
        id: 1,
        order_activity_logs: [
          {
            id: 9,
            event_type: "PACKING_AUTOMATION_FINISHED",
            message: "Automatyka pakowania zakończona",
            created_at: "2026-08-23T14:11:00Z",
          },
        ],
      },
      {
        timeline: [
          {
            at: "2026-08-23T14:11:00Z",
            title: "Automatyka pakowania zakończona",
            event_type: "PACKING_AUTOMATION_FINISHED",
            details: [{ label: "Status", value: "Spakowane" }],
          },
        ],
      } as any,
      { mode: "full" },
    );
    expect(events.filter((e) => e.title.includes("Automatyka"))).toHaveLength(1);
  });
});
