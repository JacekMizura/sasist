import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { fetchResolvedLabels } from "../api/systemLabelsApi";
import { useAuth } from "../context/AuthContext";
import {
  applyLabelCache,
  getLabel,
  getSupportMode,
  setLabelDefaults,
  setSupportMode as setSupportModeStore,
  subscribeLabels,
} from "./labelStore";

type LabelContextValue = {
  ready: boolean;
  getLabel: (key: string, fallback: string) => string;
  supportMode: boolean;
  setSupportMode: (on: boolean) => void;
  refresh: () => Promise<void>;
};

const LabelContext = createContext<LabelContextValue | null>(null);

export function LabelProvider({ children }: { children: ReactNode }) {
  const { user, sessionReady } = useAuth();
  const [ready, setReady] = useState(false);
  const [supportMode, setSupportModeState] = useState(getSupportMode);
  const [, bump] = useState(0);

  useEffect(() => subscribeLabels(() => {
    setSupportModeState(getSupportMode());
    bump((n) => n + 1);
  }), []);

  const refresh = useCallback(async () => {
    if (!user) {
      setReady(true);
      return;
    }
    try {
      const resolved = await fetchResolvedLabels();
      const defaults = resolved.defaults || resolved.labels;
      setLabelDefaults(defaults);
      applyLabelCache({
        labels: resolved.labels,
        version: resolved.version,
        defaults,
      });
    } catch {
      /* keep local cache / fallbacks */
    } finally {
      setReady(true);
    }
  }, [user]);

  useEffect(() => {
    if (!sessionReady) return;
    void refresh();
  }, [sessionReady, refresh]);

  const setSupportMode = useCallback((on: boolean) => {
    setSupportModeStore(on);
    setSupportModeState(on);
  }, []);

  const value: LabelContextValue = {
    ready,
    getLabel,
    supportMode,
    setSupportMode,
    refresh,
  };

  return <LabelContext.Provider value={value}>{children}</LabelContext.Provider>;
}

export function useLabels(): LabelContextValue {
  const ctx = useContext(LabelContext);
  if (!ctx) {
    return {
      ready: true,
      getLabel,
      supportMode: getSupportMode(),
      setSupportMode: setSupportModeStore,
      refresh: async () => undefined,
    };
  }
  return ctx;
}
