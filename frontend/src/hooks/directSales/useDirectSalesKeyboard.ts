import { useEffect } from "react";

type Args = {
  enabled: boolean;
  onCash: () => void;
  onCard: () => void;
  onBlik: () => void;
  onComplete: () => void;
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (el == null || typeof HTMLElement === "undefined" || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function handleDirectSalesKeyDown(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "target">,
  handlers: Pick<Args, "onCash" | "onCard" | "onBlik" | "onComplete">,
): void {
  if (isTypingTarget(e.target)) return;
  if (e.key === "F1") {
    handlers.onCash();
  } else if (e.key === "F2") {
    handlers.onCard();
  } else if (e.key === "F3") {
    handlers.onBlik();
  } else if (e.key === "Enter" && e.ctrlKey) {
    handlers.onComplete();
  }
}

export function useDirectSalesKeyboard({ enabled, onCash, onCard, onBlik, onComplete }: Args) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "F1") {
        e.preventDefault();
        onCash();
      } else if (e.key === "F2") {
        e.preventDefault();
        onCard();
      } else if (e.key === "F3") {
        e.preventDefault();
        onBlik();
      } else if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        onComplete();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onCash, onCard, onBlik, onComplete]);
}
