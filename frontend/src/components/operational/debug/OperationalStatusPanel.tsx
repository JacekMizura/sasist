import type { OperationalFeaturesDebugPayload } from "../../../api/operationalFeaturesApi";
import type { SseStatusLabel } from "../../../hooks/operational/useOperationalStatus";
import type { OperationalFeatureState } from "../../../services/operational/operationalFeatureGuard";
import { DirectSalesNetworkDebugSection } from "./DirectSalesNetworkDebugSection";

type Props = {
  features: OperationalFeatureState;
  debugBundle: OperationalFeaturesDebugPayload | null;
  backendReachable: boolean;
  sseStatus: SseStatusLabel;
  onRefresh?: () => void;
};

function Flag({ on }: { on: boolean }) {
  return (
    <span className={on ? "font-semibold text-emerald-700" : "text-slate-500"}>{on ? "ON" : "OFF"}</span>
  );
}

export function OperationalStatusPanel({
  features,
  debugBundle,
  backendReachable,
  sseStatus,
  onRefresh,
}: Props) {
  return (
    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/80 p-2 text-[10px] text-amber-950">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold uppercase tracking-wide">Status operacyjny (dev)</span>
        {onRefresh ? (
          <button type="button" onClick={onRefresh} className="rounded border border-amber-400 px-1.5 py-0.5">
            Odśwież
          </button>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <div className="flex justify-between">
          <dt>Direct sales</dt>
          <dd><Flag on={features.directSalesFlag} /></dd>
        </div>
        <div className="flex justify-between">
          <dt>Runtime</dt>
          <dd><Flag on={features.runtimeFlag} /></dd>
        </div>
        <div className="flex justify-between">
          <dt>Replenishment</dt>
          <dd><Flag on={features.replenishmentFlag} /></dd>
        </div>
        <div className="flex justify-between">
          <dt>Backend</dt>
          <dd>{backendReachable ? "YES" : "NO"}</dd>
        </div>
        <div className="flex justify-between col-span-2">
          <dt>SSE</dt>
          <dd className="font-medium">{sseStatus}</dd>
        </div>
      </dl>
      {features.rawPayload ? (
        <pre className="mt-1 max-h-16 overflow-auto rounded bg-white/60 p-1 font-mono text-[9px]">
          {JSON.stringify(features.rawPayload)}
        </pre>
      ) : null}
      {debugBundle ? (
        <details className="mt-1">
          <summary className="cursor-pointer font-medium">Resolver debug</summary>
          <pre className="mt-1 max-h-32 overflow-auto rounded bg-white/60 p-1 font-mono text-[9px]">
            {JSON.stringify(debugBundle, null, 2)}
          </pre>
        </details>
      ) : null}
      {features.blockedEndpoints.length ? (
        <p className="mt-1 text-amber-800">Blocked: {features.blockedEndpoints.join(", ")}</p>
      ) : null}
      <DirectSalesNetworkDebugSection />
    </div>
  );
}
