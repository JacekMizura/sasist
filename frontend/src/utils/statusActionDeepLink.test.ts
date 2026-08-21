/**
 * STATUS_ACTION deep-link routing across ORDER / RETURN / COMPLAINT.
 */
import { describe, expect, it } from "vitest";
import {
  resolveStatusActionDeepLink,
  statusActionConfiguratorPath,
  statusActionDomainLabel,
  statusNameMapKey,
} from "./statusActionDeepLink";

describe("statusActionDeepLink", () => {
  it("A. ORDER → order statuses", () => {
    const r = resolveStatusActionDeepLink({ entityType: "ORDER", triggerStatusId: 12 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.path).toBe("/orders/statuses?editStatusId=12");
      expect(r.statusId).toBe(12);
    }
  });

  it("B. RETURN → return statuses", () => {
    const r = resolveStatusActionDeepLink({ entityType: "RETURN", triggerStatusId: 44 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.path).toBe("/orders/returns/statuses?editStatusId=44");
  });

  it("C. COMPLAINT → complaint statuses", () => {
    const r = resolveStatusActionDeepLink({ entityType: "COMPLAINT", triggerStatusId: 7 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.path).toBe("/settings/complaints/ui-statuses?editStatusId=7");
  });

  it("D. status_id in URL", () => {
    expect(statusActionConfiguratorPath("ORDER", 99)).toContain("editStatusId=99");
    expect(statusActionConfiguratorPath("RETURN", 99)).toContain("editStatusId=99");
    expect(statusActionConfiguratorPath("COMPLAINT", 99)).toContain("editStatusId=99");
  });

  it("G. missing status_id → safe fallback", () => {
    const r = resolveStatusActionDeepLink({ entityType: "ORDER", triggerStatusId: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_status_id");
  });

  it("domain labels + map keys isolate domains", () => {
    expect(statusActionDomainLabel("RETURN")).toBe("Zwroty");
    expect(statusNameMapKey("ORDER", 1)).not.toBe(statusNameMapKey("RETURN", 1));
  });
});
