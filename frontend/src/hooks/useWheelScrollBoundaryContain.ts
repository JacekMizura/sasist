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
      const ch = el.clientHeight;
      const sh = el.scrollHeight;
      // No overflow (or zero-sized flex child): do not intercept — otherwise every wheel gets
      // preventDefault (atTop && atBottom) and nested sidebars / lists stop scrolling (e.g. row draw mode).
      if (ch < 1 || sh <= ch + 1) return;
      const isUp = e.deltaY < 0;
      const isDown = e.deltaY > 0;
      const st = el.scrollTop;
      const atTop = st <= 0;
      const maxScroll = Math.max(0, sh - ch);
      const atBottom = st >= maxScroll - 1;
      if ((isUp && atTop) || (isDown && atBottom)) {
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [enabled, resubscribeKey]);
}
