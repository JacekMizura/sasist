import { useCallback, useEffect, useRef, useState } from "react";

/** Delay before hiding fly-out when pointer leaves trigger + panel (reduces flicker). */
export const NAV_FLYOUT_CLOSE_MS = 220;

export function useNavFlyout() {
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | null>(null);
  const [anchorTop, setAnchorTop] = useState(0);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When opened by click, leave keeps it open until click outside / toggle / leave panel+trigger. */
  const pinnedByClickRef = useRef(false);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    if (pinnedByClickRef.current) return;
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setHoveredCategoryId(null);
      closeTimerRef.current = null;
    }, NAV_FLYOUT_CLOSE_MS);
  }, [cancelClose]);

  const closeNow = useCallback(() => {
    cancelClose();
    pinnedByClickRef.current = false;
    setHoveredCategoryId(null);
  }, [cancelClose]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  useEffect(() => {
    if (!hoveredCategoryId) return;
    const onDoc = (e: MouseEvent) => {
      if (!pinnedByClickRef.current) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-erp-nav-flyout]") || t.closest("[data-erp-nav-trigger]")) return;
      closeNow();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [hoveredCategoryId, closeNow]);

  const onTriggerEnter = useCallback(
    (id: string, triggerEl: HTMLElement) => {
      cancelClose();
      pinnedByClickRef.current = false;
      setHoveredCategoryId(id);
      setAnchorTop(triggerEl.getBoundingClientRect().top);
    },
    [cancelClose],
  );

  const onTriggerClick = useCallback(
    (id: string, triggerEl: HTMLElement) => {
      cancelClose();
      setAnchorTop(triggerEl.getBoundingClientRect().top);
      setHoveredCategoryId((prev) => {
        if (prev === id && pinnedByClickRef.current) {
          pinnedByClickRef.current = false;
          return null;
        }
        pinnedByClickRef.current = true;
        return id;
      });
    },
    [cancelClose],
  );

  const onPanelEnter = useCallback(() => {
    cancelClose();
  }, [cancelClose]);

  const onPanelLeave = useCallback(() => {
    if (pinnedByClickRef.current) {
      // Soft-unpin: next leave schedule after short linger via scheduleClose when pin cleared
      pinnedByClickRef.current = false;
    }
    scheduleClose();
  }, [scheduleClose]);

  return {
    hoveredCategoryId,
    anchorTop,
    onTriggerEnter,
    onTriggerLeave: scheduleClose,
    onTriggerClick,
    onPanelEnter,
    onPanelLeave,
    closeFlyout: closeNow,
  };
}
