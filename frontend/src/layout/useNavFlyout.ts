import { useCallback, useEffect, useRef, useState } from "react";

/** Delay before hiding fly-out when pointer leaves trigger + panel (reduces flicker). */
export const NAV_FLYOUT_CLOSE_MS = 220;

export function useNavFlyout() {
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | null>(null);
  const [anchorTop, setAnchorTop] = useState(0);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setHoveredCategoryId(null);
      closeTimerRef.current = null;
    }, NAV_FLYOUT_CLOSE_MS);
  }, [cancelClose]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  const onTriggerEnter = useCallback(
    (id: string, triggerEl: HTMLElement) => {
      cancelClose();
      setHoveredCategoryId(id);
      setAnchorTop(triggerEl.getBoundingClientRect().top);
    },
    [cancelClose],
  );

  const onPanelEnter = useCallback(() => {
    cancelClose();
  }, [cancelClose]);

  return {
    hoveredCategoryId,
    anchorTop,
    onTriggerEnter,
    onTriggerLeave: scheduleClose,
    onPanelEnter,
    onPanelLeave: scheduleClose,
  };
}
