import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HexColorPicker } from "react-colorful";

const POPOVER_W = 260;
const GAP = 8;

/** Init / display only — not used when committing apply. */
function normalizeHex6(raw: string | undefined, fallback: string): string {
  let h = (raw ?? "").trim();
  if (!h) return fallback;
  if (!h.startsWith("#")) h = `#${h}`;
  if (h.length === 4 && /^#[0-9a-f]{3}$/i.test(h)) {
    h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  if (/^#[0-9a-f]{6}$/i.test(h)) return h.toLowerCase();
  return fallback;
}

function isHex6(s: string): boolean {
  return /^#[0-9a-f]{6}$/i.test((s ?? "").trim());
}

function strictHexFromInput(raw: string, pickerFallback: string): string | null {
  const n = normalizeHex6(raw, "");
  if (/^#[0-9a-f]{6}$/.test(n)) return n;
  return isHex6(pickerFallback) ? pickerFallback.toLowerCase() : null;
}

export type ColorPickerPopoverProps = {
  anchorRect: DOMRect;
  initialColor: string;
  fallback: string;
  onClose: () => void;
  onApply: (hex: string) => void;
};

/**
 * Floating color editor. `initialColor` + `fallback` seed state once on mount only (parent uses `key`).
 * Apply uses live `selectedColor` from the wheel, not stale props.
 */
export function ColorPickerPopover({
  anchorRect,
  initialColor,
  fallback,
  onClose,
  onApply,
}: ColorPickerPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const seed = normalizeHex6(initialColor, fallback);
  const [selectedColor, setSelectedColor] = useState(seed);
  const [hexInput, setHexInput] = useState(seed);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [onClose]);

  let top = anchorRect.bottom + GAP;
  let left = anchorRect.left;
  if (left + POPOVER_W > window.innerWidth - 8) {
    left = window.innerWidth - POPOVER_W - 8;
  }
  left = Math.max(8, left);
  const estH = 320;
  if (top + estH > window.innerHeight - 8) {
    top = Math.max(8, anchorRect.top - estH - GAP);
  }

  const handleApply = () => {
    let hex: string | null = null;
    if (isHex6(selectedColor)) {
      hex = selectedColor.trim().toLowerCase();
    } else {
      hex = strictHexFromInput(hexInput, selectedColor);
    }
    if (!hex) {
      console.warn("ColorPickerPopover: apply skipped — no valid #rrggbb");
      return;
    }
    console.log("APPLY COLOR:", hex);
    onApply(hex);
    onClose();
  };

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Wybór koloru"
      className="rounded-xl border border-slate-200/90 bg-white p-2 shadow-lg shadow-slate-900/15"
      style={{
        position: "fixed",
        top,
        left,
        width: POPOVER_W,
        zIndex: 50000,
        boxSizing: "border-box",
      }}
    >
      <div className="mb-2 w-full overflow-hidden rounded-lg [&_.react-colorful]:w-full">
        <HexColorPicker
          color={selectedColor}
          onChange={(c) => {
            setSelectedColor(c);
            setHexInput(c);
          }}
        />
      </div>
      <input
        type="text"
        value={hexInput}
        onChange={(e) => {
          const v = e.target.value;
          setHexInput(v);
          const p = normalizeHex6(v, selectedColor);
          if (/^#[0-9a-f]{6}$/i.test(p)) {
            setSelectedColor(p);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleApply();
          }
        }}
        placeholder="#rrggbb"
        spellCheck={false}
        className="mb-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-mono text-slate-800"
        aria-label="Kolor HEX"
      />
      <button
        type="button"
        onClick={handleApply}
        className="w-full rounded-lg bg-slate-800 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        Zastosuj
      </button>
    </div>,
    document.body
  );
}
