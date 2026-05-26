import type { ReactNode } from "react";
import { getAutocompleteDropdownPanelClass } from "../../hooks/useAutocompleteDropdown";

type AutocompleteDropdownPanelProps = {
  /** Panel is in the DOM (query/context allows suggestions). */
  mounted: boolean;
  /** Panel is interactable and fully visible. */
  visible: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
};

/** Animated wrapper for WMS autocomplete suggestion lists. */
export function AutocompleteDropdownPanel({
  mounted,
  visible,
  children,
  className,
  id,
}: AutocompleteDropdownPanelProps) {
  if (!mounted) return null;
  return (
    <div
      id={id}
      className={getAutocompleteDropdownPanelClass(visible, className)}
      aria-hidden={!visible}
    >
      {children}
    </div>
  );
}
