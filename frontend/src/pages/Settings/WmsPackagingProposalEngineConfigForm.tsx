import { useCallback, useMemo, useState, type ReactNode } from "react";

import type { OrderStatusOption } from "../../types/wmsPackingSettings";
import { orderPanelStatusSelectLabel } from "../../utils/orderPanelStatusUi";
import {
  type SmartMatchingIdenticalThreshold,
  type WmsPackagingProposalLocalConfigV1,
} from "./wmsPackagingProposalLocalConfig";

const selectClass =
  "mt-1.5 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

const checkboxClass = "mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500";

function Help({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs leading-relaxed text-slate-500">{children}</p>;
}

type Props = {
  /** Smart Matching: pokaż próg uczenia z identycznych zamówień. 3D: ukryj (nie uczy się z historii). */
  showSmartLearningThreshold: boolean;
  config: WmsPackagingProposalLocalConfigV1;
  patchConfig: (patch: Partial<WmsPackagingProposalLocalConfigV1>) => void;
  sortedStatuses: OrderStatusOption[];
};

export function WmsPackagingProposalEngineConfigForm({
  showSmartLearningThreshold,
  config,
  patchConfig,
  sortedStatuses,
}: Props) {
  const [proposalInitSearch, setProposalInitSearch] = useState("");
  const [autoLabelSearch, setAutoLabelSearch] = useState("");

  const proposalInitFiltered = useMemo(() => {
    const q = proposalInitSearch.trim().toLowerCase();
    if (!q) return sortedStatuses;
    return sortedStatuses.filter((s) => orderPanelStatusSelectLabel(s).toLowerCase().includes(q));
  }, [sortedStatuses, proposalInitSearch]);

  const autoLabelFiltered = useMemo(() => {
    const q = autoLabelSearch.trim().toLowerCase();
    if (!q) return sortedStatuses;
    return sortedStatuses.filter((s) => orderPanelStatusSelectLabel(s).toLowerCase().includes(q));
  }, [sortedStatuses, autoLabelSearch]);

  const toggleProposalInit = useCallback(
    (id: number, on: boolean) => {
      const set = new Set(config.proposalInitStatusIds);
      if (on) set.add(id);
      else set.delete(id);
      patchConfig({ proposalInitStatusIds: Array.from(set).sort((a, b) => a - b) });
    },
    [config.proposalInitStatusIds, patchConfig],
  );

  const toggleAutoLabelStatus = useCallback(
    (id: number, on: boolean) => {
      const set = new Set(config.autoLabelWorkflowStatusIds);
      if (on) set.add(id);
      else set.delete(id);
      patchConfig({ autoLabelWorkflowStatusIds: Array.from(set).sort((a, b) => a - b) });
    },
    [config.autoLabelWorkflowStatusIds, patchConfig],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className={checkboxClass}
            checked={config.packagingSuggestionsEnabled}
            onChange={(e) => patchConfig({ packagingSuggestionsEnabled: e.target.checked })}
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-900">Włącz propozycje opakowań dla zamówień</span>
            <Help>
              Globalny przełącznik: gdy wyłączony, ani Smart Matching, ani 3D Matching nie aktywują silnika propozycji w przepływie
              realizacji (do podpięcia pod backend).
            </Help>
          </span>
        </label>
      </div>

      {showSmartLearningThreshold ? (
        <div className="rounded-lg border border-slate-100 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">Tryb Smart Matching — próg uczenia</p>
          <Help>
            Po N-krotnym spakowaniu zamówień o <strong className="font-medium text-slate-700">identycznej strukturze</strong> (te same
            pozycje i ilości) system tworzy regułę powiązania zestawienia z wybranym kartonem. To dotyczy{" "}
            <strong className="font-medium text-slate-700">wyłącznie Smart Matching</strong> — 3D Matching nie uczy się z historii.
          </Help>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Wymagana liczba identycznych, spakowanych zamówień
            <select
              className={selectClass}
              value={config.identicalOrdersThreshold}
              onChange={(e) =>
                patchConfig({ identicalOrdersThreshold: Number(e.target.value) as SmartMatchingIdenticalThreshold })
              }
            >
              <option value={2}>2 identyczne zamówienia</option>
              <option value={3}>3 identyczne zamówienia</option>
              <option value={5}>5 identycznych zamówień</option>
            </select>
          </label>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-100 bg-blue-50/35 px-3 py-3 text-xs leading-relaxed text-slate-800">
          <p className="font-semibold text-slate-900">3D Matching a uczenie</p>
          <p className="mt-1 text-slate-700">
            Ten silnik <strong className="font-medium text-slate-800">nie uczy się z historii</strong> — dobór kartonu wynika z wymiarów
            produktów, kartonów, metody dostawy i obliczeń fizycznego dopasowania. Wspólne poniżej są wyłącznie{" "}
            <strong className="font-medium text-slate-800">triggery workflow</strong> (statusy) oraz akcja po dopasowaniu (etykiety).
          </p>
        </div>
      )}

      <div className="rounded-lg border border-slate-100 bg-white p-4">
        <p className="text-sm font-semibold text-slate-900">Statusy inicjujące propozycję opakowania</p>
        <Help>
          Zaznacz jeden lub wiele statusów panelu. Wejście zamówienia w <strong className="font-medium text-slate-700">dowolny</strong> z
          wybranych statusów uruchamia generowanie propozycji — backend wybierze Smart Matching lub 3D Matching wg danych i konfiguracji.
        </Help>
        <input
          type="search"
          value={proposalInitSearch}
          onChange={(e) => setProposalInitSearch(e.target.value)}
          placeholder="Szukaj statusu…"
          className="mt-3 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35"
        />
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200/90 bg-slate-50/40 p-2">
          {proposalInitFiltered.length === 0 ? (
            <p className="px-2 py-3 text-xs text-slate-500">Brak statusów do wyświetlenia.</p>
          ) : (
            <ul className="space-y-0.5">
              {proposalInitFiltered.map((s) => {
                const on = config.proposalInitStatusIds.includes(s.id);
                return (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/80">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        checked={on}
                        onChange={(e) => toggleProposalInit(s.id, e.target.checked)}
                      />
                      <span className="text-sm text-slate-800">{orderPanelStatusSelectLabel(s)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-100 bg-white p-4">
        <p className="text-sm font-semibold text-slate-900">Automatyczne generowanie etykiet</p>
        <Help>
          Działanie <strong className="font-medium text-slate-700">po udanym dopasowaniu opakowania</strong> — nie jest częścią uczenia.
          Możesz zdefiniować <strong className="font-medium text-slate-700">wiele statusów</strong>, przy których dozwolone jest
          automatyczne tworzenie etykiet.
        </Help>
        <label className="mt-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className={checkboxClass}
            checked={config.autoLabelAfterMatchEnabled}
            onChange={(e) => patchConfig({ autoLabelAfterMatchEnabled: e.target.checked })}
          />
          <span className="text-sm font-medium text-slate-800">Włącz automatyczne generowanie etykiet po dopasowaniu</span>
        </label>

        {config.autoLabelAfterMatchEnabled ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-medium text-slate-700">Statusy workflow z auto-generowaniem etykiet</p>
            <input
              type="search"
              value={autoLabelSearch}
              onChange={(e) => setAutoLabelSearch(e.target.value)}
              placeholder="Szukaj statusu…"
              className="mt-2 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35"
            />
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200/90 bg-slate-50/40 p-2">
              {autoLabelFiltered.length === 0 ? (
                <p className="px-2 py-3 text-xs text-slate-500">Brak statusów do wyświetlenia.</p>
              ) : (
                <ul className="space-y-0.5">
                  {autoLabelFiltered.map((s) => {
                    const on = config.autoLabelWorkflowStatusIds.includes(s.id);
                    return (
                      <li key={s.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/80">
                          <input
                            type="checkbox"
                            className={checkboxClass}
                            checked={on}
                            onChange={(e) => toggleAutoLabelStatus(s.id, e.target.checked)}
                          />
                          <span className="text-sm text-slate-800">{orderPanelStatusSelectLabel(s)}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <Help>Przykład: Pakowanie, Spakowane, Wózki — wiele statusów operacyjnych powiązanych z wydrukiem etykiety po dopasowaniu.</Help>
          </div>
        ) : null}
      </div>
    </div>
  );
}
