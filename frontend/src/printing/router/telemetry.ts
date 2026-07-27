/**
 * In-process migration telemetry (session). Stage 5 Cleanup: optionally ship to backend.
 */

export type PrintTelemetryCounters = {
  printed_via_agent: number;
  printed_via_qz: number;
  printed_via_browser: number;
  printed_via_pdf: number;
  rollback_count: number;
  unsupported_capability: number;
  fallback_reason: Record<string, number>;
};

const STORAGE_KEY = "sasist.print.telemetry.v1";

function empty(): PrintTelemetryCounters {
  return {
    printed_via_agent: 0,
    printed_via_qz: 0,
    printed_via_browser: 0,
    printed_via_pdf: 0,
    rollback_count: 0,
    unsupported_capability: 0,
    fallback_reason: {},
  };
}

function load(): PrintTelemetryCounters {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as PrintTelemetryCounters;
    return { ...empty(), ...parsed, fallback_reason: { ...empty().fallback_reason, ...parsed.fallback_reason } };
  } catch {
    return empty();
  }
}

function save(state: PrintTelemetryCounters): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

let state = typeof sessionStorage !== "undefined" ? load() : empty();

export function getPrintTelemetry(): PrintTelemetryCounters {
  return {
    ...state,
    fallback_reason: { ...state.fallback_reason },
  };
}

export function resetPrintTelemetry(): void {
  state = empty();
  save(state);
}

export function trackPrintedVia(transport: "agent" | "qz" | "browser" | "download"): void {
  if (transport === "agent") state.printed_via_agent += 1;
  else if (transport === "qz") state.printed_via_qz += 1;
  else if (transport === "browser") state.printed_via_browser += 1;
  else state.printed_via_pdf += 1;
  save(state);
}

export function trackFallbackReason(reason: string | null | undefined): void {
  if (!reason) return;
  state.fallback_reason[reason] = (state.fallback_reason[reason] ?? 0) + 1;
  if (reason === "unsupported_capability") state.unsupported_capability += 1;
  if (reason === "flag_off") state.rollback_count += 1;
  save(state);
}
