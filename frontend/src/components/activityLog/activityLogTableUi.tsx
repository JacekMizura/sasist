import { Bot, Plug, User } from "lucide-react";

export type ActivityLogPageSize = 25 | 50 | 100;

export const ACTIVITY_LOG_PAGE_SIZE_OPTIONS: ActivityLogPageSize[] = [25, 50, 100];

export function normalizeActivitySeverity(
  raw?: string,
): "success" | "error" | "warning" | "info" {
  const s = (raw ?? "").trim().toUpperCase();
  if (s === "ERROR" || s === "ERR" || s === "FAILURE" || s === "FAIL") return "error";
  if (s === "WARNING" || s === "WARN") return "warning";
  if (s === "SUCCESS" || s === "OK" || s === "AUDIT") return "success";
  return "info";
}

export function ActivityLogStatusBadge({ severity }: { severity?: string }) {
  const tone = normalizeActivitySeverity(severity);
  const cfg =
    tone === "error"
      ? { label: "Błąd", cls: "bg-red-50 text-red-700", dot: "bg-red-500" }
      : tone === "warning"
        ? { label: "Ostrzeżenie", cls: "bg-amber-50 text-amber-800", dot: "bg-amber-400" }
        : tone === "success"
          ? { label: "Wykonano", cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" }
          : { label: "Informacja", cls: "bg-sky-50 text-sky-700", dot: "bg-sky-500" };

  return (
    <span
      className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none ${cfg.cls}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} aria-hidden />
      {cfg.label}
    </span>
  );
}

export function ActivityLogOperatorCell({ name }: { name: string }) {
  const n = name.trim();
  const lower = n.toLowerCase();
  const isSystem = lower === "system" || lower.startsWith("system ");
  const isIntegration =
    lower.includes("integracj") || lower.includes("api") || lower.includes("webhook");
  const Icon = isSystem ? Bot : isIntegration ? Plug : User;

  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
      <span className="truncate">{n || "System"}</span>
    </span>
  );
}

export function ActivityLogPaginationBar({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: ActivityLogPageSize;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: ActivityLogPageSize) => void;
}) {
  if (total <= 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12px] text-slate-600">
      <label className="inline-flex items-center gap-1.5">
        <span>Wyników na stronę</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value) as ActivityLogPageSize)}
          className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[12px] font-medium text-slate-800 outline-none focus:border-slate-400"
        >
          {ACTIVITY_LOG_PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="font-medium text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Poprzednia
        </button>
        <span className="tabular-nums text-slate-500">
          strona <span className="font-semibold text-slate-800">{page}</span> z{" "}
          <span className="font-semibold text-slate-800">{pageCount}</span>
        </span>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
          className="font-semibold text-orange-600 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Następna
        </button>
      </div>
    </div>
  );
}
