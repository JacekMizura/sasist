import { useCallback, useRef, useState } from "react";

const SCAN_LOCK_MS = 250;
const SEARCH_DEBOUNCE_MS = 250;
const SCANNER_BURST_MS = 80;

export function isBarcodeLikeInput(value: string): boolean {
  const t = value.trim();
  return t.length >= 8 && /^[0-9A-Za-z.-]+$/.test(t);
}

type Options = {
  searchEnabled: boolean;
  onScan: (code: string) => void | Promise<void>;
  onSearchQuery?: (query: string) => void;
};

/** Single input pipeline — scanner vs human typing. */
export function useInventoryScanInput({ searchEnabled, onScan, onSearchQuery }: Options) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const firstKeyAt = useRef<number | null>(null);
  const scannerBurst = useRef(false);
  const inFlight = useRef(false);
  const lastSubmit = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const debounceRef = useRef<number | null>(null);

  const isScannerMode = useCallback(
    (value: string) => scannerBurst.current || isBarcodeLikeInput(value),
    [],
  );

  const submitScanOnce = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || inFlight.current) return;
      const now = Date.now();
      if (code === lastSubmit.current.code && now - lastSubmit.current.at < SCAN_LOCK_MS) return;

      inFlight.current = true;
      lastSubmit.current = { code, at: now };
      setQuery("");
      setSearchOpen(false);
      scannerBurst.current = false;
      firstKeyAt.current = null;
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      try {
        await onScan(code);
      } finally {
        inFlight.current = false;
      }
    },
    [onScan],
  );

  const onChange = useCallback(
    (value: string) => {
      const now = Date.now();
      if (value.length <= 1) {
        firstKeyAt.current = now;
        scannerBurst.current = false;
      } else if (firstKeyAt.current != null) {
        const elapsed = now - firstKeyAt.current;
        if (elapsed <= SCANNER_BURST_MS && value.length >= 4) {
          scannerBurst.current = true;
        }
      }

      setQuery(value);
      const scannerMode = isScannerMode(value);
      const canSearch = searchEnabled && !scannerMode && value.trim().length >= 2;
      setSearchOpen(canSearch);

      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      if (canSearch && onSearchQuery) {
        debounceRef.current = window.setTimeout(() => onSearchQuery(value), SEARCH_DEBOUNCE_MS);
      }
    },
    [isScannerMode, onSearchQuery, searchEnabled],
  );

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const clearInput = useCallback(() => {
    setQuery("");
    setSearchOpen(false);
    scannerBurst.current = false;
    firstKeyAt.current = null;
  }, []);

  return {
    query,
    searchOpen,
    isScannerMode: isScannerMode(query),
    onChange,
    submitScanOnce,
    closeSearch,
    clearInput,
    inFlight,
  };
}
