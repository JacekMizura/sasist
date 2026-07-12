import { useCallback, useEffect, useMemo, useState } from "react";
import { Key, Plus } from "lucide-react";

import PageLayout from "../../../components/layout/PageLayout";
import { PageHeader } from "../../../components/layout/PageHeader";
import { DAMAGE_TENANT_ID } from "../../../constants/panelTenant";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import {
  createApiKey,
  deleteApiKey,
  fetchApiKeyUsage,
  fetchApiKeys,
  regenerateApiKey,
  revokeApiKey,
  rotateApiKey,
} from "../../../api/apiKeysApi";
import { useWarehouse } from "../../../context/WarehouseContext";
import type { ApiKeyRead, ApiKeyScope, ApiKeyType } from "../../../types/apiKeys";
import {
  API_KEY_SCOPE_LABELS,
  API_KEY_STATUS_LABELS,
  API_KEY_TYPE_LABELS,
  DEFAULT_SCOPES_BY_TYPE,
} from "../../../types/apiKeys";

const TENANT_ID = DAMAGE_TENANT_ID;
const KEY_TYPES: ApiKeyType[] = ["printer_agent", "integration", "public_api", "webhook"];

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pl-PL");
}

function formatScopes(scopes: ApiKeyScope[] | undefined): string {
  if (!scopes?.length) return "—";
  return scopes.map((s) => API_KEY_SCOPE_LABELS[s] ?? s).join(", ");
}

