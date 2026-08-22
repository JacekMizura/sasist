import { describe, expect, it } from "vitest";

import { formatMailConnectionTestSummary } from "./MailConnectionTestResults";
import type { MailConnectionTestResult } from "../../modules/poczta/services/mailApi";

describe("MailConnectionTestResults", () => {
  it("K. shows separate IMAP and SMTP lines", () => {
    const result: MailConnectionTestResult = {
      ok: false,
      message: "legacy",
      imap: { status: "OK", message: "Połączenie poprawne." },
      smtp: {
        status: "NETWORK_ERROR",
        message: "Serwer Sasist nie może połączyć się z serwerem SMTP.",
      },
    };
    const lines = formatMailConnectionTestSummary(result, false);
    expect(lines).toEqual([
      "✓ IMAP — Połączenie poprawne.",
      "✕ SMTP — Serwer Sasist nie może połączyć się z serwerem SMTP.",
    ]);
  });

  it("hides IMAP line for send-only accounts", () => {
    const result: MailConnectionTestResult = {
      ok: false,
      message: "legacy",
      smtp: { status: "AUTH_ERROR", message: "Nie udało się zalogować do konta. Sprawdź login i hasło aplikacji." },
    };
    const lines = formatMailConnectionTestSummary(result, true);
    expect(lines).toEqual([
      "✕ SMTP — Nie udało się zalogować do konta. Sprawdź login i hasło aplikacji.",
    ]);
  });
});
