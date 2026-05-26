import { playScanBeep } from "../../../utils/playScanBeep";
import type { ScanFeedbackKind } from "../../../context/WarehouseExecutionContext";

export function playScanFeedbackSound(kind: ScanFeedbackKind) {
  if (kind === "success") {
    playScanBeep();
    return;
  }
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    const freq = kind === "error" ? 220 : kind === "conflict" ? 330 : 440;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    o.start();
    o.stop(ctx.currentTime + 0.12);
    void ctx.resume?.();
  } catch {
    /* ignore */
  }
}

export function vibrateScanHint(kind: ScanFeedbackKind) {
  if (!("vibrate" in navigator)) return;
  const pattern =
    kind === "success"
      ? [12]
      : kind === "error"
        ? [40, 30, 40]
        : kind === "conflict"
          ? [20, 40, 20]
          : [25];
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

export function scanFeedbackFlashClass(kind: ScanFeedbackKind): string {
  switch (kind) {
    case "success":
      return "bg-emerald-400/35";
    case "error":
      return "bg-red-500/40";
    case "conflict":
      return "bg-amber-400/40";
    case "warning":
      return "bg-orange-400/40";
    default:
      return "";
  }
}
