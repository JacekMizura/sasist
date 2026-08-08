import {
  type ThreeDMatchingStrategy,
  type WmsThreeDEngineLocalConfigV1,
} from "./wmsThreeDEngineLocalConfig";
import {
  WmsBoolSettingRow,
  WmsControlSettingRow,
  WmsSettingCapabilityFooter,
  wmsSettingControlInputClass,
  wmsSettingControlSelectClass,
  wmsSettingsRowsStackClass,
} from "./wmsSettingsUi";

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
    <div className={wmsSettingsRowsStackClass}>
      <div className="rounded-lg border border-cyan-200/60 bg-cyan-50/30 px-3 py-3 text-xs leading-relaxed text-slate-800">
        <p className="font-semibold text-slate-900">Silnik geometryczny</p>
        <p className="mt-1 text-slate-700">
          Te ustawienia sterują obliczeniami dopasowania (wymiary, kartony, symulacja układu). Statusy konfigurujesz w sekcji
          przepływu powyżej.
        </p>
      </div>

      <WmsControlSettingRow
        label="Tolerancja wymiarów (mm)"
        hint="Dopuszczalny margines na niedokładność lub zaokrąglenia wymiarów produktu w katalogu."
      >
        <input
          type="number"
          min={0}
          max={50}
          step={0.5}
          className={wmsSettingControlInputClass}
          value={config.dimensionToleranceMm}
          onChange={(e) => patchConfig({ dimensionToleranceMm: Number(e.target.value) })}
        />
      </WmsControlSettingRow>

      <WmsControlSettingRow
        label="Margines bezpieczeństwa (mm)"
        hint="Wolna przestrzeń od ścianek kartonu (np. wypełniacz, folia)."
      >
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          className={wmsSettingControlInputClass}
          value={config.safetyMarginMm}
          onChange={(e) => patchConfig({ safetyMarginMm: Number(e.target.value) })}
        />
      </WmsControlSettingRow>

      <WmsControlSettingRow
        label="Redukcja wymiarów (%)"
        hint="Zmniejsza efektywny gabaryt produktu w symulacji (np. miękki towar). Wartości powyżej 30% są odrzucane przy zapisie."
      >
        <input
          type="number"
          min={0}
          max={30}
          step={1}
          className={wmsSettingControlInputClass}
          value={config.dimensionReductionPercent}
          onChange={(e) => patchConfig({ dimensionReductionPercent: Number(e.target.value) })}
        />
      </WmsControlSettingRow>

      <WmsControlSettingRow
        label="Strategia dopasowania"
        hint="Kryterium wyboru najlepszego kartonu spośród dopuszczalnych kandydatów geometrycznych."
      >
        <select
          className={wmsSettingControlSelectClass}
          value={config.strategiaDopasowania}
          onChange={(e) => patchConfig({ strategiaDopasowania: e.target.value as ThreeDMatchingStrategy })}
        >
          {STRATEGY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </WmsControlSettingRow>

      <WmsBoolSettingRow
        label="Obracanie produktów w symulacji"
        hint="Pozwala silnikowi rozważać orientację 3D produktów przy liczeniu dopasowania."
        checked={config.allowProductRotation}
        onChange={(allowProductRotation) => patchConfig({ allowProductRotation })}
      />

      <WmsBoolSettingRow
        label="Dozwolone nadpisanie przez operatora"
        hint="Gdy wyłączone, UI może blokować zmianę kartonu względem propozycji 3D."
        footer={<WmsSettingCapabilityFooter capability="partial" capabilityNote="do podpięcia pod backend." />}
        checked={config.allowOperatorOverride}
        onChange={(allowOperatorOverride) => patchConfig({ allowOperatorOverride })}
      />

      <WmsControlSettingRow
        label="Minimalny poziom pewności (%)"
        hint="Propozycje poniżej tego progu mogą być ukryte lub oznaczone jako niskiej jakości."
      >
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          className={wmsSettingControlInputClass}
          value={config.minConfidencePercent}
          onChange={(e) => patchConfig({ minConfidencePercent: Number(e.target.value) })}
        />
      </WmsControlSettingRow>
    </div>
  );
}
