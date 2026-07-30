import { Clock, Hand, Zap } from "lucide-react";

import type {
  OrderAutomationManualTrigger,
  OrderAutomationRunMode,
} from "../../../types/orderAutomation";
import { isScheduleWindowValid } from "../../../utils/orderAutomationValidation";
import { AutomationManualTriggerSection } from "./AutomationManualTriggerSection";
import {
  oaDayScheduleCardClass,
  oaEditorHeaderCardClass,
  oaInp,
  oaInpDense,
  oaLaunchTileClass,
} from "./orderAutomationUiTokens";

const DAY_ROWS: { day: number; short: string; full: string }[] = [
  { day: 1, short: "Pn", full: "Poniedziałek" },
  { day: 2, short: "Wt", full: "Wtorek" },
  { day: 3, short: "Śr", full: "Środa" },
  { day: 4, short: "Cz", full: "Czwartek" },
  { day: 5, short: "Pt", full: "Piątek" },
  { day: 6, short: "So", full: "Sobota" },
  { day: 7, short: "Nd", full: "Niedziela" },
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

function TimeField({
  value,
  invalid,
  onChange,
}: {
  value: string;
  invalid?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <input
        type="time"
        className={`${oaInp} w-[7.5rem] pr-9 ${invalid ? "border-red-400" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value || "08:00")}
      />
      <Clock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

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

  const patchManual = (p: Partial<OrderAutomationManualTrigger>) => onChange({ manualTrigger: p });

  const selectAutomatic = () => onChange({ automatic: !automatic });
  const selectManual = () => {
    const next = !manualEnabled;
    onChange({
      manualEnabled: next,
      manualTrigger: {
        enabled: next,
        ...(next ? { buttonEnabled: true } : {}),
      },
    });
  };

  const selectedDays = DAY_ROWS.filter((d) => activeDays.includes(d.day));
  const showSchedulePanel = automatic && runMode !== "continuous";

  return (
    <section className="w-full space-y-4">
      <div className={`${oaEditorHeaderCardClass} space-y-5`}>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Ustawienia wykonania</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">
            System obserwuje zmiany w zamówieniach, produktach, WMS, dokumentach itd. Jeżeli warunki są
            spełnione, wykonywane są efekty.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" className={oaLaunchTileClass(automatic)} onClick={selectAutomatic}>
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                automatic ? "border-orange-500" : "border-slate-300"
              }`}
              aria-hidden
            >
              {automatic ? <span className="h-2 w-2 rounded-full bg-orange-500" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm font-semibold ${automatic ? "text-orange-700" : "text-slate-900"}`}>
                Automatycznie
              </span>
              <span className="mt-0.5 block text-sm leading-snug text-slate-500">
                Wykonuje się samo, gdy zajdą określone zdarzenia.
              </span>
            </span>
            <Zap
              className={`mt-0.5 h-5 w-5 shrink-0 ${automatic ? "text-orange-400" : "text-slate-300"}`}
              strokeWidth={1.75}
              aria-hidden
            />
          </button>

          <button type="button" className={oaLaunchTileClass(manualEnabled)} onClick={selectManual}>
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                manualEnabled ? "border-orange-500" : "border-slate-300"
              }`}
              aria-hidden
            >
              {manualEnabled ? <span className="h-2 w-2 rounded-full bg-orange-500" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block text-sm font-semibold ${manualEnabled ? "text-orange-700" : "text-slate-900"}`}
              >
                Ręcznie (Przycisk)
              </span>
              <span className="mt-0.5 block text-sm leading-snug text-slate-500">
                Uruchamiane ręcznie z poziomu karty zamówienia.
              </span>
            </span>
            <Hand
              className={`mt-0.5 h-5 w-5 shrink-0 ${manualEnabled ? "text-orange-400" : "text-slate-300"}`}
              strokeWidth={1.75}
              aria-hidden
            />
          </button>
        </div>

        {launchInvalid ? (
          <p className="text-sm text-red-600">Automatyzacja musi mieć przynajmniej jeden sposób uruchamiania.</p>
        ) : null}

        {automatic ? (
          <div
            className={`grid gap-8 border-t border-slate-100 pt-5 ${
              showSchedulePanel ? "lg:grid-cols-2" : ""
            }`}
          >
            <div className="space-y-5">
              <p className="text-sm font-semibold text-slate-900">Uruchamianie automatyczne</p>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-700">Opóźnij wykonanie o</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={`${oaInpDense} w-20 text-center`}
                  value={delayMinutes}
                  onChange={(e) =>
                    onChange({ delayMinutes: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                  }
                />
                <span className="text-sm text-slate-600">minut</span>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-800">Tryb działania</p>
                <div className="flex flex-col gap-2.5">
                  {(
                    [
                      { id: "continuous" as const, label: "Ciągły (24/7)" },
                      { id: "hours_only" as const, label: "Tylko w określonych godzinach" },
                      { id: "days_and_hours" as const, label: "Tylko w określonych dniach i godzinach" },
                    ] as const
                  ).map((opt) => (
                    <label key={opt.id} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-800">
                      <input
                        type="radio"
                        name="runMode"
                        className="h-4 w-4 border-slate-300 text-orange-500 focus:ring-orange-400"
                        checked={runMode === opt.id}
                        onChange={() => onChange({ runMode: opt.id })}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {runMode === "hours_only" ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-800">Godziny działania</p>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-slate-500">Od</span>
                  <TimeField
                    value={windowFrom}
                    invalid={scheduleInvalid && showValidation}
                    onChange={(v) => onChange({ windowFrom: v })}
                  />
                  <span className="text-sm text-slate-500">Do</span>
                  <TimeField
                    value={windowTo}
                    invalid={scheduleInvalid && showValidation}
                    onChange={(v) => onChange({ windowTo: v })}
                  />
                </div>
              </div>
            ) : null}

            {runMode === "days_and_hours" ? (
              <div className="space-y-4">
                <p className="text-sm font-medium text-slate-800">Wybierz dni i dostosuj godziny</p>
                <div className="grid grid-cols-7 gap-2">
                  {DAY_ROWS.map(({ day, short }) => {
                    const on = activeDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        className={`flex h-10 w-full items-center justify-center rounded-lg border text-sm font-semibold transition ${
                          on
                            ? "border-orange-500 bg-orange-500 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                        }`}
                        onClick={() => toggleDay(day)}
                      >
                        {short}
                      </button>
                    );
                  })}
                </div>
                {showValidation && activeDays.length === 0 ? (
                  <p className="text-xs text-red-600">Wybierz co najmniej jeden dzień tygodnia.</p>
                ) : null}

                {selectedDays.length > 0 ? (
                  <div className="space-y-2">
                    {selectedDays.map(({ day, full }) => (
                      <div key={day} className={oaDayScheduleCardClass}>
                        <span className="min-w-[6.5rem] flex-1 text-sm font-medium text-slate-800">{full}</span>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-sm text-slate-500">Od</span>
                          <TimeField
                            value={windowFrom}
                            invalid={scheduleInvalid && showValidation}
                            onChange={(v) => onChange({ windowFrom: v })}
                          />
                          <span className="text-sm text-slate-500">Do</span>
                          <TimeField
                            value={windowTo}
                            invalid={scheduleInvalid && showValidation}
                            onChange={(v) => onChange({ windowTo: v })}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {scheduleInvalid && showValidation && automatic ? (
          <p className="text-sm text-red-600">Godzina końcowa musi być większa od początkowej.</p>
        ) : null}
      </div>

      {manualEnabled ? (
        <AutomationManualTriggerSection manualTrigger={manualTrigger} onChange={patchManual} />
      ) : null}
    </section>
  );
}
