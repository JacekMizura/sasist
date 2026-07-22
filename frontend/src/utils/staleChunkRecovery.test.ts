import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import {
  clearStaleChunkReloadFlag,
  hasStaleChunkReloadBeenAttempted,
  isStaleChunkError,
  tryStaleChunkReload,
} from "./staleChunkRecovery";

function installBrowserMocks() {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  const reload = vi.fn();
  const location = { reload };
  vi.stubGlobal("sessionStorage", sessionStorage);
  vi.stubGlobal("location", location);
  vi.stubGlobal("window", { location, sessionStorage });
  return { reload, store };
}

describe("staleChunkRecovery", () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ({ reload } = installBrowserMocks());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects dynamic import / chunk load messages", () => {
    expect(
      isStaleChunkError(new TypeError("error loading dynamically imported module")),
    ).toBe(true);
    expect(
      isStaleChunkError(new TypeError("Failed to fetch dynamically imported module: https://x/a.js")),
    ).toBe(true);
    expect(isStaleChunkError(Object.assign(new Error("x"), { name: "ChunkLoadError" }))).toBe(true);
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleChunkError(new Error("Network Error"))).toBe(false);
  });

  it("reloads at most once per tab session", () => {
    expect(tryStaleChunkReload()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(hasStaleChunkReloadBeenAttempted()).toBe(true);
    expect(tryStaleChunkReload()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("allows another reload after flag clear", () => {
    expect(tryStaleChunkReload()).toBe(true);
    clearStaleChunkReloadFlag();
    expect(hasStaleChunkReloadBeenAttempted()).toBe(false);
    expect(tryStaleChunkReload()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
