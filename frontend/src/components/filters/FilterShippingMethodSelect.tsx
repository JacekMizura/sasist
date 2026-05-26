import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { ShippingMethodDto } from "../../api/shippingMethodsApi";
import { ShippingMethodLogo } from "../shipping/ShippingMethodLogo";

import { filterControlHeightClass } from "./filterUiTokens";

type FilterShippingMethodSelectProps = {
  value: string;
  onChange: (methodId: string) => void;
  methods: ShippingMethodDto[];
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
};

export function FilterShippingMethodSelect({
  value,
  onChange,
  methods,
  emptyLabel = "Wszystkie",
  className = "",
  disabled,
}: FilterShippingMethodSelectProps) {
  const reactId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const selected = methods.find((m) => m.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || !(e.target instanceof Node) || el.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`.trim()}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex ${filterControlHeightClass} w-full min-w-0 items-center justify-between gap-2 rounded-md border border-slate-200/90 bg-white px-2.5 text-left text-[13px] font-medium text-slate-900 shadow-none transition hover:border-slate-300 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400/35 disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selected ? (
            <>
              <ShippingMethodLogo logoUrl={selected.logo_url} methodName={selected.name} size="xs" />
              <span className="min-w-0 truncate">{selected.name}</span>
            </>
          ) : (
            <span className="truncate text-slate-600">{emptyLabel}</span>
          )}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-md border border-slate-200/90 bg-white py-1 shadow-md"
          role="listbox"
          id={`fss-list-${reactId}`}
        >
          <button
            type="button"
            role="option"
            aria-selected={value === ""}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase text-slate-500">
              —
            </span>
            <span>{emptyLabel}</span>
          </button>
          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={value === m.id}
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-slate-800 hover:bg-slate-50"
            >
              <ShippingMethodLogo logoUrl={m.logo_url} methodName={m.name} size="xs" />
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
