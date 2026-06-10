import { useCallback, useEffect, useRef, useState } from "react";
import { postCustomerGusLookup, type GusLookupResult } from "../../api/customersGusApi";
import { normalizePolishNip, validatePolishNipChecksum } from "../../utils/polishNip";

const DEBOUNCE_MS = 900;

type State = {
  loading: boolean;
  error: string | null;
  result: GusLookupResult | null;
  applied: boolean;
};

export function useCustomerGusLookup(nip: string, tenantId: number) {
  const [state, setState] = useState<State>({
    loading: false,
    error: null,
    result: null,
    applied: false,
  });

  const reqId = useRef(0);
  const lastFetchedNip = useRef<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const skipInitialAutoFetch = useRef(true);
  const prevNormalizedNip = useRef<string | null>(null);

  const runLookup = useCallback(
    async (rawNip: string, opts?: { force?: boolean }) => {
      const normalized = normalizePolishNip(rawNip);
      if (!normalized || !validatePolishNipChecksum(normalized)) {
        setState((s) => ({ ...s, error: null, result: null, loading: false }));
        return;
      }

      if (!opts?.force && lastFetchedNip.current === normalized) {
        return;
      }

      const id = ++reqId.current;
      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const data = await postCustomerGusLookup(normalized, tenantId, Boolean(opts?.force));
        if (reqId.current !== id) return;
        lastFetchedNip.current = normalized;

        if (!data.ok || !data.found) {
          setState({
            loading: false,
            error: data.error || "Nie znaleziono firmy dla podanego NIP.",
            result: null,
            applied: false,
          });
          return;
        }

        setState({
          loading: false,
          error: data.warning ?? null,
          result: data,
          applied: false,
        });
      } catch {
        if (reqId.current !== id) return;
        setState({
          loading: false,
          error: "Nie udało się połączyć z usługą. Spróbuj ponownie.",
          result: null,
          applied: false,
        });
      }
    },
    [tenantId],
  );

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    const normalized = normalizePolishNip(nip);
    if (!normalized || !validatePolishNipChecksum(normalized)) {
      if (!nip.trim()) {
        setState({ loading: false, error: null, result: null, applied: false });
        lastFetchedNip.current = null;
        prevNormalizedNip.current = null;
      }
      return;
    }

    if (skipInitialAutoFetch.current) {
      skipInitialAutoFetch.current = false;
      prevNormalizedNip.current = normalized;
      return;
    }

    if (prevNormalizedNip.current === normalized) {
      return;
    }
    prevNormalizedNip.current = normalized;

    debounceRef.current = window.setTimeout(() => {
      void runLookup(nip);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [nip, runLookup]);

  const fetchManual = useCallback(() => {
    void runLookup(nip, { force: true });
  }, [nip, runLookup]);

  const markApplied = useCallback(() => {
    setState((s) => ({ ...s, applied: true }));
  }, []);

  const clearResult = useCallback(() => {
    lastFetchedNip.current = null;
    setState({ loading: false, error: null, result: null, applied: false });
  }, []);

  return {
    ...state,
    fetchManual,
    markApplied,
    clearResult,
    isValidNip: validatePolishNipChecksum(nip),
  };
}
