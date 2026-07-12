import { useCallback, useState } from "react";

import { createApiKey } from "../../../api/apiKeysApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { useWarehouse } from "../../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function AddComputerModal({ open, onClose }: Props) {
  const { warehouse: activeWarehouse } = useWarehouse();
  const [name, setName] = useState("");
  const [plainKey, setPlainKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setName("");
    setPlainKey(null);
    setError(null);
  }, []);

  if (!open) return null;

  const generateKey = async () => {
    const whId = activeWarehouse?.id;
    if (!whId) {
      setError("Wybierz aktywny magazyn.");
      return;
    }
    const trimmed = name.trim() || `Agent — ${activeWarehouse.name}`;
    setBusy(true);
    setError(null);
    try {
      const result = await createApiKey(DAMAGE_TENANT_ID, {
        name: trimmed,
        type: "printer_agent",
        warehouse_id: whId,
      });
      setPlainKey(result.plain_key);
    } catch (e) {
      setError(extractApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const copyKey = async () => {
    if (!plainKey) return;
    try {
      await navigator.clipboard.writeText(plainKey);
    } catch {
      setError("Nie udało się skopiować klucza.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Dodaj komputer</h2>
        <p className="mt-1 text-sm text-slate-600">Skonfiguruj nowy agent drukowania na stanowisku Windows.</p>

        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-slate-700">
          <li>
            <span className="font-medium">Wygeneruj klucz API typu Printer Agent.</span>
            {!plainKey ? (
              <div className="mt-2 space-y-2">
                <input
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder={`Nazwa (np. Biuro — ${activeWarehouse?.name ?? "magazyn"})`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <button
                  type="button"
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void generateKey()}
                >
                  Wygeneruj klucz
                </button>
              </div>
            ) : (
              <div className="mt-2">
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900">
                  Zapisz ten klucz. Nie będzie można go ponownie wyświetlić.
                </p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-emerald-200">{plainKey}</pre>
                <button type="button" className="mt-2 text-sm text-blue-700 underline" onClick={() => void copyKey()}>
                  Kopiuj klucz
                </button>
              </div>
            )}
          </li>
          <li>
            Pobierz instalator: <strong>SasistPrinterAgent-Setup.exe</strong> (z repozytorium / panelu wdrożeń).
          </li>
          <li>
            Podczas konfiguracji wpisz <strong>URL serwera</strong> oraz <strong>Klucz API</strong> z kroku 1.
          </li>
          <li>Uruchom agenta (tray) lub usługę Windows po instalacji.</li>
        </ol>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
