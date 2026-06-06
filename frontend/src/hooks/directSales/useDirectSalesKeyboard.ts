import { useEffect } from "react";

type Args = {
  enabled: boolean;
  onCash: () => void;
  onCard: () => void;
  onBlik: () => void;
  onComplete: () => void;
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
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
