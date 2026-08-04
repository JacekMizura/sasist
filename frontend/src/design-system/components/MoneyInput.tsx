import { useEffect, useState, type FocusEventHandler, type InputHTMLAttributes } from "react";

import { Input, type FieldDensity, type FieldFocusTone } from "./Input";
import { colors } from "../tokens";
import { DENSITY_DEFAULT } from "../tokens/density";

export type MoneyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "inputMode"
> & {
  /** Numeric value; empty string / null / undefined = blank field. */
  value: number | "" | null | undefined;
  onValueChange: (next: number | "") => void;
  /** Suffix shown inside the field (default zł). Use "" to hide. */
  currency?: string;
  density?: FieldDensity | "rail";
  focusTone?: FieldFocusTone;
};

function toDisplay(value: number | "" | null | undefined): string {
  if (value === "" || value == null) return "";
  return String(value);
}

function parseMoney(raw: string): number | "" | null {
  const s = raw.trim().replace(",", ".");
  if (s === "" || s === "." || s === "-") return "";
  if (!/^-?\d*\.?\d*$/.test(s)) return null;
  if (s.endsWith(".")) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Currency amount field — Design System Input with trailing currency unit.
 * Keeps a draft while typing incomplete decimals; commits on blur / complete number.
 */
export function MoneyInput({
  value,
  onValueChange,
  currency = "zł",
  density = DENSITY_DEFAULT,
  focusTone = "neutral",
  className = "",
  disabled,
  onBlur,
  onFocus,
  ...props
}: MoneyInputProps) {
  const [draft, setDraft] = useState(() => toDisplay(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(toDisplay(value));
  }, [value, focused]);

  const hasSuffix = Boolean(currency?.trim());

  const commit = (raw: string) => {
    const parsed = parseMoney(raw);
    if (parsed === null) {
      setDraft(toDisplay(value));
      return;
    }
    onValueChange(parsed);
    setDraft(toDisplay(parsed));
  };

  const handleFocus: FocusEventHandler<HTMLInputElement> = (e) => {
    setFocused(true);
    onFocus?.(e);
  };

  const handleBlur: FocusEventHandler<HTMLInputElement> = (e) => {
    setFocused(false);
    commit(draft);
    onBlur?.(e);
  };

  return (
    <div className={`relative ${className.includes("w-") ? className : `w-full ${className}`.trim()}`.trim()}>
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        density={density}
        focusTone={focusTone}
        disabled={disabled}
        value={draft}
        className={hasSuffix ? "pr-10 tabular-nums" : "tabular-nums"}
        onFocus={handleFocus}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const parsed = parseMoney(raw);
          if (parsed !== null) onValueChange(parsed);
        }}
        onBlur={handleBlur}
      />
      {hasSuffix ? (
        <span
          className={`pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-sm ${colors.text.muted}`}
          aria-hidden
        >
          {currency}
        </span>
      ) : null}
    </div>
  );
}
