export type ParsedPrintJobError = {
  technical: string;
  friendly: string;
  suggestion: string;
  raw: string;
};

export function parsePrintJobError(message: string | null | undefined): ParsedPrintJobError | null {
  if (!message) return null;

  try {
    const parsed = JSON.parse(message) as Record<string, unknown>;
    if (parsed && typeof parsed.friendly === "string") {
      return {
        technical: String(parsed.technical ?? message),
        friendly: String(parsed.friendly),
        suggestion: String(parsed.suggestion ?? ""),
        raw: message,
      };
    }
  } catch {
    /* legacy plain-text error_message */
  }

  return {
    technical: message,
    friendly: message,
    suggestion: "",
    raw: message,
  };
}

export function printJobErrorSummary(message: string | null | undefined): string {
  const parsed = parsePrintJobError(message);
  if (!parsed) return "—";
  return parsed.friendly || parsed.technical || "—";
}
