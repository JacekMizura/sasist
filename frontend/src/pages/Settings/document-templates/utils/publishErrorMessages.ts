import type { ValidationReport } from "../../../../api/documentTemplatesApi";
import { extractApiErrorMessage } from "../../../../api/apiErrorMessage";
import { translateValidationIssue } from "./twigErrorMessages";

export function extractValidationReportFromError(err: unknown): ValidationReport | null {
  if (!err || typeof err !== "object" || !("response" in err)) return null;
  const data = (err as { response?: { data?: unknown } }).response?.data;
  if (!data || typeof data !== "object" || !("detail" in data)) return null;
  const detail = (data as { detail?: unknown }).detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const validation = (detail as { validation?: unknown }).validation;
  if (!validation || typeof validation !== "object" || Array.isArray(validation)) return null;
  const v = validation as { ok?: unknown; issues?: unknown };
  if (!Array.isArray(v.issues)) return null;
  return {
    ok: Boolean(v.ok),
    issues: v.issues as ValidationReport["issues"],
  };
}

export function formatValidationBlockMessage(report: ValidationReport): string {
  if (report.ok) return "Walidacja zakończona pomyślnie.";
  const first = report.issues[0];
  if (!first) return "Walidacja przed publikacją nie powiodła się.";
  return translateValidationIssue(first).message;
}

export function formatPublishError(err: unknown, validation?: ValidationReport | null): string {
  const fromErr = extractValidationReportFromError(err);
  if (fromErr && !fromErr.ok) {
    return formatValidationBlockMessage(fromErr);
  }
  if (validation && !validation.ok) {
    return formatValidationBlockMessage(validation);
  }
  const raw = extractApiErrorMessage(err, "");
  if (raw) return raw;
  return "Publikacja nie powiodła się.";
}
