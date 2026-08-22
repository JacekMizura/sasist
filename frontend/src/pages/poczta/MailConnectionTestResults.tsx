import type { MailConnectionTestResult, MailProtocolProbeResult } from "../../modules/poczta/services/mailApi";

function probeLine(label: string, probe: MailProtocolProbeResult | null | undefined): string | null {
  if (!probe) return null;
  const mark = probe.status === "OK" ? "✓" : "✕";
  return `${mark} ${label} — ${probe.message}`;
}

export function formatMailConnectionTestSummary(result: MailConnectionTestResult, isSendOnly: boolean): string[] {
  const lines: string[] = [];
  if (!isSendOnly) {
    const imapLine = probeLine("IMAP", result.imap);
    if (imapLine) lines.push(imapLine);
  }
  const smtpLine = probeLine("SMTP", result.smtp);
  if (smtpLine) lines.push(smtpLine);
  if (lines.length === 0) {
    lines.push(result.message || "Test połączenia zakończony.");
  }
  return lines;
}

export function MailConnectionTestResults({
  result,
  isSendOnly,
}: {
  result: MailConnectionTestResult;
  isSendOnly: boolean;
}) {
  const lines = formatMailConnectionTestSummary(result, isSendOnly);
  return (
    <ul className="mt-3 space-y-1 text-sm text-slate-700">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
