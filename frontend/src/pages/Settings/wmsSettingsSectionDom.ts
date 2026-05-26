/**
 * Locate the scroll column that owns `scrollTop` for WMS settings (must match registry scroll math).
 */
export function findVerticalScrollContainer(start: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = start;
  for (let d = 0; d < 64 && node; d++) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return node;
    }
    node = node.parentElement;
  }
  const main = start?.closest("main");
  const parent = main?.parentElement;
  if (parent) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return parent;
    }
  }
  return null;
}
