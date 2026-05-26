import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { listSuppliers, type SupplierRead } from "../../../api/inboundSuppliersApi";
import { createWmsReceivingPz } from "../../../api/wmsReceivingApi";
import { useAutocompleteDropdown } from "../../../hooks/useAutocompleteDropdown";
import { AutocompleteDropdownPanel } from "../AutocompleteDropdownPanel";

type Props = {
  open: boolean;
  tenantId: number;
  onClose: () => void;
  onCreated: (pzId: number) => void;
};

export function WmsNewDeliveryModal({ open, tenantId, onClose, onCreated }: Props) {
  const [supplierInput, setSupplierInput] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<SupplierRead[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmed = supplierInput.trim();

  const supplierDropdown = useAutocompleteDropdown({
    query: supplierInput,
    enabled: open && !busy,
    canMount: suggestions.length > 0,
  });

  useEffect(() => {
    if (!open) {
      setSupplierInput("");
      setSelectedId(null);
      setSuggestions([]);
      setErr(null);
      setBusy(false);
    }
  }, [open]);

  const fetchSuggestions = useCallback(
    async (q: string) => {
      if (!q) {
        setSuggestions([]);
        return;
      }
      try {
        const rows = await listSuppliers(tenantId, { name: q, status: "active" });
        const list = rows.slice(0, 12);
        setSuggestions(list);
        if (list.length > 0) supplierDropdown.openList();
        else supplierDropdown.closeList();
      } catch {
        setSuggestions([]);
      }
    },
    [tenantId, supplierDropdown.openList, supplierDropdown.closeList],
  );

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(trimmed);
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, trimmed, fetchSuggestions]);

  const exactMatch = useMemo(() => {
    if (!trimmed) return null;
    const low = trimmed.toLowerCase();
    return suggestions.find((s) => (s.name || "").trim().toLowerCase() === low) ?? null;
  }, [suggestions, trimmed]);

  const pickSupplier = (s: SupplierRead) => {
    setSupplierInput(s.name);
    setSelectedId(s.id);
    supplierDropdown.closeList();
  };

  const onInputChange = (v: string) => {
    setSupplierInput(v);
    setSelectedId(null);
    supplierDropdown.notifyInputChanged(v);
    setErr(null);
  };

  const submit = async () => {
    if (!trimmed) {
      setErr("Podaj nazwę dostawcy");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const doc = await createWmsReceivingPz(tenantId, {
        supplier_name: trimmed,
        supplier_id: selectedId ?? exactMatch?.id ?? undefined,
      });
      onCreated(doc.id);
      onClose();
    } catch {
      setErr("Nie udało się utworzyć PZ. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        aria-label="Zamknij"
        onClick={onClose}
      />
      <NewDeliveryPanel busy={busy} onClose={onClose}>
        <label className="block" ref={supplierDropdown.containerRef}>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">
            Dostawca
          </span>
          <input
            type="text"
            autoFocus
            role="combobox"
            aria-expanded={supplierDropdown.dropdownVisible}
            value={supplierInput}
            onChange={(e) => onInputChange(e.target.value)}
            onFocus={supplierDropdown.onInputFocus}
            onKeyDown={(e) => {
              if (supplierDropdown.handleInputEscape(e)) return;
            }}
            placeholder="Wybierz lub wpisz nazwę…"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            disabled={busy}
          />
          <AutocompleteDropdownPanel
            mounted={supplierDropdown.canShowDropdown}
            visible={supplierDropdown.dropdownVisible}
            className="z-10"
          >
            <ul className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg divide-y divide-slate-100">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-indigo-50"
                    onMouseDown={supplierDropdown.preventOptionMouseDown}
                    onClick={() => pickSupplier(s)}
                  >
                    {s.name}
                    {s.is_incomplete ? (
                      <span className="ml-2 text-[10px] font-bold uppercase text-amber-600">niekompletny</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </AutocompleteDropdownPanel>
        </label>

        {trimmed && !exactMatch && selectedId == null ? (
          <p className="text-xs font-medium text-slate-500">
            Zostanie utworzony nowy dostawca: <strong className="text-slate-800">{trimmed}</strong>
          </p>
        ) : null}

        {err ? (
          <p className="text-sm font-medium text-red-600" role="alert">
            {err}
          </p>
        ) : null}

        <button
          type="button"
          disabled={busy || !trimmed}
          onClick={() => void submit()}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          Utwórz i rozpocznij przyjęcie
        </button>
      </NewDeliveryPanel>
    </div>
  );
}

function NewDeliveryPanel({
  children,
  busy,
  onClose,
}: {
  children: React.ReactNode;
  busy: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="relative z-10 w-full max-w-md rounded-t-[28px] sm:rounded-[28px] bg-white shadow-2xl border border-slate-200 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wms-new-delivery-title"
    >
      <NewDeliveryPanelHeader busy={busy} onClose={onClose} />
      <div className="p-5 sm:p-6 space-y-4">{children}</div>
    </div>
  );
}

function NewDeliveryPanelHeader({ busy, onClose }: { busy: boolean; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
      <h2 id="wms-new-delivery-title" className="text-lg font-black text-slate-900">
        Nowa dostawa
      </h2>
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Zamknij"
      >
        <X size={20} />
      </button>
    </div>
  );
}
