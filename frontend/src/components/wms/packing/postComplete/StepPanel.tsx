import { useEffect, useState } from "react";
import { StepContent } from "./StepContent";

const STEP_MS = 3000;
const TRANS_MS = 400;

export function StepPanel() {
  const [stepIndex, setStepIndex] = useState(0);
  const [anim, setAnim] = useState<"in" | "out">("in");

  useEffect(() => {
    if (stepIndex >= 3) return;
    const id = window.setTimeout(() => setAnim("out"), STEP_MS);
    return () => window.clearTimeout(id);
  }, [stepIndex]);

  useEffect(() => {
    if (anim !== "out" || stepIndex >= 3) return;
    const id = window.setTimeout(() => {
      setStepIndex((s) => s + 1);
      setAnim("in");
    }, TRANS_MS);
    return () => window.clearTimeout(id);
  }, [anim, stepIndex]);

  return (
    <div className="relative min-h-[240px] overflow-hidden rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm sm:min-h-[280px]">
      <div
        key={stepIndex}
        className={anim === "out" ? "wms-postpack-step-leave" : "wms-postpack-step-enter"}
      >
        <StepContent stepIndex={stepIndex} />
      </div>
    </div>
  );
}
