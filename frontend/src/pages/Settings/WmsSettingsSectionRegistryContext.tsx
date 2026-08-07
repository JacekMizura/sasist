import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";

import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";

/** Query key for deep-linking a WMS settings subsection (`?tab=packing&section=wms-pack-appearance`). */
export const WMS_SETTINGS_SECTION_QUERY = "section";

type RegistryCtx = {
  orderedSections: WmsSettingsSectionConfig[];
  /** When true, left nav switches content (only active section mounts). */
  observe: boolean;
  activeSectionId: string | null;
  /** Switch the active subsection (updates URL `section` query). */
  selectSection: (id: string) => void;
  /**
   * @deprecated Use {@link selectSection}. Kept for older call sites.
   */
  scrollToSection: (id: string) => void;
  /** @deprecated No-op — anchors are unused in switcher mode. */
  setAnchorElement: (id: string, element: HTMLElement | null) => void;
};

const WmsSettingsSectionRegistryContext = createContext<RegistryCtx | null>(null);

function resolveSectionId(orderedIds: string[], candidate: string | null | undefined): string | null {
  if (orderedIds.length === 0) return null;
  if (candidate && orderedIds.includes(candidate)) return candidate;
  return orderedIds[0] ?? null;
}

export function WmsSettingsSectionRegistryProvider({
  orderedSections,
  observe = true,
  observeRevision: _observeRevision,
  children,
}: {
  orderedSections: WmsSettingsSectionConfig[];
  observe?: boolean;
  /** @deprecated Unused — retained for call-site compatibility. */
  observeRevision?: unknown;
  children: ReactNode;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const orderedIds = useMemo(() => orderedSections.map((s) => s.id), [orderedSections]);

  const urlSection = searchParams.get(WMS_SETTINGS_SECTION_QUERY);
  const resolvedFromUrl = resolveSectionId(orderedIds, urlSection);

  const [activeSectionId, setActiveSectionId] = useState<string | null>(() =>
    observe ? resolvedFromUrl : null,
  );

  useEffect(() => {
    if (!observe) {
      setActiveSectionId(null);
      return;
    }
    setActiveSectionId(resolveSectionId(orderedIds, searchParams.get(WMS_SETTINGS_SECTION_QUERY)));
  }, [observe, orderedIds, searchParams]);

  const selectSection = useCallback(
    (id: string) => {
      if (!observe) return;
      if (!orderedIds.includes(id)) return;
      setActiveSectionId(id);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(WMS_SETTINGS_SECTION_QUERY, id);
          return next;
        },
        { replace: true },
      );
    },
    [observe, orderedIds, setSearchParams],
  );

  /** If search filters the nav list, keep active id inside the visible set. */
  useEffect(() => {
    if (!observe) return;
    if (orderedIds.length === 0) return;
    if (activeSectionId != null && orderedIds.includes(activeSectionId)) return;
    const fallback = orderedIds[0];
    if (!fallback) return;
    selectSection(fallback);
  }, [observe, orderedIds, activeSectionId, selectSection]);

  const setAnchorElement = useCallback((_id: string, _element: HTMLElement | null) => {
    /* no-op: switcher mode does not register scroll anchors */
  }, []);

  const value = useMemo<RegistryCtx>(
    () => ({
      orderedSections,
      observe,
      activeSectionId: observe ? activeSectionId : null,
      selectSection,
      scrollToSection: selectSection,
      setAnchorElement,
    }),
    [orderedSections, observe, activeSectionId, selectSection, setAnchorElement],
  );

  return (
    <WmsSettingsSectionRegistryContext.Provider value={value}>{children}</WmsSettingsSectionRegistryContext.Provider>
  );
}

export function useWmsSettingsSectionRegistry(): RegistryCtx {
  const ctx = useContext(WmsSettingsSectionRegistryContext);
  if (!ctx) {
    throw new Error("useWmsSettingsSectionRegistry must be used within WmsSettingsSectionRegistryProvider");
  }
  return ctx;
}

/**
 * Whether this section should mount. Outside the registry (or when switcher is off) → always true.
 * With switcher on → only the active left-nav section.
 */
export function useWmsSettingsSectionVisible(sectionId: string): boolean {
  const ctx = useContext(WmsSettingsSectionRegistryContext);
  if (!ctx || !ctx.observe) return true;
  return ctx.activeSectionId === sectionId;
}

/** @deprecated Anchors unused in switcher mode — returns a no-op ref callback. */
export function useWmsSettingsSectionAnchor(sectionId: string): (node: HTMLElement | null) => void {
  const ctx = useContext(WmsSettingsSectionRegistryContext);
  const setAnchorElement = ctx?.setAnchorElement;
  return useCallback(
    (node: HTMLElement | null) => {
      setAnchorElement?.(sectionId, node);
    },
    [sectionId, setAnchorElement],
  );
}
