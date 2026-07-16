import { ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { ORDERS_PANEL_GROUP_LABELS } from "../../../components/orders/OrdersPanelStatusSidebar";
import type { OrderUiMainGroup } from "../../../types/orderUiStatus";
import { sidebarSubStatusHex } from "../../../utils/panelSidebarHierarchy";

export type PickingStatusSelectOption = {
  id: number;
  name: string;
  main_group: OrderUiMainGroup;
  badgeColor: string;
};

const GROUP_ORDER: OrderUiMainGroup[] = ["NEW", "IN_PROGRESS", "DONE"];

type Props = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  options: PickingStatusSelectOption[];
  disabled?: boolean;
  loading?: boolean;
  invalid?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-required"?: boolean;
  "aria-invalid"?: boolean;
  "aria-busy"?: boolean;
};

function StatusColorBadge({ color, size = "md" }: { color: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  return (
    <span
      className={`${dim} shrink-0 rounded-full ring-1 ring-black/10`}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

export function PickingStatusSelect({
  value,
  onChange,
  onBlur,
  options,
  disabled = false,
  loading = false,
  invalid = false,
  placeholder = "Wybierz status",
  className = "",
  id,
  "aria-required": ariaRequired,
  "aria-invalid": ariaInvalid,
  "aria-busy": ariaBusy,
}: Props) {
  const reactId = useId();
  const listId = `picking-status-list-${reactId}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(() => {
    if (!value) return null;
    const idNum = Number(value);
    return options.find((o) => o.id === idNum) ?? null;
  }, [options, value]);

  const q = search.trim().toLowerCase();
  const grouped = useMemo(() => {
    return GROUP_ORDER.map((mg) => {
      const rows = options
        .filter((o) => o.main_group === mg)
        .filter((o) => {
          if (!q) return true;
          const groupLabel = ORDERS_PANEL_GROUP_LABELS[mg].toLowerCase();
          return o.name.toLowerCase().includes(q) || groupLabel.includes(q);
        });
      return { main_group: mg, label: ORDERS_PANEL_GROUP_LABELS[mg], rows };
    }).filter((g) => g.rows.length > 0);
  }, [options, q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || !(e.target instanceof Node) || el.contains(e.target)) return;
      setOpen(false);
      onBlur?.();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onBlur]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const triggerClass = [
    "flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-left text-sm outline-none transition",
    "focus-visible:ring-2 focus-visible:ring-blue-500/40",
    invalid ? "border-red-400 focus-visible:ring-red-500/35" : "border-slate-200 hover:border-slate-300",
    disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
    className,
  ].join(" ");

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
    onBlur?.();
  };

  return (
    <div ref={rootRef} className="relative mt-1.5">
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-required={ariaRequired}
        aria-invalid={ariaInvalid ?? invalid}
        aria-busy={ariaBusy ?? loading}
        className={triggerClass}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        onBlur={(e) => {
          if (rootRef.current?.contains(e.relatedTarget as Node)) return;
          if (!open) onBlur?.();
        }}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {loading ? (
            <span className="truncate text-slate-500">Ładowanie…</span>
          ) : selected ? (
            <>
              <StatusColorBadge color={selected.badgeColor} />
              <span className="min-w-0 truncate font-medium text-slate-900">{selected.name}</span>
              <span className="shrink-0 text-xs text-slate-400">
                {ORDERS_PANEL_GROUP_LABELS[selected.main_group]}
              </span>
            </>
          ) : (
            <span className="truncate text-slate-500">{options.length === 0 ? "—" : placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && !disabled ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div className="sticky top-0 z-10 border-b border-slate-100 bg-white p-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
                aria-hidden
              />
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Szukaj statusu…"
                aria-label="Szukaj statusu"
                className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-slate-300 focus:bg-white focus:ring-1 focus:ring-slate-200"
              />
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto overscroll-y-contain py-1">
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
              onClick={() => pick("")}
            >
              {placeholder}
            </button>

            {grouped.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-500">Brak statusów pasujących do wyszukiwania.</p>
            ) : (
              grouped.map((group) => (
                <div key={group.main_group} className="pt-1">
                  <div className="sticky top-0 z-[1] bg-white/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 backdrop-blur-sm">
                    {group.label}
                  </div>
                  <ul>
                    {group.rows.map((o) => {
                      const selectedRow = value === String(o.id);
                      return (
                        <li key={o.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={selectedRow}
                            className={[
                              "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                              selectedRow ? "bg-blue-50 text-blue-900" : "text-slate-800 hover:bg-slate-50",
                            ].join(" ")}
                            onClick={() => pick(String(o.id))}
                          >
                            <StatusColorBadge color={o.badgeColor} size="sm" />
                            <span className="min-w-0 flex-1 truncate font-medium">{o.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Resolve display badge color for a panel status row. */
export function pickingStatusBadgeColor(
  color: string | null | undefined,
  badgeColor: string | null | undefined,
  mainGroup: OrderUiMainGroup,
): string {
  return sidebarSubStatusHex(badgeColor ?? color, mainGroup);
}
