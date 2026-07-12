import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { Copy, Download, Key, RefreshCw, Server, ShieldAlert } from "lucide-react";

import { createApiKey, rotateApiKey } from "../../../api/apiKeysApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { fetchPrinterAgentDownloadInfo } from "../../../api/printingApi";
import { PanelBulkStatusConfirmModal } from "../../../components/orders/panelList/PanelBulkStatusConfirmModal";
import {
  getPrinterAgentServerUrl,
  isValidPrinterAgentDownloadUrl,
  logPrinterAgentDownloadDiagnostics,
  openPrinterAgentDownload,
  resolvePrinterAgentDownload,
  type ResolvedPrinterAgentDownload,
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
    <section className="rounded-xl border border-orange-100 bg-[#FFF7ED] p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 border-b border-orange-100 pb-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500 text-sm font-semibold text-white">
          {step}
        </span>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      </div>
      {children}
    </section>
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
  const [copiedKey, setCopiedKey] = useState(false);
  const initRef = useRef(false);
  const resolvedDownload = useMemo(
    (): ResolvedPrinterAgentDownload => resolvePrinterAgentDownload(downloadInfo),
    [downloadInfo],
  );
  const maskedKey = plainKey ? "•".repeat(Math.max(plainKey.length, 24)) : "";

  useEffect(() => {
    if (!open || !downloadInfo) return;
    logPrinterAgentDownloadDiagnostics(resolvedDownload);
  }, [open, downloadInfo, resolvedDownload]);

  const reset = useCallback(() => {
    setKeyId(null);
    setPlainKey(null);
    setError(null);
    setDownloadInfo(null);
    setConfirmRotateOpen(false);
    setCopiedKey(false);
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
    void fetchPrinterAgentDownloadInfo(DAMAGE_TENANT_ID)
      .then((info) => {
        if (info) setDownloadInfo(info);
      })
      .catch(() => {
        /* fallback download path */
      });
  }, [open]);

  const handleCopyKey = async () => {
    if (!plainKey) return;
    const ok = await copyText(plainKey);
    if (ok) {
      toast.success("Skopiowano klucz API");
      setCopiedKey(true);
      window.setTimeout(() => setCopiedKey(false), 2000);
    } else {
      toast.error("Nie udało się skopiować klucza.");
    }
  };

  const handleRotateKey = async () => {
    if (keyId == null) return;
    setRotateBusy(true);
    setError(null);
    try {
      const result = await rotateApiKey(DAMAGE_TENANT_ID, keyId);
      setKeyId(result.key.id);
      setPlainKey(result.plain_key);
      setConfirmRotateOpen(false);
      toast.success("Wygenerowano nowy klucz API.");
    } catch (e) {
      setError(extractApiErrorMessage(e, "Nie udało się wygenerować nowego klucza."));
    } finally {
      setRotateBusy(false);
    }
  };

  const handleDownloadInstaller = () => {
    const { downloadUrl, source } = resolvedDownload;
    logPrinterAgentDownloadDiagnostics({ downloadUrl, source });
    if (!downloadUrl || !isValidPrinterAgentDownloadUrl(downloadUrl)) {
      toast.error("Nieprawidłowy adres instalatora.");
      return;
    }
    openPrinterAgentDownload(downloadUrl);
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
          className="max-h-[92vh] w-full max-w-[820px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-computer-title"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
            <img src="/sasist-logo-poziome.svg" alt="Sasist" className="h-8 w-auto shrink-0" />
            <div>
              <h2 id="add-computer-title" className="text-xl font-semibold text-slate-900">
                Dodaj komputer
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Pobierz agenta, wygeneruj klucz API i połącz komputer krok po kroku.
              </p>
            </div>
          </header>

          <div className="space-y-4">
            <StepCard step={1} title="Pobierz instalator">
              <button
                type="button"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                disabled={!resolvedDownload.downloadUrl}
                onClick={handleDownloadInstaller}
              >
                <Download className="h-5 w-5" aria-hidden />
                Pobierz Sasist Printer Agent
              </button>
              {downloadInfo?.latest_version ? (
                <p className="mt-2 text-xs text-slate-500">Wersja {downloadInfo.latest_version}</p>
              ) : null}
              <p className="mt-3 text-sm text-slate-600">Zainstaluj program na komputerze z drukarkami.</p>
            </StepCard>

            <StepCard step={2} title="Wygeneruj klucz API">
              <p className="text-sm text-slate-600">
                Klucz jest przypisany do magazynu{" "}
                <span className="font-medium text-slate-900">{activeWarehouse?.name ?? "—"}</span>.
              </p>
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                disabled={busy || !!plainKey}
                onClick={() => void issueKey()}
              >
                <Key className="h-4 w-4" aria-hidden />
                {busy ? "Generowanie…" : plainKey ? "Klucz wygenerowany" : "Wygeneruj klucz API"}
              </button>
              {error && !plainKey ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
            </StepCard>

            <StepCard step={3} title="Skopiuj klucz — wyświetlimy go tylko raz">
              {plainKey ? (
                <div className="space-y-3">
                  <div className="rounded-xl border-2 border-orange-200 bg-white p-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Klucz API</div>
                    <p className="break-all font-mono text-lg tracking-widest text-slate-900">{maskedKey}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Pełny klucz jest ukryty. Użyj „Kopiuj”, aby wkleić go w agencie.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
                      onClick={() => void handleCopyKey()}
                    >
                      <Copy className="h-4 w-4" aria-hidden />
                      {copiedKey ? "Skopiowano" : "Kopiuj"}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                      disabled={!keyId || rotateBusy}
                      onClick={() => setConfirmRotateOpen(true)}
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden />
                      Regeneruj
                    </button>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    <div className="mb-1 flex items-center gap-1.5 font-medium text-slate-700">
                      <Server className="h-4 w-4" aria-hidden />
                      Adres serwera
                    </div>
                    <p className="font-mono text-slate-900">{serverUrl}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Najpierw wygeneruj klucz API w kroku 2.</p>
              )}
            </StepCard>

            <StepCard step={4} title="Połącz komputer w agencie">
              <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
                <li>Uruchom Sasist Printer Agent.</li>
                <li>Wejdź w <span className="font-medium">Ustawienia</span>.</li>
                <li>Wklej klucz API (przycisk „Wklej”).</li>
                <li>Kliknij <span className="font-medium">Test połączenia</span>.</li>
                <li>Kliknij <span className="font-medium">Zapisz</span>.</li>
              </ol>
              <div
                className="mt-4 flex min-h-[140px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-orange-200 bg-[#FFF7ED] p-4 text-center"
                aria-hidden
              >
                <p className="text-sm font-semibold text-slate-800">Podgląd — pole Klucz API w agencie</p>
                <p className="mt-1 text-xs text-slate-500">Ustawienia → Połączenie → Klucz API</p>
                <div className="mt-3 w-full max-w-md rounded-lg border border-orange-100 bg-white p-3 text-left shadow-sm">
                  <div className="text-xs font-medium text-slate-500">Klucz API</div>
                  <div className="mt-1 h-9 rounded-md border border-slate-200 bg-slate-50 px-2 font-mono text-sm leading-9 text-slate-400">
                    ••••••••••••••••
                  </div>
                </div>
              </div>
            </StepCard>

            <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
                <p className="text-sm text-amber-900">
                  Klucz API można skopiować tylko teraz. Po zamknięciu okna nie będzie możliwości ponownego podglądu.
                </p>
              </div>
            </section>
          </div>

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
        title="Regenerować klucz API?"
        message="Stary klucz zostanie unieważniony. Komputer z poprzednim kluczem nie połączy się, dopóki nie wkleisz nowego."
        confirmLabel="Regeneruj"
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
