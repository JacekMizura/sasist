import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ActivityLogTable from "./ActivityLogTable";

afterEach(() => {
  cleanup();
});

describe("ActivityLogTable inline details", () => {
  it("renders mutation details without Pokaż szczegóły", () => {
    const { container } = render(
      <MemoryRouter>
        <ActivityLogTable
          objectType="order"
          objectId={1}
          defaultCollapsed={false}
          rows={[
            {
              id: "1",
              date: "23.08.2026 12:00",
              operator: "Jacek Mizura",
              event: "Zmieniono adres dostawy",
              message: "Zmieniono adres dostawy.",
              severity: "INFO",
              actorKind: "USER",
              detailsDisplay: "inline",
              details: [
                { label: "Ulica", value: "A → B" },
                { label: "Kod pocztowy", value: "01 → 02" },
              ],
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: /Pokaż szczegóły/i })).toBeNull();
    const section = within(container);
    expect(section.getByText("Ulica")).toBeTruthy();
    expect(section.getByText("A → B")).toBeTruthy();
    expect(section.getByText("Jacek Mizura")).toBeTruthy();
  });
});
