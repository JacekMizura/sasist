/**
 * WarehouseDesigner load diagnostics — timing per stage (console).
 * Enabled: DEV or ?designer_perf=1 or localStorage wms-designer-perf=1
 */

const PERF_PREFIX = "[WarehouseDesigner PERF]";

export type DesignerPerfRow = {
  stage: string;
  ms: number;
  count: number;
};

type RowAcc = {
  totalMs: number;
  count: number;
  lastStart?: number;
};

class DesignerLoadPerfSession {
  private rows = new Map<string, RowAcc>();
  private sessionStartMs = performance.now();
  private summaryPrinted = false;

  reset(): void {
    this.rows.clear();
    this.sessionStartMs = performance.now();
    this.summaryPrinted = false;
  }

  markSessionStart(label = "sesja Magazyn"): void {
    this.sessionStartMs = performance.now();
    console.log(`${PERF_PREFIX} START ${label}`);
  }

  start(stage: string): void {
    console.log(`${PERF_PREFIX} START ${stage}`);
    const row = this.rows.get(stage) ?? { totalMs: 0, count: 0 };
    row.lastStart = performance.now();
    this.rows.set(stage, row);
  }

  end(stage: string): number {
    const row = this.rows.get(stage);
    const now = performance.now();
    let ms = 0;
    if (row?.lastStart != null) {
      ms = now - row.lastStart;
      row.totalMs += ms;
      row.count += 1;
      row.lastStart = undefined;
      this.rows.set(stage, row);
    } else {
      const acc = this.rows.get(stage) ?? { totalMs: 0, count: 0 };
      acc.totalMs += ms;
      acc.count += 1;
      this.rows.set(stage, acc);
    }
    console.log(`${PERF_PREFIX} KONIEC ${stage} CZAS ${ms.toFixed(1)} ms`);
    return ms;
  }

  /** Hot paths (e.g. usedVolumeAtBin × N) — no per-call START/KONIEC spam. */
  accumulate(stage: string, ms: number): void {
    if (ms <= 0) return;
    const row = this.rows.get(stage) ?? { totalMs: 0, count: 0 };
    row.totalMs += ms;
    row.count += 1;
    this.rows.set(stage, row);
  }

  record(stage: string, ms: number): void {
    const row = this.rows.get(stage) ?? { totalMs: 0, count: 0 };
    row.totalMs += ms;
    row.count += 1;
    this.rows.set(stage, row);
    console.log(`${PERF_PREFIX} KONIEC ${stage} CZAS ${ms.toFixed(1)} ms`);
  }

  elapsedSinceSessionStart(): number {
    return performance.now() - this.sessionStartMs;
  }

  getSortedRows(): DesignerPerfRow[] {
    return [...this.rows.entries()]
      .map(([stage, { totalMs, count }]) => ({ stage, ms: totalMs, count }))
      .sort((a, b) => b.ms - a.ms);
  }

  printSummary(title: string, options?: { force?: boolean }): void {
    if (this.summaryPrinted && !options?.force) return;
    this.summaryPrinted = true;
    const sorted = this.getSortedRows();
    const wallMs = this.elapsedSinceSessionStart();
    console.log(`${PERF_PREFIX} ===== ${title} =====`);
    console.log(`${PERF_PREFIX} Tabela (od najwolniejszego):`);
    console.table(
      sorted.map((r) => ({
        Etap: r.stage,
        "Czas (ms)": r.ms.toFixed(1),
        Wywołania: r.count,
      })),
    );
    console.log(`${PERF_PREFIX} Czas ścienny od startu sesji: ${wallMs.toFixed(1)} ms`);
    (
      window as unknown as { __warehouseDesignerPerf?: { title: string; rows: DesignerPerfRow[]; wallMs: number } }
    ).__warehouseDesignerPerf = { title, rows: sorted, wallMs };
  }
}

let activeSession: DesignerLoadPerfSession | null = null;

export function isDesignerPerfEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    if (typeof window === "undefined") return false;
    if (new URLSearchParams(window.location.search).get("designer_perf") === "1") return true;
    if (window.localStorage.getItem("wms-designer-perf") === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** One-time hint in console (prod needs ?designer_perf=1). */
export function logDesignerPerfHint(): void {
  if (!isDesignerPerfEnabled()) return;
  console.info(
    `${PERF_PREFIX} Profilowanie włączone. Po załadowaniu Magazynu zobacz tabelę w konsoli lub window.__warehouseDesignerPerf`,
  );
}

export function getDesignerLoadPerf(enabled?: boolean): DesignerLoadPerfSession | null {
  const on = enabled ?? isDesignerPerfEnabled();
  if (!on) return null;
  if (!activeSession) activeSession = new DesignerLoadPerfSession();
  return activeSession;
}

export function resetDesignerLoadPerf(): void {
  activeSession?.reset();
  activeSession = null;
}

export function measureDesignerMemo<T>(perf: DesignerLoadPerfSession | null, stage: string, fn: () => T): T {
  if (!perf) return fn();
  perf.start(stage);
  try {
    return fn();
  } finally {
    perf.end(stage);
  }
}
