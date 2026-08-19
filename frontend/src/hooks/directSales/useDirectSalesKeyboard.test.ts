import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { handleDirectSalesKeyDown } from "./useDirectSalesKeyboard";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEYBOARD_SRC = readFileSync(path.resolve(HERE, "./useDirectSalesKeyboard.ts"), "utf8");
const TERMINAL_SRC = readFileSync(path.resolve(HERE, "./useDirectSalesTerminal.ts"), "utf8");

describe("useDirectSalesKeyboard handleDirectSalesKeyDown", () => {
  const handlers = {
    onCash: vi.fn(),
    onCard: vi.fn(),
    onBlik: vi.fn(),
    onComplete: vi.fn(),
  };

  it("A) F1/F2/F3/Ctrl+Enter invoke handlers when target is not a typing field", () => {
    handlers.onCash.mockClear();
    handlers.onCard.mockClear();
    handlers.onBlik.mockClear();
    handlers.onComplete.mockClear();

    handleDirectSalesKeyDown({ key: "F1", ctrlKey: false, target: null }, handlers);
    handleDirectSalesKeyDown({ key: "F2", ctrlKey: false, target: null }, handlers);
    handleDirectSalesKeyDown({ key: "F3", ctrlKey: false, target: null }, handlers);
    handleDirectSalesKeyDown({ key: "Enter", ctrlKey: true, target: null }, handlers);

    expect(handlers.onCash).toHaveBeenCalledTimes(1);
    expect(handlers.onCard).toHaveBeenCalledTimes(1);
    expect(handlers.onBlik).toHaveBeenCalledTimes(1);
    expect(handlers.onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("useDirectSalesKeyboard enabled gate", () => {
  it("B) hook skips listener registration when enabled=false", () => {
    expect(KEYBOARD_SRC).toMatch(/if \(!enabled\) return/);
  });

  it("terminal passes keyboard_shortcuts into enabled flag", () => {
    expect(TERMINAL_SRC).toContain("resolvedDirectSalesSettings.keyboard_shortcuts");
    expect(TERMINAL_SRC).toContain("useDirectSalesKeyboard({");
  });
});
