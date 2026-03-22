import { useLayoutEffect, type RefObject } from "react";

/**
 * Prevents wheel scroll chaining to the page when the element is at scroll top/bottom.
 * Uses a non-passive listener so preventDefault works.
 *
 * `resubscribeKey` — bump when the DOM node under `ref` may mount after `enabled` became true
 * (e.g. conditional side panels) so the listener is attached after the ref is set.
 */
export function useWheelScrollBoundaryContain(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  resubscribeKey: string | number = 0
): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const isUp = e.deltaY < 0;
      const isDown = e.deltaY > 0;
      const atTop = el.scrollTop === 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight;
      if ((isUp && atTop) || (isDown && atBottom)) {
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [enabled, resubscribeKey]);
}
