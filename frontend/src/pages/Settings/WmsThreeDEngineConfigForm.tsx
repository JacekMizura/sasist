import type { ReactNode } from "react";

import {
  type ThreeDMatchingStrategy,
  type WmsThreeDEngineLocalConfigV1,
} from "./wmsThreeDEngineLocalConfig";

const inputClass =
  "mt-1.5 w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/35";

const selectClass =
  "mt-1.5 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/35";

const checkboxClass = "mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500";

function Help({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs leading-relaxed text-slate-500">{children}</p>;
}

const STRATEGY_OPTIONS: { value: ThreeDMatchingStrategy; label: string }[] = [
  { value: "SMALLEST_CARTON", label: "Najmniejszy karton (minimalna objętość zewnętrzna)" },
  { value: "BEST_FILL", label: "Najlepsze wypełnienie (optymalizacja przestrzeni)" },
  { value: "LOWEST_COST", label: "Najniższy koszt (preferuj tańszy karton / mniejszy gabaryt)" },
];

type Props = {
  config: WmsThreeDEngineLocalConfigV1;
  patchConfig: (patch: Partial<WmsThreeDEngineLocalConfigV1>) => void;
};

export function WmsThreeDEngineConfigForm({ config, patchConfig }: Props) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-cyan-200/60 bg-cyan-50/30 px-3 py-3 text-xs leading-relaxed text-slate-800">
        <p className="font-semibold text-slate-900">Silnik geometryczny</p>
        <p className="mt-1 text-slate-700">
          Te ustawienia sterują <strong className="font-medium text-slate-800">obliczeniami dopasowania</strong> (wymiary, kartony,
          symulacja układu). Nie mają związku z historią pakowań ani z „uczeniem” po statusach — statusy konfigurujesz w sekcji przepływu
          powyżej.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-800">
          Tolerancja wymiarów (mm)
          <input
            type="number"
            min={0}
            max={50}
            step={0.5}
            className={inputClass}
            value={config.dimensionToleranceMm}
            onChange={(e) => patchConfig({ dimensionToleranceMm: Number(e.target.value) })}
          />
          <Help>Dopuszczalny margines na niedokładność lub zaokrąglenia wymiarów produktu w katalogu.</Help>
        </label>

        <label className="block text-sm font-medium text-slate-800">
          Margines bezpieczeństwa (mm)
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            className={inputClass}
            value={config.safetyMarginMm}
            onChange={(e) => patchConfig({ safetyMarginMm: Number(e.target.value) })}
          />
          <Help>Wolna przestrzeń od ścianek kartonu (np. wypełniacz, folia).</Help>
        </label>

        <label className="block text-sm font-medium text-slate-800 sm:col-span-2">
          Redukcja wymiarów (%)
          <input
            type="number"
            min={0}
            max={30}
            step={1}
            className={inputClass}
            value={config.dimensionReductionPercent}
            onChange={(e) => patchConfig({ dimensionReductionPercent: Number(e.target.value) })}
          />
          <Help>
            Zmniejsza efektywny „gabaryt” produktu w symulacji (np. miękki towar). Wartości powyżej 30% są odrzucane przy zapisie.
          </Help>
        </label>
      </div>

      <label className="block text-sm font-medium text-slate-800">
        Strategia dopasowania
        <select
          className={selectClass}
          value={config.strategiaDopasowania}
          onChange={(e) => patchConfig({ strategiaDopasowania: e.target.value as ThreeDMatchingStrategy })}
        >
          {STRATEGY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Help>Kryterium wyboru najlepszego kartonu spośród dopuszczalnych kandydatów geometrycznych.</Help>
      </label>

      <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/40 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className={checkboxClass}
            checked={config.allowProductRotation}
            onChange={(e) => patchConfig({ allowProductRotation: e.target.checked })}
          />
          <span className="min-w-0 text-sm font-medium text-slate-900">Obracanie produktów w symulacji</span>
        </label>
        <p className="pl-7 text-xs leading-relaxed text-slate-500">
          Pozwala silnikowi rozważać orientację 3D produktów przy liczeniu dopasowania (jeśli dane na to pozwalają).
        </p>

        <label className="mt-2 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className={checkboxClass}
            checked={config.allowOperatorOverride}
            onChange={(e) => patchConfig({ allowOperatorOverride: e.target.checked })}
          />
          <span className="min-w-0 text-sm font-medium text-slate-900">Dozwolone nadpisanie przez operatora</span>
        </label>
        <p className="pl-7 text-xs leading-relaxed text-slate-500">
          Gdy wyłączone, UI może blokować zmianę kartonu względem propozycji 3D (do podpięcia pod backend).
        </p>
      </div>

      <label className="block text-sm font-medium text-slate-800">
        Minimalny poziom pewności (%)
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          className={inputClass}
          value={config.minConfidencePercent}
          onChange={(e) => patchConfig({ minConfidencePercent: Number(e.target.value) })}
        />
        <Help>Propozycje poniżej tego progu mogą być ukryte lub oznaczone jako niskiej jakości (logika po stronie silnika / API).</Help>
      </label>
    </div>
  );
}
