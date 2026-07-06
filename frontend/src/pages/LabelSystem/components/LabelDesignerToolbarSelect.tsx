import { useState } from "react";
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
  useTypeahead,
} from "@floating-ui/react";
import { Check, ChevronDown } from "lucide-react";
import { labelDesignerToolbarInputClass } from "../labelDesignerToolbarTokens";

export type LabelDesignerToolbarSelectOption<T extends string = string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  options: LabelDesignerToolbarSelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  minWidthClass?: string;
};

export function LabelDesignerToolbarSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  minWidthClass = "min-w-[8.5rem]",
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const selected = options.find((o) => o.value === value) ?? options[0];

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-start",
    strategy: "fixed",
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
  });

  const listRef = useListNavigation(context, {
    listRef: refs.setFloating,
    activeIndex,
    selectedIndex: options.findIndex((o) => o.value === value),
    onNavigate: setActiveIndex,
    loop: true,
  });

  const typeaheadRef = useTypeahead(context, {
    listRef: refs.setFloating,
    activeIndex,
    selectedIndex: options.findIndex((o) => o.value === value),
    onMatch: setActiveIndex,
  });

  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "listbox" });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    dismiss,
    role,
    listRef,
    typeaheadRef,
  ]);

  return (
    <>
      <button
        type="button"
        ref={refs.setReference}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${labelDesignerToolbarInputClass} ${minWidthClass} inline-flex items-center justify-between gap-2 pr-2 text-left ${className}`}
        {...getReferenceProps()}
      >
        <span className="truncate">{selected?.label ?? "—"}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
      </button>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[8000] max-h-64 min-w-[var(--floating-anchor-width)] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-900/5"
            {...getFloatingProps()}
          >
            {options.map((opt, index) => {
              const isSelected = opt.value === value;
              const isActive = activeIndex === index;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 ${
                    isActive ? "bg-slate-100 text-slate-900" : "text-slate-700 hover:bg-slate-50"
                  }`}
                  {...getItemProps({
                    onClick() {
                      onChange(opt.value);
                      setOpen(false);
                    },
                  })}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected ? <Check className="h-4 w-4 shrink-0 text-slate-600" strokeWidth={2} aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
