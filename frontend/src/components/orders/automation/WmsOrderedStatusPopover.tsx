import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import { Search } from "lucide-react";

import { getOrderPanelSubgroups, getOrderUiStatusSummary } from "../../../api/orderUiStatusApi";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import { getStatusClass } from "../orderList/OrderListPanelStatusBadge";
import { buildWmsOrderedStatusPickerRows, filterWmsStatusPickerRows, type WmsStatusPickerRow } from "../../../utils/wmsOrderStatusPickerRows";

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  tenantId: number;
  warehouseId: number;
  selectedId: number | null;
  onClose: () => void;
  onSelect: (statusId: number) => void;
};

export function WmsOrderedStatusPopover({
  open,
  anchorRef,
  tenantId,
  warehouseId,
  selectedId,
  onClose,
  onSelect,
}: Props) {
  const [q, setQ] = useState("");
  const [summary, setSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [subgroups, setSubgroups] = useState<OrderUiPanelSubgroupRead[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [kbdFlat, setKbdFlat] = useState(0);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (v) => {
      if (!v) onClose();
    },
    placement: "bottom-start",
    strategy: "fixed",
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useLayoutEffect(() => {
    refs.setReference(anchorRef.current);
  }, [anchorRef, refs, open]);

  const dismiss = useDismiss(context, { ancestorScroll: true, outsidePress: true, escapeKey: true });
  const { getFloatingProps } = useInteractions([dismiss]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, sg] = await Promise.all([
        getOrderUiStatusSummary(tenantId, warehouseId, { includeInactive: true }),
        getOrderPanelSubgroups(tenantId, warehouseId),
      ]);
      setSummary(s);
      setSubgroups(sg);
    } catch {
      setSummary(null);
      setSubgroups([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setKbdFlat(0);
      return;
    }
    void load();
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open, load]);

  const rows = useMemo(() => buildWmsOrderedStatusPickerRows(summary, subgroups), [summary, subgroups]);
  const filtered = useMemo(() => filterWmsStatusPickerRows(rows, q), [rows, q]);

  const statusSlots = useMemo(() => {
    const out: { rowIndex: number; row: Extract<WmsStatusPickerRow, { kind: "status" }> }[] = [];
    filtered.forEach((r, i) => {
      if (r.kind === "status") out.push({ rowIndex: i, row: r });
    });
    return out;
  }, [filtered]);

  useLayoutEffect(() => {
    optionRefs.current = [];
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    setKbdFlat((k) => Math.min(k, Math.max(0, statusSlots.length - 1)));
  }, [open, statusSlots.length]);

  useEffect(() => {
    if (!open || statusSlots.length === 0) return;
    const el = optionRefs.current[kbdFlat];
    el?.scrollIntoView({ block: "nearest" });
  }, [kbdFlat, open, statusSlots.length]);

  const onListKeyDown = (e: KeyboardEvent) => {
    if (statusSlots.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setKbdFlat((k) => Math.min(k + 1, statusSlots.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setKbdFlat((k) => Math.max(k - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const slot = statusSlots[kbdFlat];
      if (slot) {
        onSelect(slot.row.status.id);
        onClose();
      }
    }
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && statusSlots.length > 0) {
      e.preventDefault();
      setKbdFlat(0);
      listRef.current?.focus();
    }
  };

  if (!open) return null;

  let statusOrdinal = -1;

  return (
    <FloatingPortal id="floating-portal-wms-status-popover">
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="z-[130] flex w-[min(100vw-1rem,24rem)] max-w-[24rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/10"
        role="presentation"
        {...getFloatingProps()}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-2.5 py-2">
          <Search className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Szukaj…"
            className="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
        </div>
        <p className="border-b border-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Kolejność WMS · ↑↓ Enter
        </p>
        <div
          ref={listRef}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className="max-h-56 min-h-0 overflow-y-auto overscroll-y-contain p-1.5 [scrollbar-width:thin] outline-none"
          role="listbox"
          aria-label="Status panelu WMS"
          aria-activedescendant={statusSlots[kbdFlat] ? `wms-st-${statusSlots[kbdFlat]!.row.status.id}` : undefined}
        >
          {loading ? (
            <p className="py-6 text-center text-sm text-slate-500">Ładowanie…</p>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Brak statusów.</p>
          ) : (
            filtered.map((r) => {
              if (r.kind === "main") {
                return (
                  <div key={r.key} className="mt-1.5 first:mt-0">
                    <div className="rounded-md border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-900">
                      {r.label}
                    </div>
                  </div>
                );
              }
              if (r.kind === "sep") {
                return (
                  <div
                    key={r.key}
                    className="my-1.5 border-y border-dashed border-slate-200 bg-slate-50/80 px-2 py-1 text-center text-[10px] font-semibold text-slate-600"
                  >
                    {r.label}
                  </div>
                );
              }
              statusOrdinal += 1;
              const flat = statusOrdinal;
              const active = selectedId === r.status.id;
              const kbdHere = statusSlots[kbdFlat]?.row.status.id === r.status.id;
              const colorClass = getStatusClass(r.status.name ?? "");
              return (
                <button
                  key={r.key}
                  id={`wms-st-${r.status.id}`}
                  ref={(el) => {
                    optionRefs.current[flat] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onSelect(r.status.id);
                    onClose();
                  }}
                  className={`mb-1 flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition ${
                    kbdHere ? "border-cyan-500 bg-cyan-50 ring-2 ring-cyan-400/40" : ""
                  } ${
                    active ? "border-cyan-400 bg-cyan-50/90" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-md border-l-[3px] px-2 py-1 text-sm font-semibold leading-snug ${colorClass}`}
                  >
                    {r.status.image_url ? (
                      <img src={r.status.image_url} alt="" className="h-4 w-4 shrink-0 rounded object-contain" />
                    ) : null}
                    <span className="min-w-0 truncate">{r.status.name}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </FloatingPortal>
  );
}
