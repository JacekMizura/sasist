import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { ACTIVE_WAREHOUSE_REQUIRED_MESSAGE } from "../../../hooks/useActiveWarehouseContext";
import { listSuppliers, type SupplierRead } from "../../../api/inboundSuppliersApi";
import { createWmsReceivingPz } from "../../../api/wmsReceivingApi";
import { useAutocompleteDropdown } from "../../../hooks/useAutocompleteDropdown";
import { AutocompleteDropdownPanel } from "../AutocompleteDropdownPanel";

type Props = {
  open: boolean;
  tenantId: number;
  warehouseId: number | null;
  onClose: () => void;
  onCreated: (pzId: number) => void;
};

function supplierNipLabel(s: SupplierRead): string | null {
  const nip = (s.tax_id || "").trim();
  return nip ? `NIP: ${nip}` : null;
}

function supplierSecondaryLine(s: SupplierRead): string {
  const parts: string[] = [];
  const nip = supplierNipLabel(s);
  if (nip) parts.push(nip);
  const company = (s.company_name || "").trim();
  if (company && company.toLowerCase() !== (s.name || "").trim().toLowerCase()) {
    parts.push(company);
  }
  return parts.join(" · ");
}

export function WmsNewDeliveryModal({ open, tenantId, warehouseId, onClose, onCreated }: Props) {
  const [supplierInput, setSupplierInput] = useState("");
  const [selected, setSelected] = useState<SupplierRead | null>(null);
  /** Explicit „+ Utwórz nowego dostawcę” — never implied by typing alone. */
  const [createNewIntent, setCreateNewIntent] = useState(false);
  const [suggestions, setSuggestions] = useState<SupplierRead[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmed = supplierInput.trim();

  const showCreateOption = useMemo(() => {
    if (!trimmed || selected != null) return false;
    const low = trimmed.toLowerCase();
    const exact = suggestions.some((s) => (s.name || "").trim().toLowerCase() === low);
    return !exact;
  }, [trimmed, selected, suggestions]);

  const canMountDropdown = selected == null && (suggestions.length > 0 || showCreateOption || Boolean(trimmed));

  const supplierDropdown = useAutocompleteDropdown({
    query: supplierInput,
    enabled: open && !busy && selected == null,
    canMount: canMountDropdown,
    requireQuery: false,
  });

  useEffect(() => {
    if (!open) {
      setSupplierInput("");
      setSelected(null);
      setCreateNewIntent(false);
      setSuggestions([]);
      setErr(null);
      setBusy(false);
    }
  }, [open]);

  const fetchSuggestions = useCallback(
    async (q: string) => {
      try {
        const rows = await listSuppliers(tenantId, {
          name: q.trim() || undefined,
          status: "active",
        });
        const list = rows.slice(0, 12);
        setSuggestions(list);
        if (list.length > 0 || q.trim()) supplierDropdown.openList();
      } catch {
        setSuggestions([]);
      }
    },
    [tenantId, supplierDropdown.openList],
  );

  useEffect(() => {
    if (!open || selected != null) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(trimmed);
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, trimmed, selected, fetchSuggestions]);

  const pickSupplier = (s: SupplierRead) => {
    setSelected(s);
    setSupplierInput(s.name);
    setCreateNewIntent(false);
    setErr(null);
    supplierDropdown.closeList();
  };

  const clearSelection = () => {
    setSelected(null);
    setCreateNewIntent(false);
    setSupplierInput("");
    setSuggestions([]);
    setErr(null);
  };

  const onInputChange = (v: string) => {
    setSupplierInput(v);
    setSelected(null);
    setCreateNewIntent(false);
    supplierDropdown.notifyInputChanged(v);
    setErr(null);
  };

  const chooseCreateNew = () => {
    if (!trimmed) return;
    setCreateNewIntent(true);
    setSelected(null);
    supplierDropdown.closeList();
    setErr(null);
  };

  const canSubmit =
    !busy &&
    warehouseId != null &&
    ((selected != null && selected.id > 0) || (createNewIntent && Boolean(trimmed)));

  const submit = async () => {
    if (warehouseId == null) {
      setErr(ACTIVE_WAREHOUSE_REQUIRED_MESSAGE);
      return;
    }
    if (selected == null && !createNewIntent) {
      setErr("Wybierz dostawcę z listy albo użyj opcji „Utwórz nowego dostawcę”.");
      return;
    }
    if (!trimmed && selected == null) {
      setErr("Podaj nazwę dostawcy");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const name = selected?.name?.trim() || trimmed;
      const doc = await createWmsReceivingPz(
        tenantId,
        {
          supplier_name: name,
          supplier_id: selected?.id,
          create_supplier: createNewIntent && selected == null,
        },
        warehouseId,
      );
      onCreated(doc.id);
      onClose();
    } catch (e: unknown) {
      const detail =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : null;
      const msg =
        typeof detail === "string"
          ? detail
          : "Nie udało się utworzyć PZ. Spróbuj ponownie.";
      setErr(msg);
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
        <label className="block relative" ref={supplierDropdown.containerRef}>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">
            Dostawca
          </span>

          {selected != null ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                <Check size={14} strokeWidth={3} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-slate-900 truncate">{selected.name}</p>
                {supplierSecondaryLine(selected) ? (
                  <p className="text-xs font-medium text-slate-600 mt-0.5">{supplierSecondaryLine(selected)}</p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={clearSelection}
                className="text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-slate-800"
              >
                Zmień
              </button>
            </div>
          ) : createNewIntent ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">
                  Nowy dostawca
                </p>
                <p className="text-base font-bold text-slate-900 truncate">{trimmed}</p>
                <p className="text-xs font-medium text-slate-600 mt-1">
                  Zostanie utworzony dopiero po zatwierdzeniu poniżej.
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={clearSelection}
                className="text-xs font-bold uppercase tracking-wide text-slate-500 hover:text-slate-800"
              >
                Anuluj
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                autoFocus
                role="combobox"
                aria-expanded={supplierDropdown.dropdownVisible}
                aria-autocomplete="list"
                value={supplierInput}
                onChange={(e) => onInputChange(e.target.value)}
                onFocus={() => {
                  supplierDropdown.onInputFocus();
                  void fetchSuggestions(trimmed);
                }}
                onKeyDown={(e) => {
                  if (supplierDropdown.handleInputEscape(e)) return;
                }}
                placeholder="Szukaj po nazwie lub NIP…"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                disabled={busy}
              />
              <AutocompleteDropdownPanel
                mounted={supplierDropdown.canShowDropdown || suggestions.length > 0 || showCreateOption}
                visible={supplierDropdown.dropdownVisible}
                className="z-10"
              >
                <ul className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg divide-y divide-slate-100">
                  {suggestions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left hover:bg-indigo-50"
                        onMouseDown={supplierDropdown.preventOptionMouseDown}
                        onClick={() => pickSupplier(s)}
                      >
                        <span className="block text-sm font-semibold text-slate-900">{s.name}</span>
                        {supplierSecondaryLine(s) ? (
                          <span className="block text-xs font-medium text-slate-500 mt-0.5">
                            {supplierSecondaryLine(s)}
                          </span>
                        ) : null}
                        {s.is_incomplete ? (
                          <span className="mt-1 inline-block text-[10px] font-bold uppercase text-amber-600">
                            niekompletny
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                  {showCreateOption ? (
                    <li>
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left text-sm font-bold text-indigo-700 hover:bg-indigo-50"
                        onMouseDown={supplierDropdown.preventOptionMouseDown}
                        onClick={chooseCreateNew}
                      >
                        + Utwórz nowego dostawcę „{trimmed}”
                      </button>
                    </li>
                  ) : null}
                  {!trimmed && suggestions.length === 0 ? (
                    <li className="px-4 py-3 text-xs font-medium text-slate-500">
                      Zacznij pisać, aby wyszukać dostawcę…
                    </li>
                  ) : null}
                </ul>
              </AutocompleteDropdownPanel>
            </>
          )}
        </label>

        {err ? (
          <p className="text-sm font-medium text-red-600" role="alert">
            {err}
          </p>
        ) : null}

        <button
          type="button"
          disabled={!canSubmit}
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
