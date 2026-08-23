import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ActivityLogPanel from "./ActivityLogPanel";

vi.mock("../../api/activityLogApi", () => ({
  fetchActivityLog: vi.fn(async () => ({ items: [], total: 0 })),
}));

afterEach(() => {
  cleanup();
});

describe("ActivityLogPanel Order Logi defaults", () => {
  it("Logi tab mounts expanded (aria-expanded true)", () => {
    const { container } = render(
      <MemoryRouter>
        <ActivityLogPanel objectType="order" objectId={1273} defaultCollapsed={false} />
      </MemoryRouter>,
    );
    const section = within(container).getByRole("region", { name: /Historia czynności/i });
    const toggle = within(section).getByRole("button", { name: /Historia czynności/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("footer mounts collapsed when defaultCollapsed true", () => {
    const { container } = render(
      <MemoryRouter>
        <ActivityLogPanel objectType="order" objectId={1273} defaultCollapsed />
      </MemoryRouter>,
    );
    const section = within(container).getByRole("region", { name: /Historia czynności/i });
    const toggle = within(section).getByRole("button", { name: /Historia czynności/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
