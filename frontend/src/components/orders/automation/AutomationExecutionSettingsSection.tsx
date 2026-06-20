import type { OrderAutomationExecution, OrderAutomationRunMode } from "../../../types/orderAutomation";
import { flatSectionDividerClass } from "../../layout/flatSectionTokens";
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
  runMode: OrderAutomationRunMode;
  windowFrom: string;
  windowTo: string;
  activeDays: number[];
  delayMinutes: number;
  onChange: (patch: Partial<OrderAutomationExecution> & { delayMinutes?: number }) => void;
};

export function AutomationExecutionSettingsSection({
  automatic,
  runMode,
  windowFrom,
  windowTo,
  activeDays,
  delayMinutes,
  onChange,
}: Props) {
  const toggleDay = (day: number) => {
    const set = new Set(activeDays);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    onChange({ activeDays: [...set].sort((a, b) => a - b) });
  };

  return (
    <section className="w-full space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Ustawienia wykonania</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          Silnik obserwuje zmiany w systemie i wykonuje regułę, gdy warunki są spełnione.
        </p>
      </div>
      <div className={flatSectionDividerClass} aria-hidden />

      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
          checked={automatic}
          onChange={() => onChange({ automatic: !automatic })}
        />
        Automatycznie
      </label>

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

      {automatic ? (
        <div className="space-y-4">
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

          {runMode !== "continuous" ? (
            <div className="flex flex-wrap items-end gap-4">
              <label className={oaLbl}>
                Godzina od
                <input
                  type="time"
                  className={`${oaInp} mt-1 w-36`}
                  value={windowFrom}
                  onChange={(e) => onChange({ windowFrom: e.target.value || "08:00" })}
                />
              </label>
              <label className={oaLbl}>
                Godzina do
                <input
                  type="time"
                  className={`${oaInp} mt-1 w-36`}
                  value={windowTo}
                  onChange={(e) => onChange({ windowTo: e.target.value || "16:00" })}
                />
              </label>
            </div>
          ) : null}

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
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-600">Reguła wymaga ręcznego uruchomienia przez operatora.</p>
      )}
    </section>
  );
}
