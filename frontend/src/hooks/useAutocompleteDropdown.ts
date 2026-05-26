import { useCallback, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useOutsideClick } from "./useOutsideClick";

export const AUTOCOMPLETE_DROPDOWN_PANEL_BASE =
  "absolute left-0 right-0 top-full z-50 mt-2 origin-top transition-all duration-200 ease-out";

export function getAutocompleteDropdownPanelClass(visible: boolean, extraClassName = ""): string {
  const state = visible
    ? "pointer-events-auto translate-y-0 opacity-100"
    : "pointer-events-none -translate-y-1 opacity-0";
  return [AUTOCOMPLETE_DROPDOWN_PANEL_BASE, state, extraClassName].filter(Boolean).join(" ");
}

export type UseAutocompleteDropdownOptions = {
  /** Current combobox input value */
  query: string;
  /** Master enable flag (e.g. not disabled) */
  enabled?: boolean;
  /** Additional requirement before the panel may appear */
  canMount?: boolean;
  /** When true (default), empty query never shows the floating panel */
  requireQuery?: boolean;
};

/**
 * Shared open/close state for WMS autocomplete dropdowns.
 * Keeps `query` separate from panel visibility; closes on outside click / Esc.
 */
export function useAutocompleteDropdown({
  query,
  enabled = true,
  canMount = true,
  requireQuery = true,
}: UseAutocompleteDropdownOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [listOpen, setListOpen] = useState(false);

  const hasQuery = query.trim().length > 0;
  const canShowDropdown = enabled && canMount && (!requireQuery || hasQuery);
  const dropdownVisible = listOpen && canShowDropdown;

  const closeList = useCallback(() => setListOpen(false), []);

  const openList = useCallback(() => {
    if (enabled && canMount && (!requireQuery || hasQuery)) {
      setListOpen(true);
    }
  }, [enabled, canMount, requireQuery, hasQuery]);

  useOutsideClick(containerRef, closeList, listOpen);

  const onInputFocus = useCallback(() => {
    if (enabled && canMount && (!requireQuery || hasQuery)) {
      setListOpen(true);
    }
  }, [enabled, canMount, requireQuery, hasQuery]);

  const notifyInputChanged = useCallback((nextValue: string) => {
    if (nextValue.trim().length > 0) setListOpen(true);
  }, []);

  const handleInputEscape = useCallback(
    (e: ReactKeyboardEvent | KeyboardEvent) => {
      if (e.key !== "Escape") return false;
      e.preventDefault();
      e.stopPropagation();
      closeList();
      return true;
    },
    [closeList],
  );

  const preventOptionMouseDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
  }, []);

  return {
    containerRef,
    listOpen,
    setListOpen,
    closeList,
    openList,
    hasQuery,
    canMount: enabled && canMount,
    canShowDropdown,
    dropdownVisible,
    panelClassName: getAutocompleteDropdownPanelClass(dropdownVisible),
    getPanelClassName: (extraClassName?: string) =>
      getAutocompleteDropdownPanelClass(dropdownVisible, extraClassName),
    onInputFocus,
    notifyInputChanged,
    handleInputEscape,
    preventOptionMouseDown,
  };
}
