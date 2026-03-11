/**
 * Layout mode: display helpers and keyboard shortcuts.
 * Parent holds mode state; this hook returns cursor/label/color and registers shortcuts.
 */
import { useEffect, useMemo } from "react";
import { LayoutMode, LAYOUT_MODE_LABELS, LAYOUT_MODE_COLORS } from "./LayoutMode";

export type LayoutModeState = {
  mode: LayoutMode;
  setMode: (mode: LayoutMode | ((prev: LayoutMode) => LayoutMode)) => void;
};

export type LayoutModeDisplay = {
  cursorStyle: string;
  modeLabel: string;
  modeColor: string;
};

export function useLayoutModeShortcuts(
  _mode: LayoutMode,
  setMode: (mode: LayoutMode | ((prev: LayoutMode) => LayoutMode)) => void
): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase();
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      switch (key) {
        case "S":
          e.preventDefault();
          setMode(LayoutMode.SELECT);
          break;
        case "R":
          e.preventDefault();
          setMode(LayoutMode.DRAW_ROW);
          break;
        case "A":
          e.preventDefault();
          setMode(LayoutMode.DRAW_AISLE);
          break;
        case "P":
          e.preventDefault();
          setMode(LayoutMode.PATH_TOOL);
          break;
        case "1":
          e.preventDefault();
          setMode(LayoutMode.ADD_START);
          break;
        case "2":
          e.preventDefault();
          setMode(LayoutMode.ADD_PACK);
          break;
        case "3":
          e.preventDefault();
          setMode(LayoutMode.ADD_DOCK);
          break;
        case "E":
          e.preventDefault();
          setMode(LayoutMode.EDIT);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setMode]);
}

export function useLayoutModeDisplay(mode: LayoutMode): LayoutModeDisplay {
  return useMemo(
    () => ({
      cursorStyle:
        mode === LayoutMode.DRAW_ROW ||
        mode === LayoutMode.DRAW_AISLE ||
        mode === LayoutMode.PATH_TOOL ||
        mode === LayoutMode.ADD_START ||
        mode === LayoutMode.ADD_PACK ||
        mode === LayoutMode.ADD_DOCK
          ? "crosshair"
          : "default",
      modeLabel: LAYOUT_MODE_LABELS[mode].toUpperCase().replace(/\s+/g, " "),
      modeColor: LAYOUT_MODE_COLORS[mode],
    }),
    [mode]
  );
}
