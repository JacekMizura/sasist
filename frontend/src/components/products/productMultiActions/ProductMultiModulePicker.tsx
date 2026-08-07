import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Factory,
  FolderTree,
  Package,
  Ruler,
  Scale,
  Search,
  ShieldCheck,
  Tags,
  ToggleLeft,
  Users,
  Warehouse,
  Weight,
  X,
  BadgePercent,
  CircleDollarSign,
  FormInput,
  Layers,
  Barcode,
} from "lucide-react";

import { AppOverlayPortal } from "../../overlay";
import { listPickerGroups } from "./registry";
import type { ProductMultiModuleId } from "./types";

const MODULE_ICONS: Partial<Record<ProductMultiModuleId, LucideIcon>> = {
  manufacturer: Factory,
  product_status: ToggleLeft,
  generate_ean: Barcode,
  categories: FolderTree,
  product_family: Users,
  tags: Tags,
  custom_fields: FormInput,
  prices: CircleDollarSign,
  vat_rate: BadgePercent,
  unit_dimensions: Ruler,
  weight: Weight,
  master_carton: Package,
  logistics_data: Boxes,
  orientation_stacking: Layers,
  wms_validation: ShieldCheck,
  wms_replenishment: Warehouse,
};

export type ProductMultiModulePickerProps = {
  open: boolean;
  disabledIds?: Set<ProductMultiModuleId>;
  onClose: () => void;
  onPick: (id: ProductMultiModuleId) => void;
};

export function ProductMultiModulePicker({ open, disabledIds, onClose, onPick }: ProductMultiModulePickerProps) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => listPickerGroups(), []);

  useEffect(() => {
    if (!open) {
      setQ("");
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        modules: g.modules.filter((m) => {
          if (!s) return true;
          const blob = `${m.label} ${m.group} ${m.id}`.toLowerCase();
          return blob.includes(s);
        }),
      }))
      .filter((g) => g.modules.length > 0);
  }, [groups, q]);

  if (!open) return null;

  return (
    <AppOverlayPortal>
      <div
        className="fixed inset-0 z-[300] flex items-start justify-center bg-slate-900/40 p-4 pt-[min(10vh,5.5rem)] backdrop-blur-[2px]"
        role="presentation"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Dodaj zmianę"
          className="flex max-h-[min(78vh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/10"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Szukaj modułu…"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              aria-label="Zamknij"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {filtered.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-slate-500">Brak wyników.</p>
            ) : (
              filtered.map((g) => (
                <div key={g.group} className="mb-3 last:mb-0">
                  <p className="sticky top-0 z-[1] bg-white/95 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 backdrop-blur">
                    {g.group}
                  </p>
                  <div className="mt-0.5 space-y-0.5">
                    {g.modules.map((m) => {
                      const Icon = MODULE_ICONS[m.id] ?? Scale;
                      const used = disabledIds?.has(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={used}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={() => {
                            onPick(m.id);
                            onClose();
                          }}
                        >
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600">
                            <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                            {m.label}
                          </span>
                          {used ? <span className="text-[10px] font-semibold uppercase text-slate-400">Dodano</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppOverlayPortal>
  );
}
