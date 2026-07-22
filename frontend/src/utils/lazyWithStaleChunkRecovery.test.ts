import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { isStaleChunkError, tryStaleChunkReload } from "./staleChunkRecovery";

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
  return reload;
}

async function loadWithRecovery<T>(factory: () => Promise<T>): Promise<T | "reloading"> {
  try {
    return await factory();
  } catch (err) {
    if (isStaleChunkError(err) && tryStaleChunkReload()) {
      return "reloading";
    }
    throw err;
  }
}

describe("lazyWithStaleChunkRecovery catch path", () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reload = installBrowserMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recovers once on dynamic import failure", async () => {
    const out = await loadWithRecovery(async () => {
      throw new TypeError("error loading dynamically imported module");
    });
    expect(out).toBe("reloading");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload on ordinary runtime TypeError", async () => {
    await expect(
      loadWithRecovery(async () => {
        throw new TypeError("Cannot read properties of undefined (reading 'map')");
      }),
    ).rejects.toThrow(/Cannot read properties/);
    expect(reload).not.toHaveBeenCalled();
  });
});
