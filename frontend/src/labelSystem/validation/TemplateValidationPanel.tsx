import { useState } from "react";
import type { ValidationResult, ValidationIssue } from "./validationTypes";

export type TemplateValidationPanelProps = {
  result: ValidationResult;
  onSelectElement?: (elementId: string) => void;
};

function IssueList({
  issues,
  severity,
  icon,
  label,
  onSelectElement,
}: {
  issues: ValidationIssue[];
  severity: "error" | "warning" | "info";
  icon: string;
  label: string;
  onSelectElement?: (elementId: string) => void;
}) {
  if (issues.length === 0) return null;
  const bg =
    severity === "error"
      ? "bg-red-50 border-red-100"
      : severity === "warning"
        ? "bg-amber-50 border-amber-100"
        : "bg-slate-50 border-slate-100";
  const text =
    severity === "error"
      ? "text-red-800"
      : severity === "warning"
        ? "text-amber-800"
        : "text-slate-700";
  return (
    <div className={`rounded-lg border ${bg} overflow-hidden`}>
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:opacity-90"
        onClick={() => {}}
      >
        <span aria-hidden>{icon}</span>
        <span>{label} ({issues.length})</span>
      </button>
      <ul className="list-none divide-y divide-slate-200/60">
        {issues.map((issue, i) => (
          <li key={`${issue.code}-${issue.elementId ?? i}`}>
            <button
              type="button"
              className={`w-full text-left px-3 py-2 text-[11px] ${text} ${issue.elementId && onSelectElement ? "cursor-pointer hover:bg-black/5" : ""}`}
              onClick={() => issue.elementId && onSelectElement?.(issue.elementId)}
              title={issue.elementId ? "Kliknij, aby zaznaczyć element" : undefined}
            >
              <span className="block">{issue.message}</span>
              {issue.elementId && (
                <span className="text-[10px] text-slate-500 mt-0.5 block font-mono">
                  {issue.elementId}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TemplateValidationPanel({
  result,
  onSelectElement,
}: TemplateValidationPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const hasAny =
    result.errors.length > 0 ||
    result.warnings.length > 0 ||
    result.info.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between w-full text-left text-xs font-black uppercase tracking-wide text-slate-600 hover:text-slate-800"
      >
        <span>Walidacja</span>
        <span className="text-slate-400">{collapsed ? "▶" : "▼"}</span>
      </button>
      {!collapsed && (
        <>
          {!hasAny && result.valid && (
            <p className="text-[11px] text-slate-500 px-1">Brak uwag — szablon jest poprawny.</p>
          )}
          {!hasAny && !result.valid && (
            <p className="text-[11px] text-slate-500 px-1">Brak szczegółowych komunikatów.</p>
          )}
          <div className="flex flex-col gap-2">
            <IssueList
              issues={result.errors}
              severity="error"
              icon="❌"
              label="Błędy"
              onSelectElement={onSelectElement}
            />
            <IssueList
              issues={result.warnings}
              severity="warning"
              icon="⚠"
              label="Ostrzeżenia"
              onSelectElement={onSelectElement}
            />
            <IssueList
              issues={result.info}
              severity="info"
              icon="ℹ"
              label="Informacje"
              onSelectElement={onSelectElement}
            />
          </div>
        </>
      )}
    </div>
  );
}
