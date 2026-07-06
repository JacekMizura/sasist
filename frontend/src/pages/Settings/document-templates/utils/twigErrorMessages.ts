import type { ValidationIssue } from "../../../../api/documentTemplatesApi";

const CODE_MESSAGES: Record<string, string> = {
  syntax_error: "Błąd składni szablonu.",
  unexpected_end_of_statement_block: "Nie zamknięto znacznika bloku ({% … %}).",
  unexpected_end_of_print_statement: "Nie zamknięto wyrażenia ({{ … }}).",
  unexpected_end_of_comment: "Nie zamknięto komentarza ({# … #}).",
  invalid_token: "Nieprawidłowy token w szablonie.",
  unknown_tag: "Nieznany tag Twig.",
  unknown_filter: "Nieznany filtr Twig.",
  unknown_function: "Nieznana funkcja Twig.",
  TemplateSyntaxError: "Błąd składni szablonu Twig.",
};

const FRAGMENT_HINTS: Record<string, string> = {
  unexpected_end_of_statement_block: "Sprawdź, czy nie brakuje {% endblock %}, {% endif %}, {% endfor %} lub %}",
  unexpected_end_of_print_statement: "Sprawdź, czy nie brakuje }}",
  unexpected_end_of_comment: "Sprawdź, czy nie brakuje #}",
};

function translateRawMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("unexpected end of statement block")) {
    return CODE_MESSAGES.unexpected_end_of_statement_block;
  }
  if (lower.includes("unexpected end of print")) {
    return CODE_MESSAGES.unexpected_end_of_print_statement;
  }
  if (lower.includes("invalid token")) {
    return CODE_MESSAGES.invalid_token;
  }
  if (lower.includes("syntax error") || lower.includes("syntax_error")) {
    return CODE_MESSAGES.syntax_error;
  }
  if (lower.includes("templatesyntaxerror")) {
    return CODE_MESSAGES.TemplateSyntaxError;
  }
  return raw;
}

export function translateValidationIssue(issue: ValidationIssue): {
  message: string;
  suggestion: string | null;
  lineLabel: string | null;
} {
  const code = (issue.code || "").trim();
  const fromCode = CODE_MESSAGES[code] ?? CODE_MESSAGES[code.toLowerCase()];
  const message = fromCode ?? translateRawMessage(issue.message);
  const hint = issue.suggestion ?? FRAGMENT_HINTS[code] ?? FRAGMENT_HINTS[code.toLowerCase()] ?? null;
  const lineLabel = issue.line ? `Linia: ${issue.line}` : null;
  return { message, suggestion: hint, lineLabel };
}

export function translateValidationReport<T extends { issues: ValidationIssue[] }>(report: T): T {
  return {
    ...report,
    issues: report.issues.map((issue) => {
      const t = translateValidationIssue(issue);
      return {
        ...issue,
        message: t.message,
        suggestion: t.suggestion ?? issue.suggestion,
      };
    }),
  };
}
