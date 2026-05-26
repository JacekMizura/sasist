import { useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_NUMBER_ALLOWED = [10, 25, 50, 100, 250] as const;

/** Safe allowed list for numeric storage; invalid input falls back to defaults. */
function normalizeNumberAllowed(allowed: unknown): readonly number[] {
  if (Array.isArray(allowed) && allowed.length > 0) {
    const nums = allowed.filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0);
    if (nums.length > 0) return nums;
  }
  return DEFAULT_NUMBER_ALLOWED;
}

/**
 * Third argument may be `allowed` (number[]) or a legacy storage key (string) when only 3 args are passed.
 * Fourth argument is optional legacy key when third is the allowed array.
 */
function resolveAllowedAndLegacy(
  third: readonly number[] | string | undefined,
  fourth: string | undefined,
): { allowed: readonly number[]; legacyKey?: string } {
  if (Array.isArray(third) && third.length > 0) {
    return { allowed: normalizeNumberAllowed(third), legacyKey: typeof fourth === "string" ? fourth : undefined };
  }
  if (typeof third === "string") {
    return { allowed: normalizeNumberAllowed(undefined), legacyKey: third };
  }
  return {
    allowed: normalizeNumberAllowed(undefined),
    legacyKey: typeof fourth === "string" ? fourth : undefined,
  };
}

function readStoredNumber(
  key: string,
  defaultValue: number,
  allowed: unknown,
  legacyKey?: string,
): number {
  const list = normalizeNumberAllowed(allowed);
  if (typeof window === "undefined") {
    return list.includes(defaultValue) ? defaultValue : list[0] ?? defaultValue;
  }
  const tryParse = (raw: string | null) => {
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Array.isArray(list) && list.includes(n) ? n : null;
  };
  const fromKey = tryParse(localStorage.getItem(key));
  if (fromKey != null) return fromKey;
  if (legacyKey) {
    const fromLegacy = tryParse(localStorage.getItem(legacyKey));
    if (fromLegacy != null) {
      try {
        localStorage.setItem(key, String(fromLegacy));
      } catch {
        // ignore
      }
      return fromLegacy;
    }
  }
  return list.includes(defaultValue) ? defaultValue : list[0] ?? defaultValue;
}

/**
 * Persists a numeric setting in `localStorage`. Value must be one of `allowed` (default: page sizes 10..250).
 */
export function useLocalStorage(
  key: string,
  defaultValue: number,
  third: readonly number[] | string | undefined = DEFAULT_NUMBER_ALLOWED,
  legacyKey?: string,
): [number, (next: number) => void] {
  const { allowed, legacyKey: resolvedLegacy } = useMemo(() => resolveAllowedAndLegacy(third, legacyKey), [third, legacyKey]);

  const [value, setValue] = useState(() => readStoredNumber(key, defaultValue, allowed, resolvedLegacy));

  useEffect(() => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // ignore
    }
  }, [key, value]);

  const setStored = useCallback(
    (next: number) => {
      const list = normalizeNumberAllowed(allowed);
      if (Array.isArray(list) && list.includes(next)) setValue(next);
      else setValue(list.includes(defaultValue) ? defaultValue : list[0] ?? defaultValue);
    },
    [allowed, defaultValue],
  );

  return [value, setStored];
}
