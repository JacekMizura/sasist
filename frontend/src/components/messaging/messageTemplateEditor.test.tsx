/**
 * Message templates editor UX — variables panel + cursor insert helpers.
 */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MessageVariablesPanel } from "../../components/messaging/MessageVariablesPanel";
import { insertTokenIntoInput } from "../../components/messaging/MessageHtmlEditor";
import type { MessageTemplateVariableGroupDto } from "../../api/messageTemplatesApi";

afterEach(() => {
  cleanup();
});

const GROUPS: MessageTemplateVariableGroupDto[] = [
  {
    id: "order",
    label: "Zamówienie",
    variables: [
      {
        key: "order_id",
        token: "{order_id}",
        label: "Numer zamówienia",
        description: "Identyfikator",
        group: "order",
        group_label: "Zamówienie",
        value_kind: "TEXT",
        supported_contexts: ["ORDER"],
        aliases: [],
      },
      {
        key: "order_email",
        token: "{order_email}",
        label: "E-mail klienta",
        description: "Adres e-mail",
        group: "order",
        group_label: "Zamówienie",
        value_kind: "TEXT",
        supported_contexts: ["ORDER"],
        aliases: [],
      },
    ],
  },
  {
    id: "billing",
    label: "Adres fakturowy",
    variables: [
      {
        key: "bill_address_city",
        token: "{bill_address_city}",
        label: "Miasto (faktura)",
        description: "Miasto",
        group: "billing",
        group_label: "Adres fakturowy",
        value_kind: "TEXT",
        supported_contexts: ["ORDER"],
        aliases: [],
      },
    ],
  },
];

describe("MessageVariablesPanel", () => {
  it("groups variables and inserts token on click", () => {
    const onInsert = vi.fn();
    render(createElement(MessageVariablesPanel, { groups: GROUPS, onInsert }));
    expect(screen.getByText("Zamówienie")).toBeTruthy();
    expect(screen.getByText("Adres fakturowy")).toBeTruthy();
    fireEvent.click(screen.getByText("{order_id}"));
    expect(onInsert).toHaveBeenCalledWith("{order_id}");
  });

  it("filters by token and description", () => {
    const onInsert = vi.fn();
    render(createElement(MessageVariablesPanel, { groups: GROUPS, onInsert }));
    fireEvent.change(screen.getByPlaceholderText("Szukaj zmiennej…"), { target: { value: "faktura" } });
    expect(screen.queryByText("{order_id}")).toBeNull();
    expect(screen.getByText("{bill_address_city}")).toBeTruthy();
  });
});

describe("insertTokenIntoInput", () => {
  it("inserts at cursor position, not only at end", () => {
    const input = document.createElement("input");
    input.value = "Hello world";
    document.body.appendChild(input);
    input.setSelectionRange(6, 6);
    let next = "";
    insertTokenIntoInput(input, "{order_id}", "Hello world", (v) => {
      next = v;
    });
    expect(next).toBe("Hello {order_id}world");
    document.body.removeChild(input);
  });
});

describe("supportedContextsFromModules", () => {
  it("round-trips ORDER+RETURN without mapping to ALL", async () => {
    const { supportedContextsFromModules, modulesFromSupportedContexts } = await import(
      "../../api/messageTemplatesApi"
    );
    const ctx = supportedContextsFromModules({ order: true, returns: true, complaints: false });
    expect(ctx).toEqual(["ORDER", "RETURN"]);
    expect(modulesFromSupportedContexts(ctx)).toEqual({
      order: true,
      returns: true,
      complaints: false,
    });
  });
});