function parseAllowedIpsInput(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function ApiKeysSettingsPage() {
  const { warehouses, warehouse: activeWarehouse } = useWarehouse();
  const [rows, setRows] = useState<ApiKeyRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [keyType, setKeyType] = useState<ApiKeyType>("integration");
  const [warehouseId, setWarehouseId] = useState<number | "">("");
  const [allowedIpsInput, setAllowedIpsInput] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const selectedScopes = useMemo(() => DEFAULT_SCOPES_BY_TYPE[keyType], [keyType]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchApiKeys(TENANT_ID));
    } catch (e) {
      setError(extractApiErrorMessage(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openCreate = () => {
    setName("");
    setDescription("");
    setKeyType("integration");
    setWarehouseId(activeWarehouse?.id ?? warehouses[0]?.id ?? "");
    setAllowedIpsInput("");
    setExpiresAt("");
    setCreatedKey(null);
    setModalOpen(true);
  };

  const whOptions = useMemo(
    () => warehouses.map((w) => ({ id: w.id, label: w.name || `Magazyn #${w.id}` })),
    [warehouses],
  );

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Podaj nazwę klucza.");
      return;
    }
    if (keyType === "printer_agent" && !warehouseId) {
      setError("Wybierz magazyn dla klucza Printer Agent.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const allowed_ips = parseAllowedIpsInput(allowedIpsInput);
      const result = await createApiKey(TENANT_ID, {
        name: trimmed,
        description: description.trim() || null,
        type: keyType,
        warehouse_id: keyType === "printer_agent" ? Number(warehouseId) : null,
        scopes: selectedScopes,
        allowed_ips: allowed_ips.length ? allowed_ips : null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setCreatedKey(result.plain_key);
      await reload();
    } catch (e) {
      setError(extractApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError("Nie udało się skopiować do schowka.");
    }
  };

  const onRevoke = async (row: ApiKeyRead) => {
    if (!window.confirm(`Wyłączyć klucz „${row.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await revokeApiKey(TENANT_ID, row.id);
      await reload();
    } catch (e) {
      setError(extractApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onRegenerate = async (row: ApiKeyRead) => {
    if (!window.confirm(`Wygenerować nowy sekret dla „${row.name}"? Stary klucz przestanie działać.`)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await regenerateApiKey(TENANT_ID, row.id);
      setCreatedKey(result.plain_key);
      setModalOpen(true);
      await reload();
    } catch (e) {
      setError(extractApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onRotate = async (row: ApiKeyRead) => {
    if (!window.confirm(`Rotować klucz „${row.name}"? Stary klucz zostanie unieważniony, powstanie nowy rekord.`)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await rotateApiKey(TENANT_ID, row.id);
      setCreatedKey(result.plain_key);
      setModalOpen(true);
      await reload();
    } catch (e) {
      setError(extractApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (row: ApiKeyRead) => {
    if (!window.confirm(`Usunąć klucz „${row.name}"? Tej operacji nie można cofnąć.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteApiKey(TENANT_ID, row.id);
      await reload();
    } catch (e) {
      setError(extractApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const showUsage = async (row: ApiKeyRead) => {
    try {
      const usage = await fetchApiKeyUsage(TENANT_ID, row.id);
      window.alert(
        [
          `Klucz: ${row.name}`,
          `Utworzono: ${formatDate(usage.created_at)}`,
          `Ostatnie użycie: ${formatDate(usage.last_used_at)}`,
          `IP: ${usage.last_used_ip ?? "—"}`,
          `User-Agent: ${usage.last_used_user_agent ?? "—"}`,
          `Liczba użyć: ${usage.total_usage_count}`,
        ].join("\n"),
      );
    } catch (e) {
      setError(extractApiErrorMessage(e));
    }
  };

  return (
    <PageLayout>
      <PageHeader
        title="Klucze API"
        description="Klucze do agentów drukowania, integracji, webhooków i przyszłego Public API Sasist."
        icon={Key}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Ustawienia → Integracje → Klucze API</p>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={busy}
          onClick={openCreate}
        >
          <Plus className="h-4 w-4" />
          Nowy klucz
        </button>
      </div>

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Brak kluczy API.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Nazwa</th>
                <th className="px-3 py-2 font-medium">Typ</th>
                <th className="px-3 py-2 font-medium">Scope</th>
                <th className="px-3 py-2 font-medium">Magazyn</th>
                <th className="px-3 py-2 font-medium">Ograniczenie IP</th>
                <th className="px-3 py-2 font-medium">Wygasa</th>
                <th className="px-3 py-2 font-medium">Ostatnie użycie</th>
                <th className="px-3 py-2 font-medium">Liczba użyć</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{row.name}</div>
                    <div className="font-mono text-xs text-slate-500">{row.key_prefix}…</div>
                    {row.description ? <div className="mt-1 text-xs text-slate-500">{row.description}</div> : null}
                  </td>
                  <td className="px-3 py-2">{API_KEY_TYPE_LABELS[row.type]}</td>
                  <td className="max-w-[12rem] px-3 py-2 text-xs">{formatScopes(row.scopes)}</td>
                  <td className="px-3 py-2">{row.warehouse_name ?? "—"}</td>
                  <td className="max-w-[10rem] px-3 py-2 text-xs">
                    {row.allowed_ips?.length ? row.allowed_ips.join(", ") : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.expires_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div>{formatDate(row.last_used_at)}</div>
                    {row.last_used_ip ? <div className="text-xs text-slate-500">{row.last_used_ip}</div> : null}
                  </td>
                  <td className="px-3 py-2">{row.usage_count ?? 0}</td>
                  <td className="px-3 py-2">{API_KEY_STATUS_LABELS[row.status] ?? row.status}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button type="button" className="text-blue-700 underline" onClick={() => void showUsage(row)}>
                        Użycie
                      </button>
                      <button type="button" className="text-blue-700 underline" onClick={() => void copyText(row.key_prefix)}>
                        Kopiuj prefix
                      </button>
                      <button type="button" className="text-blue-700 underline disabled:opacity-50" disabled={busy} onClick={() => void onRotate(row)}>
                        Rotuj
                      </button>
                      <button type="button" className="text-blue-700 underline disabled:opacity-50" disabled={busy} onClick={() => void onRegenerate(row)}>
                        Regeneruj
                      </button>
                      <button type="button" className="text-amber-700 underline disabled:opacity-50" disabled={busy || row.status === "revoked"} onClick={() => void onRevoke(row)}>
                        Wyłącz
                      </button>
                      <button type="button" className="text-red-700 underline disabled:opacity-50" disabled={busy} onClick={() => void onDelete(row)}>
                        Usuń
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            {createdKey ? (
              <>
                <h2 className="text-lg font-semibold text-slate-900">Klucz API gotowy</h2>
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Zapisz ten klucz. Nie będzie można go ponownie wyświetlić.
                </p>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-emerald-200">{createdKey}</pre>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => void copyText(createdKey)}>
                    Kopiuj
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
                    onClick={() => {
                      setModalOpen(false);
                      setCreatedKey(null);
                    }}
                  >
                    Zamknij
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-slate-900">Nowy klucz API</h2>
                <label className="mt-4 block text-sm font-medium text-slate-700">
                  Nazwa
                  <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="mt-3 block text-sm font-medium text-slate-700">
                  Opis (opcjonalnie)
                  <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
                <label className="mt-3 block text-sm font-medium text-slate-700">
                  Typ
                  <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={keyType} onChange={(e) => setKeyType(e.target.value as ApiKeyType)}>
                    {KEY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {API_KEY_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="font-medium text-slate-700">Domyślne scope</div>
                  <div className="mt-1 text-slate-600">{formatScopes(selectedScopes)}</div>
                </div>
                {keyType === "printer_agent" ? (
                  <label className="mt-3 block text-sm font-medium text-slate-700">
                    Magazyn
                    <select
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                      value={warehouseId}
                      onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")}
                    >
                      <option value="">— wybierz —</option>
                      {whOptions.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="mt-3 block text-sm font-medium text-slate-700">
                  Ograniczenie IP (opcjonalnie, po przecinku lub linii)
                  <textarea
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    rows={2}
                    placeholder="203.0.113.10, 198.51.100.0"
                    value={allowedIpsInput}
                    onChange={(e) => setAllowedIpsInput(e.target.value)}
                  />
                </label>
                <label className="mt-3 block text-sm font-medium text-slate-700">
                  Wygasa (opcjonalnie)
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                </label>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => setModalOpen(false)}>
                    Anuluj
                  </button>
                  <button type="button" className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => void save()}>
                    Zapisz
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </PageLayout>
  );
}
