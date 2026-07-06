import { useCallback, useEffect, useState } from "react";

export type EditorRightTab =
  | "html"
  | "pdf"
  | "errors"
  | "compare"
  | "usage"
  | "impact"
  | "dependencies"
  | "history";

const RIGHT_TAB_KEY = "dte-editor-right-tab";
const LEFT_OPEN_KEY = "dte-editor-left-open";
const RIGHT_OPEN_KEY = "dte-editor-right-open";
const RIGHT_DETACHED_KEY = "dte-editor-right-detached";
const MINIMAP_KEY = "dte-editor-minimap";

const VALID_TABS = new Set<string>([
  "html",
  "pdf",
  "errors",
  "compare",
  "usage",
  "impact",
  "dependencies",
  "history",
]);

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    /* ignore */
  }
  return fallback;
}

function readTab(fallback: EditorRightTab): EditorRightTab {
  try {
    const raw = localStorage.getItem(RIGHT_TAB_KEY);
    if (raw && VALID_TABS.has(raw)) return raw as EditorRightTab;
  } catch {
    /* ignore */
  }
  return fallback;
}

function defaultRightOpen(): boolean {
  return true;
}

export function useEditorLayoutState() {
  const [leftOpen, setLeftOpen] = useState(() => readBool(LEFT_OPEN_KEY, true));
  const [rightOpen, setRightOpen] = useState(defaultRightOpen);
  const [rightDetached, setRightDetached] = useState(() => readBool(RIGHT_DETACHED_KEY, false));
  const [minimapEnabled, setMinimapEnabled] = useState(() => readBool(MINIMAP_KEY, false));
  const [fullscreen, setFullscreen] = useState(false);
  const [rightTab, setRightTab] = useState<EditorRightTab>(() => readTab("html"));
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(LEFT_OPEN_KEY, leftOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [leftOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(RIGHT_OPEN_KEY, rightOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [rightOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(RIGHT_DETACHED_KEY, rightDetached ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [rightDetached]);

  useEffect(() => {
    try {
      localStorage.setItem(MINIMAP_KEY, minimapEnabled ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [minimapEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(RIGHT_TAB_KEY, rightTab);
    } catch {
      /* ignore */
    }
  }, [rightTab]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const openRightTab = useCallback((tab: EditorRightTab) => {
    setRightTab(tab);
    setRightOpen(true);
  }, []);

  const enterFullscreen = useCallback(() => {
    setFullscreen(true);
    setLeftOpen(false);
    setRightOpen(false);
  }, []);

  const detachRight = useCallback(() => {
    setRightDetached(true);
    setRightOpen(true);
  }, []);

  const dockRight = useCallback(() => {
    setRightDetached(false);
    setRightOpen(true);
  }, []);

  const toggleMinimap = useCallback(() => setMinimapEnabled((v) => !v), []);

  return {
    leftOpen,
    setLeftOpen,
    rightOpen,
    setRightOpen,
    rightDetached,
    setRightDetached,
    detachRight,
    dockRight,
    minimapEnabled,
    toggleMinimap,
    fullscreen,
    setFullscreen,
    enterFullscreen,
    rightTab,
    setRightTab,
    openRightTab,
    detailsOpen,
    setDetailsOpen,
  };
}
