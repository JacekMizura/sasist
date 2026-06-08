import { ScanLine } from "lucide-react";

import { WMS_INV } from "./theme";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  dropdown?: React.ReactNode;
  "aria-expanded"?: boolean;
};

/** Unified scan + search field — same shell as MM operational inputs, compact. */
export default function WmsInventoryScanField({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  placeholder,
  disabled,
  inputRef,
  dropdown,
  "aria-expanded": ariaExpanded,
}: Props) {
  return (
    <form
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="relative group">
        <ScanLine
          className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 group-focus-within:text-[#5a4fcf]"
          strokeWidth={2.25}
        />
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          inputMode="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={placeholder}
          aria-expanded={ariaExpanded}
          className={WMS_INV.inputOperational}
        />
        {dropdown}
      </div>
    </form>
  );
}
