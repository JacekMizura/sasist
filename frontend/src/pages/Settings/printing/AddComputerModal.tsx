import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { CheckCircle, Copy, Download, Key, Server, ShieldAlert } from "lucide-react";

import { createApiKey, rotateApiKey } from "../../../api/apiKeysApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { fetchPrinterAgentDownloadInfo } from "../../../api/printingApi";
import { PanelBulkStatusConfirmModal } from "../../../components/orders/panelList/PanelBulkStatusConfirmModal";
import {
  buildPrinterAgentConfigClipboardText,
  getPrinterAgentServerUrl,
  resolvePrinterAgentDownloadUrl,
} from "../../../config/printerAgent";
import { useWarehouse } from "../../../context/WarehouseContext";
import type { PrinterAgentDownloadInfo } from "../../../types/printing";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";

type Props = {
  open: boolean;
  onClose: () => void;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.focus();
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

function StepCard({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
          {step}
        </span>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function CopyField({
  label,
  icon: Icon,
  value,
  onCopy,
  mono = false,
}: {
  label: string;
  icon: typeof Server;
  value: string;
  onCopy: () => void;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <div className="flex items-center gap-2">
        <p className={`min-w-0 flex-1 break-all text-sm text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</p>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={onCopy}
        >
          <Copy className="h-4 w-4" aria-hidden />
          Kopiuj
        </button>
      </div>
    </div>
  );
}

export default function AddComputerModal({ open, onClose }: Props) {
  const { warehouse: activeWarehouse } = useWarehouse();
  const [keyId, setKeyId] = useState<number | null>(null);
  const [plainKey, setPlainKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rotateBusy, setRotateBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadInfo, setDownloadInfo] = useState<PrinterAgentDownloadInfo | null>(null);
  const [confirmRotateOpen, setConfirmRotateOpen] = useState(false);
  const autoCopiedRef = useRef(false);
  const initRef = useRef(false);

  const serverUrl = useMemo(() => getPrinterAgentServerUrl(), []);
  const downloadUrl = useMemo(() => resolvePrinterAgentDownloadUrl(downloadInfo), [downloadInfo]);

  const reset = useCallback(() => {
    setKeyId(null);
    setPlainKey(null);
    setError(null);
    setDownloadInfo(null);
    setConfirmRotateOpen(false);
    autoCopiedRef.current = false;
    initRef.current = false;
  }, []);

  const issueKey = useCallback(async () => {
    const whId = activeWarehouse?.id;
    if (!whId) {
      setError("Wybierz aktywny magazyn w panelu.");
      return;
    }
    const label = activeWarehouse.name ? `Agent — ${activeWarehouse.name}` : "Agent drukowania";
    setBusy(true);
    setError(null);
    try {
      const result = await createApiKey(DAMAGE_TENANT_ID, {
        name: label,
        type: "printer_agent",
        warehouse_id: whId,
      });
      setKeyId(result.key.id);
      setPlainKey(result.plain_key);
    } catch (e) {
      setError(extractApiErrorMessage(e, "Nie udało się wygenerować klucza API."));
    } finally {
      setBusy(false);
    }
  }, [activeWarehouse?.id, activeWarehouse?.name]);

  useEffect(() => {
    if (!open) return;
    if (initRef.current) return;
    initRef.current = true;

    void issueKey();
    void fetchPrinterAgentDownloadInfo(DAMAGE_TENANT_ID)
      .then((info) => {
        if (info) setDownloadInfo(info);
      })
      .catch(() => {
        /* UI falls back to static download path */
      });
  }, [open, issueKey]);

  useEffect(() => {
    if (!open || !plainKey || autoCopiedRef.current) return;
    autoCopiedRef.current = true;
    void copyText(plainKey).then((ok) => {
      if (ok) {
        toast.success("Klucz API został skopiowany do schowka.");
      }
    });
  }, [open, plainKey]);

  const handleCopyServer = async () => {
    const ok = await copyText(serverUrl);
    if (ok) toast.success("Adres został skopiowany");
    else toast.error("Nie udało się skopiować adresu.");
  };

  const handleCopyKey = async () => {
    if (!plainKey) return;
    const ok = await copyText(plainKey);
    if (ok) toast.success("Klucz API został skopiowany");
    else toast.error("Nie udało się skopiować klucza.");
  };

  const handleCopyAll = async () => {
    if (!plainKey) return;
    const ok = await copyText(buildPrinterAgentConfigClipboardText(serverUrl, plainKey));
    if (ok) toast.success("Dane konfiguracji skopiowane do schowka");
    else toast.error("Nie udało się skopiować danych.");
  };

  const handleRotateKey = async () => {
    if (keyId == null) return;
    setRotateBusy(true);
    setError(null);
    try {
      const result = await rotateApiKey(DAMAGE_TENANT_ID, keyId);
      setKeyId(result.key.id);
      setPlainKey(result.plain_key);
      autoCopiedRef.current = false;
      setConfirmRotateOpen(false);
      const copied = await copyText(result.plain_key);
      if (copied) {
        toast.success("Nowy klucz API został skopiowany do schowka.");
        autoCopiedRef.current = true;
      } else {
        toast.success("Wygenerowano nowy klucz API.");
      }
    } catch (e) {
      setError(extractApiErrorMessage(e, "Nie udało się wygenerować nowego klucza."));
    } finally {
      setRotateBusy(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
        role="presentation"
        onClick={() => {
          if (!busy && !rotateBusy) handleClose();
        }}
      >
        <div
          className="max-h-[92vh] w-full max-w-[760px] overflow-y-auto rounded-2xl bg-slate-50 p-5 shadow-2xl sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-computer-title"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="mb-5">
            <h2 id="add-computer-title" className="text-xl font-semibold text-slate-900">
              Dodaj komputer
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Skonfiguruj nowy komputer do drukowania dokumentów i etykiet.
            </p>
          </header>

          <div className="space-y-4">
            <StepCard step={1} title="Pobierz instalator">
              <a
                href={downloadUrl}
                download
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-blue-700 sm:w-auto"
              >
                <Download className="h-5 w-5" aria-hidden />
                Pobierz Sasist Printer Agent
              </a>
              {downloadInfo?.latest_version ? (
                <p className="mt-2 text-xs text-slate-500">Wersja {downloadInfo.latest_version}</p>
              ) : null}
              <p className="mt-3 text-sm text-slate-600">
                Zainstaluj program na komputerze, który ma obsługiwać drukarki.
              </p>
            </StepCard>

            <StepCard step={2} title="Skopiuj dane konfiguracji">
              {busy && !plainKey ? (
                <p className="text-sm text-slate-500">Generowanie klucza API…</p>
              ) : plainKey ? (
                <div className="space-y-3">
                  <CopyField label="Adres serwera" icon={Server} value={serverUrl} onCopy={() => void handleCopyServer()} />
                  <CopyField
                    label="Klucz API"
                    icon={Key}
                    value={plainKey}
                    mono
                    onCopy={() => void handleCopyKey()}
                  />
                  <button
                    type="button"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:w-auto"
                    onClick={() => void handleCopyAll()}
                  >
                    <Copy className="h-4 w-4" aria-hidden />
                    Kopiuj wszystko
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-red-600">{error ?? "Nie udało się przygotować klucza."}</p>
                  <button
                    type="button"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void issueKey()}
                  >
                    Spróbuj ponownie
                  </button>
                </div>
              )}
            </StepCard>

            <StepCard step={3} title="Uruchom instalator">
              <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
                <li>Uruchom instalator.</li>
                <li>Wklej adres serwera i klucz API.</li>
                <li>Kliknij „Połącz”.</li>
              </ol>
              <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/80 p-4">
                <p className="text-sm font-medium text-emerald-900">Po połączeniu komputer automatycznie:</p>
                <ul className="mt-2 space-y-1.5 text-sm text-emerald-800">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    pojawi się na liście agentów
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    pobierze dostępne drukarki
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    będzie gotowy do drukowania dokumentów
                  </li>
                </ul>
              </div>
            </StepCard>

            <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-amber-950">Bezpieczeństwo</h3>
                  <p className="mt-1 text-sm text-amber-900">
                    Ten klucz można wyświetlić tylko raz. Jeżeli go zgubisz, wygeneruj nowy.
                  </p>
                  <button
                    type="button"
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100/60 disabled:opacity-50"
                    disabled={!keyId || rotateBusy || busy}
                    onClick={() => setConfirmRotateOpen(true)}
                  >
                    <Key className="h-4 w-4" aria-hidden />
                    Wygeneruj nowy klucz
                  </button>
                </div>
              </div>
            </section>
          </div>

          {error && plainKey ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              disabled={busy || rotateBusy}
              onClick={handleClose}
            >
              Zamknij
            </button>
          </div>
        </div>
      </div>

      <PanelBulkStatusConfirmModal
        open={confirmRotateOpen}
        title="Wygenerować nowy klucz?"
        message="Stary klucz zostanie natychmiast unieważniony. Komputer z poprzednim kluczem nie będzie mógł się połączyć, dopóki nie wkleisz nowego."
        confirmLabel="Wygeneruj nowy klucz"
        cancelLabel="Anuluj"
        busy={rotateBusy}
        variant="danger"
        onCancel={() => {
          if (!rotateBusy) setConfirmRotateOpen(false);
        }}
        onConfirm={() => void handleRotateKey()}
      />
    </>
  );
}
