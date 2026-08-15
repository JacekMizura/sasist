import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import type { ProductionForecastSettings, ProductionReservationSettings } from "../../../api/wmsProductionSettingsApi";
import { SettingInfoButton } from "../../../pages/Settings/SettingInfoButton";
import { wmsSettingControlSelectClass } from "../../../pages/Settings/wmsSettingsUi";
import {
  ALLOCATION_STRATEGY_OPTIONS,
  FORECAST_STRATEGY_OPTIONS,
  productionSettingsHelp,
  type SettingHelpContent,
} from "./productionSettingsHelp";

type OptionBase = {
  key: string;
  label: string;
  disabled?: boolean;
  help: SettingHelpContent;
};

function HelpfulStrategySelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (key: string) => void;
  options: OptionBase[];
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.key === value) ?? options.find((o) => !o.disabled) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        className={`${wmsSettingControlSelectClass} flex w-full items-center justify-between gap-2 text-left`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0 truncate">{selected?.label ?? "Wybierz…"}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-[40] mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {options.map((opt) => {
            const active = opt.key === value;
            return (
              <li
                key={opt.key}
                role="option"
                aria-selected={active}
                aria-disabled={opt.disabled || undefined}
                className={`flex items-center gap-2 px-2 py-1.5 ${
                  opt.disabled ? "cursor-not-allowed opacity-55" : "hover:bg-slate-50"
                } ${active ? "bg-orange-50/70" : ""}`}
              >
                <button
                  type="button"
                  disabled={opt.disabled}
                  className="min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-left text-sm text-slate-900 disabled:cursor-not-allowed"
                  onClick={() => {
                    if (opt.disabled) return;
                    onChange(opt.key);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </button>
                <SettingInfoButton title={opt.help.title} description={opt.help.description} tip={opt.help.tip} />
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function ForecastStrategySelect({
  value,
  onChange,
}: {
  value: ProductionForecastSettings["strategy"];
  onChange: (v: ProductionForecastSettings["strategy"]) => void;
}) {
  const options: OptionBase[] = FORECAST_STRATEGY_OPTIONS.map((o) => ({
    key: o.key,
    label: o.label,
    disabled: o.disabled,
    help: productionSettingsHelp.forecastStrategyOptions[o.key],
  }));
  return (
    <HelpfulStrategySelect
      ariaLabel="Strategia prognozy"
      value={value}
      options={options}
      onChange={(key) => onChange(key as ProductionForecastSettings["strategy"])}
    />
  );
}

export function AllocationStrategySelect({
  value,
  onChange,
}: {
  value: ProductionReservationSettings["allocation_strategy"];
  onChange: (v: ProductionReservationSettings["allocation_strategy"]) => void;
}) {
  const options: OptionBase[] = ALLOCATION_STRATEGY_OPTIONS.map((o) => ({
    key: o.key,
    label: o.label,
    help: productionSettingsHelp.allocationStrategyOptions[o.key],
  }));
  return (
    <HelpfulStrategySelect
      ariaLabel="Strategia alokacji"
      value={value}
      options={options}
      onChange={(key) => onChange(key as ProductionReservationSettings["allocation_strategy"])}
    />
  );
}
