import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, X } from "lucide-react";
import type { OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import type { ShippingMethodDto } from "../../../api/shippingMethodsApi";
import { ORDERS_PANEL_GROUP_LABELS } from "../OrdersPanelStatusSidebar";
import {
  BULK_ACTION_DROPDOWN_ORDER,
  BULK_ACTION_LABELS,
  type BulkActionConfig,
  type BulkActionKind,
  type BulkActionRow,
} from "./bulkMultiActionTypes";

const inp =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300";
const lab = "block text-xs font-medium text-slate-600";

function newRow(kind: BulkActionKind): BulkActionRow {
  return { id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, expanded: true };
}

function defaultConfigFor(kind: BulkActionKind): Partial<BulkActionConfig> {
  switch (kind) {
    case "change_status":
      return { change_status: { statusId: "" } };
    case "issue_document":
      return { issue_document: { documentType: "INVOICE" } };
    case "change_shipping":
      return { change_shipping: { shippingMethodId: "" } };
    case "send_message":
      return { send_message: { subject: "", body: "" } };
    case "add_note":
      return { add_note: { text: "" } };
    case "generate_label":
      return { generate_label: { templateCode: "" } };
    default:
      return {};
  }
}

export type OrderBulkMultiActionModalProps = {
  open: boolean;
  onClose: () => void;
  orderCount: number;
  panelSummary: OrderUiStatusPanelSummary | null;
  shippingMethods: ShippingMethodDto[];
  busy?: boolean;
  onExecute: (payload: { rows: BulkActionRow[]; config: BulkActionConfig }) => Promise<void> | void;
};

export function OrderBulkMultiActionModal({
  open,
  onClose,
  orderCount,
  panelSummary,
  shippingMethods,
  busy,
  onExecute,
}: OrderBulkMultiActionModalProps) {
  const [rows, setRows] = useState<BulkActionRow[]>([]);
  const [config, setConfig] = useState<BulkActionConfig>({});
  const [addSelect, setAddSelect] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const reset = useCallback(() => {
    setRows([]);
    setConfig({});
    setAddSelect("");
    setConfirmed(false);
  }, []);

  const addKind = useCallback((kind: BulkActionKind) => {
    setRows((prev) => {
      if (prev.some((r) => r.kind === kind)) {
        return prev.map((r) => (r.kind === kind ? { ...r, expanded: true } : r));
      }
      const patch = defaultConfigFor(kind);
      setConfig((c) => ({ ...c, ...patch }));
      return [...prev, newRow(kind)];
    });
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const moveRow = (id: string, dir: -1 | 1) => {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const cp = [...prev];
      const t = cp[i];
      cp[i] = cp[j];
      cp[j] = t;
      return cp;
    });
  };

  const toggleExpand = (id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, expanded: !r.expanded } : r)));
  };

  const canRun = rows.length > 0 && orderCount > 0 && confirmed && !busy;

  const run = async () => {
    if (!canRun) return;
    await onExecute({ rows, config });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-multi-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="bulk-multi-title" className="text-lg font-bold text-slate-900">
              Multiakcje
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Zamówień: {orderCount}. Akcje wykonywane są po kolei dla każdego zamówienia.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            onClick={onClose}
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {rows.length === 0 ? (
            <p className="text-sm text-slate-600">Dodaj co najmniej jedną akcję z listy poniżej.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row, idx) => (
                <li key={row.id} className="rounded-lg border border-slate-200 bg-slate-50/80">
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <button
                      type="button"
                      className="rounded p-1.5 text-slate-600 hover:bg-white"
                      onClick={() => toggleExpand(row.id)}
                      aria-expanded={row.expanded}
                      title={row.expanded ? "Zwiń" : "Rozwiń"}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${row.expanded ? "rotate-180" : ""}`}
                        aria-hidden
                      />
                    </button>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                      {BULK_ACTION_LABELS[row.kind]}
                    </span>
                    <button
                      type="button"
                      disabled={busy || idx === 0}
                      className="rounded p-1.5 text-slate-600 hover:bg-white disabled:opacity-30"
                      title="Wyżej"
                      onClick={() => moveRow(row.id, -1)}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={busy || idx >= rows.length - 1}
                      className="rounded p-1.5 text-slate-600 hover:bg-white disabled:opacity-30"
                      title="Niżej"
                      onClick={() => moveRow(row.id, 1)}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40"
                      title="Usuń akcję"
                      onClick={() => removeRow(row.id)}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  {row.expanded ? (
                    <div className="border-t border-slate-200 bg-white px-3 py-3">
                      {row.kind === "change_status" ? (
                        <label className={lab}>
                          Status panelu
                          <select
                            className={inp}
                            disabled={busy}
                            value={config.change_status?.statusId ?? ""}
                            onChange={(e) =>
                              setConfig((c) => ({
                                ...c,
                                change_status: { statusId: e.target.value },
                              }))
                            }
                          >
                            <option value="">— bez zmian / wyczyść —</option>
                            <option value="__clear__">Usuń etykietę panelu</option>
                            {(panelSummary?.groups ?? []).flatMap((block) =>
                              block.sub_statuses.map((s) => (
                                <option key={s.id} value={String(s.id)}>
                                  {ORDERS_PANEL_GROUP_LABELS[block.main_group]}: {s.name}
                                </option>
                              )),
                            )}
                          </select>
                        </label>
                      ) : null}
                      {row.kind === "issue_document" ? (
                        <fieldset>
                          <legend className={lab}>Typ dokumentu</legend>
                          <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-800">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="radio"
                                name={`doc-${row.id}`}
                                checked={config.issue_document?.documentType === "INVOICE"}
                                onChange={() =>
                                  setConfig((c) => ({ ...c, issue_document: { documentType: "INVOICE" } }))
                                }
                              />
                              Faktura
                            </label>
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="radio"
                                name={`doc-${row.id}`}
                                checked={config.issue_document?.documentType === "PARAGON"}
                                onChange={() =>
                                  setConfig((c) => ({ ...c, issue_document: { documentType: "PARAGON" } }))
                                }
                              />
                              Paragon
                            </label>
                          </div>
                        </fieldset>
                      ) : null}
                      {row.kind === "change_shipping" ? (
                        <label className={lab}>
                          Metoda dostawy
                          <select
                            className={inp}
                            disabled={busy}
                            value={config.change_shipping?.shippingMethodId ?? ""}
                            onChange={(e) =>
                              setConfig((c) => ({
                                ...c,
                                change_shipping: { shippingMethodId: e.target.value },
                              }))
                            }
                          >
                            <option value="">— bez zmiany —</option>
                            {shippingMethods.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {row.kind === "add_note" ? (
                        <label className={lab}>
                          Treść notatki
                          <textarea
                            className={`${inp} min-h-[5rem]`}
                            disabled={busy}
                            value={config.add_note?.text ?? ""}
                            onChange={(e) =>
                              setConfig((c) => ({ ...c, add_note: { text: e.target.value } }))
                            }
                            placeholder="Notatka zostanie dopisana do każdego zamówienia."
                          />
                        </label>
                      ) : null}
                      {row.kind === "send_message" ? (
                        <p className="text-xs text-amber-800">Wysyłka wiadomości — funkcja w przygotowaniu.</p>
                      ) : null}
                      {row.kind === "generate_label" ? (
                        <p className="text-xs text-amber-800">Generowanie etykiety — funkcja w przygotowaniu.</p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 border-t border-slate-100 pt-4">
            <label className={lab}>Wybierz akcję</label>
            <select
              className={inp}
              value={addSelect}
              disabled={busy}
              onChange={(e) => {
                const v = e.target.value as BulkActionKind | "";
                setAddSelect("");
                if (v) addKind(v);
              }}
            >
              <option value="">— dodaj —</option>
              {BULK_ACTION_DROPDOWN_ORDER.map((k) => (
                <option key={k} value={k}>
                  {BULK_ACTION_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-1 rounded border-slate-300"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>Potwierdzam wykonanie wybranych akcji na {orderCount} zamówieniach.</span>
          </label>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            onClick={onClose}
          >
            Anuluj
          </button>
          <button
            type="button"
            disabled={!canRun}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            onClick={() => void run()}
          >
            {busy ? "Wykonywanie…" : "Uruchom"}
          </button>
        </div>
      </div>
    </div>
  );
}
