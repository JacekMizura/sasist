import { useRef, useState } from "react";
import { ColorPickerPopover } from "./ColorPickerPopover";

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

export type CompactLabelColorPickerProps = {
  value: string;
  onChange: (hex: string) => void;
  fallback?: string;
  className?: string;
  /** Krótszy opis dla czytników ekranu */
  label: string;
};

/**
 * Ten sam silnik co w module etykiet (ColorPickerPopover / react-colorful),
 * w kompaktowej formie: próbka + HEX + wybór z palety.
 */
export function CompactLabelColorPicker({ value, onChange, fallback = "#64748b", className, label }: CompactLabelColorPickerProps) {
  const eff = normalizeHex6(value, fallback);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mountKey, setMountKey] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);

  const openPopover = () => {
    const el = btnRef.current;
    if (!el) return;
    setRect(el.getBoundingClientRect());
    setMountKey((k) => k + 1);
    setOpen(true);
  };

  return (
    <div className={className ?? "inline-flex items-center gap-2"}>
      <button
        type="button"
        ref={btnRef}
        title={label}
        aria-label={label}
        onClick={openPopover}
        className="h-8 w-8 shrink-0 rounded-lg border border-slate-300/90 shadow-sm ring-offset-2 ring-offset-white transition hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        style={{ backgroundColor: eff }}
      />
      <span className="min-w-[4.5rem] font-mono text-[11px] font-medium text-slate-700">{eff.toUpperCase()}</span>
      {open && rect ? (
        <ColorPickerPopover
          key={mountKey}
          anchorRect={rect}
          initialColor={eff}
          fallback={fallback}
          onClose={() => setOpen(false)}
          onApply={(hex) => {
            onChange(hex);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
