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
  size?: "hero" | "default";
};

/** Unified scan + search field — mockup-aligned terminal styling. */
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
  size = "default",
}: Props) {
  const isHero = size === "hero";
  const inputClass = isHero ? WMS_INV.scanHero : WMS_INV.scanDefault;
  const iconClass = isHero ? WMS_INV.scanIconHero : WMS_INV.scanIconDefault;

  return (
    <form
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="relative">
        <ScanLine className={iconClass} strokeWidth={2.25} />
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
          className={inputClass}
        />
        {dropdown}
      </div>
    </form>
  );
}
