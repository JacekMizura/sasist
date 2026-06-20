import type { OrderAutomationExecution, OrderAutomationManualTrigger, OrderAutomationRunMode } from "../../../types/orderAutomation";
import { flatSectionDividerClass } from "../../layout/flatSectionTokens";
import { isScheduleWindowValid } from "../../../utils/orderAutomationValidation";
import { oaInp, oaInpDense, oaLbl } from "./orderAutomationUiTokens";

const DAY_ROWS: { day: number; label: string }[] = [
  { day: 1, label: "Pn" },
  { day: 2, label: "Wt" },
  { day: 3, label: "Śr" },
  { day: 4, label: "Cz" },
  { day: 5, label: "Pt" },
  { day: 6, label: "So" },
  { day: 7, label: "Nd" },
];

type Props = {
  automatic: boolean;
  manualEnabled: boolean;
  manualTrigger: OrderAutomationManualTrigger;
  runMode: OrderAutomationRunMode;
  windowFrom: string;
  windowTo: string;
  activeDays: number[];
  delayMinutes: number;
  showValidation?: boolean;
  onChange: (patch: {
    automatic?: boolean;
    manualEnabled?: boolean;
    manualTrigger?: Partial<OrderAutomationManualTrigger>;
    delayMinutes?: number;
    runMode?: OrderAutomationRunMode;
    windowFrom?: string;
    windowTo?: string;
    activeDays?: number[];
  }) => void;
};

export function AutomationExecutionSettingsSection({
  automatic,
  manualEnabled,
  manualTrigger,
  runMode,
  windowFrom,
  windowTo,
  activeDays,
  delayMinutes,
  showValidation = false,
  onChange,
}: Props) {
  const toggleDay = (day: number) => {
    const set = new Set(activeDays);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    onChange({ activeDays: [...set].sort((a, b) => a - b) });
  };

  const launchInvalid = showValidation && !automatic && !manualEnabled;
  const scheduleInvalid =
    automatic && runMode !== "continuous" && !isScheduleWindowValid(runMode, windowFrom, windowTo);

  return (
    <section className="w-full space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Ustawienia wykonania</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          System obserwuje zmiany w zamówieniach, produktach, WMS, dokumentach itd. Jeżeli warunki są spełnione,
          wykonywane są efekty.
        </p>
      </div>
      <div className={flatSectionDividerClass} aria-hidden />

      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-900">Uruchamianie</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
              checked={automatic}
              onChange={() => onChange({ automatic: !automatic })}
            />
            Automatycznie
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
              checked={manualEnabled}
              onChange={() => onChange({ manualEnabled: !manualEnabled })}
            />
            Ręcznie
          </label>
        </div>
        {launchInvalid ? (
          <p className="text-sm text-red-600">Automatyzacja musi mieć przynajmniej jeden sposób uruchamiania.</p>
        ) : null}
      </div>

      {automatic ? (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-800">Uruchamianie automatyczne</p>

          <div className="flex flex-wrap items-center gap-2">
            <label className={`${oaLbl} mb-0 shrink-0`}>Opóźnij wykonanie o</label>
            <input
              type="number"
              min={0}
              step={1}
              className={`${oaInpDense} w-24`}
              value={delayMinutes}
              onChange={(e) => onChange({ delayMinutes: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            />
            <span className="text-sm text-slate-600">minut</span>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-800">Tryb działania</p>
            <div className="flex flex-col gap-2">
              {(
                [
                  { id: "continuous" as const, label: "Ciągły" },
                  { id: "hours_only" as const, label: "Tylko w określonych godzinach" },
                  { id: "days_and_hours" as const, label: "Tylko w określonych dniach i godzinach" },
                ] as const
              ).map((opt) => (
                <label key={opt.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="runMode"
                    className="h-4 w-4 border-slate-300 text-slate-900"
                    checked={runMode === opt.id}
                    onChange={() => onChange({ runMode: opt.id })}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {runMode !== "continuous" ? (
            <div className="space-y-3">
              {runMode === "days_and_hours" ? (
                <div>
                  <p className={`${oaLbl} mb-2`}>Dni tygodnia</p>
                  <div className="flex flex-wrap gap-2">
                    {DAY_ROWS.map(({ day, label }) => {
                      const on = activeDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          className={`h-9 min-w-[2.75rem] rounded-lg border px-3 text-sm font-medium transition ${
                            on
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                          onClick={() => toggleDay(day)}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {showValidation && activeDays.length === 0 ? (
                    <p className="mt-2 text-xs text-red-600">Wybierz co najmniej jeden dzień tygodnia.</p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-end gap-4">
                <label className={oaLbl}>
                  Godzina od
                  <input
                    type="time"
                    className={`${oaInp} mt-1 w-36 ${scheduleInvalid && showValidation ? "border-red-400" : ""}`}
                    value={windowFrom}
                    onChange={(e) => onChange({ windowFrom: e.target.value || "08:00" })}
                  />
                </label>
                <label className={oaLbl}>
                  Godzina do
                  <input
                    type="time"
                    className={`${oaInp} mt-1 w-36 ${scheduleInvalid && showValidation ? "border-red-400" : ""}`}
                    value={windowTo}
                    onChange={(e) => onChange({ windowTo: e.target.value || "16:00" })}
                  />
                </label>
              </div>
              {scheduleInvalid && showValidation ? (
                <p className="text-sm text-red-600">Godzina końcowa musi być większa od początkowej.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {manualEnabled ? (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-800">Uruchamianie ręczne</p>

          <label className={oaLbl}>
            Nazwa przycisku
            <input
              type="text"
              className={`${oaInp} mt-1 max-w-md`}
              value={manualTrigger.label}
              placeholder="np. Wyślij ponownie"
              onChange={(e) => onChange({ manualTrigger: { label: e.target.value } })}
            />
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Widoczność</p>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                checked={manualTrigger.visibleOnOrderList !== false}
                onChange={() =>
                  onChange({
                    manualTrigger: { visibleOnOrderList: manualTrigger.visibleOnOrderList === false },
                  })
                }
              />
              Lista zamówień
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                checked={manualTrigger.visibleOnOrderCard !== false}
                onChange={() =>
                  onChange({
                    manualTrigger: { visibleOnOrderCard: manualTrigger.visibleOnOrderCard === false },
                  })
                }
              />
              Karta zamówienia
            </label>
          </div>
        </div>
      ) : null}
    </section>
  );
}
