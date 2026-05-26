import {
  DEFAULT_PANEL_STATUS_HEX,
  hexForColorInput,
  isValidPanelStatusHex,
} from "../../utils/panelStatusColor";

type Props = {
  value: string;
  onChange: (hex: string) => void;
  id?: string;
  className?: string;
  /** Kompaktowy układ (ustawienia statusów). */
  compact?: boolean;
};

/** Native color picker + #RRGGBB text field for panel UI statuses. */
export function HexColorField({ value, onChange, id, className, compact }: Props) {
  const pickerValue = hexForColorInput(value);
  if (compact) {
    return (
      <div className={className ?? "inline-flex items-center gap-1.5"}>
        <input
          type="color"
          id={id}
          value={pickerValue}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className="h-7 w-7 shrink-0 cursor-pointer rounded border border-slate-200 bg-white p-0"
          title="Wybierz kolor"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            if (!isValidPanelStatusHex(value)) onChange(pickerValue);
          }}
          spellCheck={false}
          className="h-7 w-[5.5rem] rounded border border-slate-200 px-1.5 font-mono text-[11px] text-slate-800"
          placeholder="#RRGGBB"
          aria-label="Kolor HEX"
        />
      </div>
    );
  }
  return (
    <div className={className ?? "flex flex-wrap items-center gap-2"}>
      <input
        type="color"
        id={id}
        value={pickerValue}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
        className="h-9 w-12 cursor-pointer rounded border border-gray-200 bg-white p-0.5"
        title="Wybierz kolor"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (!isValidPanelStatusHex(value)) onChange(pickerValue);
        }}
        spellCheck={false}
        className="w-28 rounded border border-gray-200 px-2 py-1.5 font-mono text-xs"
        placeholder="#RRGGBB"
        aria-label="Kolor HEX"
      />
    </div>
  );
}

export { DEFAULT_PANEL_STATUS_HEX, isValidPanelStatusHex };
