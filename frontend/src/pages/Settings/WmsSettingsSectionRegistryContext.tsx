import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";
import {
  WMS_SETTINGS_ACTIVATION_TOLERANCE_PX,
  WMS_SETTINGS_STICKY_LINE_PX,
} from "./wmsSettingsSectionConstants";
import { findVerticalScrollContainer } from "./wmsSettingsSectionDom";

type RegistryCtx = {
  orderedSections: WmsSettingsSectionConfig[];
  setAnchorElement: (id: string, element: HTMLElement | null) => void;
  activeSectionId: string | null;
  scrollToSection: (id: string) => void;
  observe: boolean;
};

const WmsSettingsSectionRegistryContext = createContext<RegistryCtx | null>(null);

export function WmsSettingsSectionRegistryProvider({
  orderedSections,
  observe = true,
  observeRevision,
  children,
}: {
  orderedSections: WmsSettingsSectionConfig[];
  observe?: boolean;
  observeRevision?: unknown;
  children: ReactNode;
}) {
  const anchorsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [activeSectionId, setActiveSectionId] = useState<string | null>(() => orderedSections[0]?.id ?? null);
  const [registrationTick, bumpRegistrations] = useReducer((n: number) => n + 1, 0);

  const setAnchorElement = useCallback((id: string, element: HTMLElement | null) => {
    const prev = anchorsRef.current.get(id);
    if (element) anchorsRef.current.set(id, element);
    else anchorsRef.current.delete(id);
    if (prev !== element) bumpRegistrations();
  }, []);

  const computeActive = useCallback(() => {
    const STICKY = WMS_SETTINGS_STICKY_LINE_PX;
    const tol = WMS_SETTINGS_ACTIVATION_TOLERANCE_PX;

    const firstEl = orderedSections.map((s) => anchorsRef.current.get(s.id)).find(Boolean) as HTMLElement | undefined;
    const scrollRoot = firstEl ? findVerticalScrollContainer(firstEl) : null;

    const scored: Array<{ id: string; relTop: number }> = [];
    for (const { id } of orderedSections) {
      const el = anchorsRef.current.get(id);
      if (!el) continue;
      const relTop = scrollRoot
        ? el.getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top
        : el.getBoundingClientRect().top;
      scored.push({ id, relTop });
    }

    if (scored.length === 0) return;

    const crossed = scored.filter((s) => s.relTop <= STICKY + tol);
    if (crossed.length > 0) {
      crossed.sort((a, b) => b.relTop - a.relTop);
      setActiveSectionId(crossed[0].id);
      return;
    }

    scored.sort((a, b) => a.relTop - b.relTop);
    setActiveSectionId(scored[0].id);
  }, [orderedSections]);

  const scrollToSection = useCallback((id: string) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = anchorsRef.current.get(id);
        if (!el) return;

        const scrollContainer = findVerticalScrollContainer(el);
        const STICKY = WMS_SETTINGS_STICKY_LINE_PX;

        if (!scrollContainer) {
          const delta = el.getBoundingClientRect().top - STICKY;
          window.scrollBy({ top: delta, behavior: "smooth" });
          setActiveSectionId(id);
          return;
        }

        const containerRect = scrollContainer.getBoundingClientRect();
        const targetRect = el.getBoundingClientRect();
        const nextScrollTop =
          scrollContainer.scrollTop + (targetRect.top - containerRect.top) - STICKY;

        const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
        const clamped = Math.min(Math.max(0, nextScrollTop), maxScroll);

        scrollContainer.scrollTo({ top: clamped, behavior: "smooth" });
        setActiveSectionId(id);
      });
    });
  }, []);

  useEffect(() => {
    if (!observe) {
      setActiveSectionId(null);
      return;
    }

    let cancelled = false;
    let retryRaf = 0;
    let observer: IntersectionObserver | null = null;
    let detach: (() => void) | undefined;

    const attach = () => {
      const els = orderedSections
        .map((s) => ({ id: s.id, el: anchorsRef.current.get(s.id) }))
        .filter((x): x is { id: string; el: HTMLElement } => Boolean(x.el));

      if (els.length === 0) {
        retryRaf = requestAnimationFrame(() => {
          if (!cancelled) attach();
        });
        return;
      }

      const scrollRoot = findVerticalScrollContainer(els[0].el);

      const refresh = () => {
        if (!cancelled) computeActive();
      };

      // IntersectionObserver drives highlight as sections enter/leave the sticky band.
      observer = new IntersectionObserver(refresh, {
        root: scrollRoot,
        rootMargin: `-${WMS_SETTINGS_STICKY_LINE_PX}px 0px -45% 0px`,
        threshold: [0, 0.05, 0.1, 0.25, 0.5, 0.75, 1],
      });
      for (const { el } of els) observer.observe(el);

      // Scroll keeps the active item correct inside tall sections (IO alone can go quiet mid-section).
      const opts = { passive: true } as const;
      if (scrollRoot) scrollRoot.addEventListener("scroll", refresh, opts);
      else window.addEventListener("scroll", refresh, opts);
      window.addEventListener("resize", refresh);

      detach = () => {
        if (scrollRoot) scrollRoot.removeEventListener("scroll", refresh);
        else window.removeEventListener("scroll", refresh);
        window.removeEventListener("resize", refresh);
      };

      refresh();
    };

    attach();

    return () => {
      cancelled = true;
      cancelAnimationFrame(retryRaf);
      observer?.disconnect();
      detach?.();
    };
  }, [observe, observeRevision, orderedSections, computeActive, registrationTick]);

  const value = useMemo<RegistryCtx>(
    () => ({
      orderedSections,
      setAnchorElement,
      activeSectionId,
      scrollToSection,
      observe,
    }),
    [orderedSections, setAnchorElement, activeSectionId, scrollToSection, observe],
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

export function useWmsSettingsSectionAnchor(sectionId: string): (node: HTMLElement | null) => void {
  const { setAnchorElement } = useWmsSettingsSectionRegistry();
  return useCallback((node: HTMLElement | null) => setAnchorElement(sectionId, node), [sectionId, setAnchorElement]);
}
