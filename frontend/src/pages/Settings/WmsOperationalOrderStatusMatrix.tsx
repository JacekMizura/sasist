import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";

import type { WmsSettingsOrderStatusRow } from "../../utils/orderUiStatusWmsSettingsFlatten";
import { orderPanelGroupTitle } from "../../utils/orderPanelStatusUi";

const thClass = "border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500";
const tdClass = "border-b border-slate-100 px-3 py-2 align-middle text-sm text-slate-800";

export type WmsOperationalOrderStatusMatrixProps = {
  title: string;
  description?: string;
  /** Pasek nad tabelą (np. „Zaznacz widoczne”). */
  toolbarExtra?: ReactNode;
  rows: WmsSettingsOrderStatusRow[];
  selectedIds: ReadonlySet<number>;
  onToggle: (statusId: number, enabled: boolean) => void;
  /** Gdy brak magazynu — komunikat zamiast tabeli. */
  disabled?: boolean;
  disabledMessage?: string;
  emptyMessage?: string;
};

export function WmsOperationalOrderStatusMatrix({
  title,
  description,
  toolbarExtra,
  rows,
  selectedIds,
  onToggle,
  disabled,
  disabledMessage = "Wybierz magazyn, aby konfigurować statusy.",
  emptyMessage = "Brak statusów panelu dla tego magazynu — skonfiguruj statusy w ustawieniach panelu zamówień.",
}: WmsOperationalOrderStatusMatrixProps) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.operationalGroup.toLowerCase().includes(s) ||
        orderPanelGroupTitle(r.main_group).toLowerCase().includes(s),
    );
  }, [rows, q]);

  const visibleIds = filtered.map((r) => r.id);
  const allVisibleOn = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const toggleAllVisible = () => {
    const on = !allVisibleOn;
    for (const id of visibleIds) {
      onToggle(id, on);
    }
  };

  if (disabled) {
    return (
      <div className="rounded-lg border border-amber-200/90 bg-amber-50/80 px-3 py-3 text-sm text-amber-950">{disabledMessage}</div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {description ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbarExtra}
          <label className="relative flex min-w-[12rem] flex-1 items-center sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-slate-400" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Szukaj statusu…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35"
            />
          </label>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 text-sm text-slate-600">{emptyMessage}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm">
          <div className="max-h-[min(520px,70vh)] overflow-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead className="sticky top-0 z-[1]">
                <tr>
                  <th className={`${thClass} w-10 text-center`}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={allVisibleOn}
                      onChange={toggleAllVisible}
                      title="Zaznacz / odznacz widoczne wiersze"
                      aria-label="Zaznacz widoczne statusy"
                    />
                  </th>
                  <th className={thClass}>Status panelu</th>
                  <th className={thClass}>Grupa operacyjna</th>
                  <th className={thClass}>Stan panelu</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const on = selectedIds.has(r.id);
                  return (
                    <tr key={r.id} className={on ? "bg-blue-50/35" : "hover:bg-slate-50/80"}>
                      <td className={`${tdClass} text-center`}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={on}
                          onChange={(e) => onToggle(r.id, e.target.checked)}
                          aria-label={`Aktywuj dla statusu ${r.name}`}
                        />
                      </td>
                      <td className={tdClass}>
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full border border-slate-200/80 shadow-sm"
                            style={{ backgroundColor: r.accentColor }}
                            aria-hidden
                          />
                          <span className="min-w-0 font-medium leading-snug text-slate-900">{r.name}</span>
                          <span className="shrink-0 tabular-nums text-[11px] font-semibold text-slate-400">#{r.id}</span>
                        </div>
                      </td>
                      <td className={`${tdClass} text-slate-600`}>
                        <span className="line-clamp-2 text-[13px] leading-snug">{r.operationalGroup}</span>
                      </td>
                      <td className={`${tdClass}`}>
                        <span className="inline-flex rounded-md border border-slate-200/90 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          {orderPanelGroupTitle(r.main_group)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
            <span>
              Zaznaczono <strong className="text-slate-800">{selectedIds.size}</strong> z {rows.length} statusów
              {q.trim() ? ` • widocznych po filtrze: ${filtered.length}` : null}
            </span>
            <span className="text-slate-400">Konfiguracja lokalna (przeglądarka) — do podpięcia pod API magazynu.</span>
          </div>
        </div>
      )}
    </div>
  );
}
