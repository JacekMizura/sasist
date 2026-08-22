import { useEffect, useState } from "react";

import { listSellasistInputClass } from "../../components/listPage/listSellasistTokens";
import { brandPrimaryButtonClass } from "../../design-system/brandUi";
import {
  createMailAccount,
  testMailAccountConfig,
  updateMailAccount,
  type MailAccountDto,
  type MailAccountPayload,
  type MailConnectionTestResult,
} from "../../modules/poczta/services/mailApi";
import { MailConnectionTestResults } from "./MailConnectionTestResults";

type Props = {
  tenantId: number;
  initial: MailAccountDto | null;
  googleNameOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const inputClass = listSellasistInputClass;

export function MailAccountFormModal({ tenantId, initial, googleNameOnly = false, onClose, onSaved }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [emailAddress, setEmailAddress] = useState(initial?.email_address ?? "");
  const [isSendOnly, setIsSendOnly] = useState(initial?.is_send_only ?? false);
  const [imapHost, setImapHost] = useState(initial?.imap_host ?? "");
  const [imapPort, setImapPort] = useState(String(initial?.imap_port ?? 993));
  const [imapSecurity, setImapSecurity] = useState(initial?.imap_security ?? "SSL");
  const [imapUsername, setImapUsername] = useState(initial?.imap_username ?? "");
  const [imapPassword, setImapPassword] = useState("");
  const [smtpHost, setSmtpHost] = useState(initial?.smtp_host ?? "");
  const [smtpPort, setSmtpPort] = useState(String(initial?.smtp_port ?? 587));
  const [smtpSecurity, setSmtpSecurity] = useState(initial?.smtp_security ?? "TLS");
  const [smtpUsername, setSmtpUsername] = useState(initial?.smtp_username ?? "");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<MailConnectionTestResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const buildPayload = (): MailAccountPayload => ({
    tenant_id: tenantId,
    name: name.trim(),
    email_address: emailAddress.trim(),
    imap_host: isSendOnly ? null : imapHost.trim() || null,
    imap_port: isSendOnly ? null : Number(imapPort) || null,
    imap_security: isSendOnly ? null : imapSecurity,
    imap_username: isSendOnly ? null : imapUsername.trim() || null,
    imap_password: imapPassword || undefined,
    smtp_host: smtpHost.trim() || null,
    smtp_port: Number(smtpPort) || null,
    smtp_security: smtpSecurity,
    smtp_username: smtpUsername.trim() || null,
    smtp_password: smtpPassword || undefined,
    is_send_only: isSendOnly,
    is_active: true,
  });

  const handleTest = async () => {
    setBusy(true);
    setTestResult(null);
    setErr(null);
    try {
      const res = await testMailAccountConfig(buildPayload());
      setTestResult(res);
    } catch {
      setErr("Test połączenia nie powiódł się. Sprawdź sesję lub uprawnienia do kont pocztowych.");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (googleNameOnly && initial) {
        await updateMailAccount(initial.id, tenantId, { name: name.trim() });
        onSaved();
        return;
      }
      const payload = buildPayload();
      if (initial) {
        const patch: Partial<MailAccountPayload> = { ...payload };
        if (!imapPassword) delete patch.imap_password;
        if (!smtpPassword) delete patch.smtp_password;
        await updateMailAccount(initial.id, tenantId, patch);
      } else {
        await createMailAccount(payload);
      }
      onSaved();
    } catch {
      setErr("Nie udało się zapisać konta. Sprawdź wymagane pola.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">
          {googleNameOnly ? "Edytuj nazwę konta Google" : initial ? "Edytuj konto" : "Dodaj konto pocztowe"}
        </h2>

        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Nazwa</span>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {googleNameOnly ? (
            <p className="text-xs text-slate-500">
              Konto Google: {initial?.email_address}. Połączenie OAuth zarządzane przez „Połącz z Google” / „Rozłącz”.
            </p>
          ) : (
            <>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Adres e-mail</span>
            <input className={inputClass} type="email" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isSendOnly} onChange={(e) => setIsSendOnly(e.target.checked)} />
            <span className="text-slate-700">Tylko wysyłanie</span>
          </label>

          {!isSendOnly ? (
            <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">IMAP</legend>
              <input className={inputClass} placeholder="Host" value={imapHost} onChange={(e) => setImapHost(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inputClass} placeholder="Port" value={imapPort} onChange={(e) => setImapPort(e.target.value)} />
                <select className={inputClass} value={imapSecurity} onChange={(e) => setImapSecurity(e.target.value)}>
                  <option value="SSL">SSL</option>
                  <option value="TLS">TLS</option>
                  <option value="NONE">Brak</option>
                </select>
              </div>
              <input className={inputClass} placeholder="Użytkownik IMAP" value={imapUsername} onChange={(e) => setImapUsername(e.target.value)} />
              <input
                className={inputClass}
                type="password"
                placeholder={initial?.has_imap_password ? "Hasło IMAP (pozostaw puste aby zachować)" : "Hasło IMAP"}
                value={imapPassword}
                onChange={(e) => setImapPassword(e.target.value)}
                autoComplete="new-password"
              />
            </fieldset>
          ) : null}

          <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">SMTP</legend>
            <input className={inputClass} placeholder="Host" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input className={inputClass} placeholder="Port" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />
              <select className={inputClass} value={smtpSecurity} onChange={(e) => setSmtpSecurity(e.target.value)}>
                <option value="TLS">TLS</option>
                <option value="SSL">SSL</option>
                <option value="NONE">Brak</option>
              </select>
            </div>
            <input className={inputClass} placeholder="Użytkownik SMTP" value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} />
            <input
              className={inputClass}
              type="password"
              placeholder={initial?.has_smtp_password ? "Hasło SMTP (pozostaw puste aby zachować)" : "Hasło SMTP"}
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              autoComplete="new-password"
            />
          </fieldset>
            </>
          )}
        </div>

        {!googleNameOnly && testResult ? <MailConnectionTestResults result={testResult} isSendOnly={isSendOnly} /> : null}
        {err ? <p className="mt-3 text-sm text-red-700">{err}</p> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={onClose} disabled={busy}>
            Anuluj
          </button>
          {!googleNameOnly ? (
            <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={() => void handleTest()} disabled={busy}>
              Sprawdź połączenie
            </button>
          ) : null}
          <button type="button" className={brandPrimaryButtonClass} onClick={() => void handleSave()} disabled={busy}>
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
}
