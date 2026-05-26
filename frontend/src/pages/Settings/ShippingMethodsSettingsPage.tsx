import { useCallback, useEffect, useState } from "react";
import { getShippingMethods, updateShippingMethod, type ShippingMethodDto } from "../../api/shippingMethodsApi";
import api from "../../api/axios";
import { useWarehouse } from "../../context/WarehouseContext";
import { ShippingMethodLogo } from "../../components/shipping/ShippingMethodLogo";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";

/** Must match backend ``allowed_shipping_method_codes`` (fixed dictionary). */
const DICTIONARY_CODES = new Set([
  "OTHER",
  "INPOST",
  "DPD",
  "DHL",
  "ORLEN_PACZKA",
  "ALLEGRO_ONE",
  "TEMU",
]);

export default function ShippingMethodsSettingsPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;

  const [rows, setRows] = useState<ShippingMethodDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ShippingMethodDto | null>(null);
  const [code, setCode] = useState("");
  const [aliasesInput, setAliasesInput] = useState("");
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);

  const load = useCallback(async () => {
    if (warehouseId == null) {
      setRows([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await getShippingMethods({
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId,
        active_only: false,
      });
      setRows(data);
    } catch {
      setErr("Nie udało się wczytać metod dostawy.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (r: ShippingMethodDto) => {
    setEditing(r);
    setCode(r.code ?? "");
    setAliasesInput((r.aliases ?? []).join(", "));
    setName(r.name);
    setLogoUrl(r.logo_url);
    setIsActive(r.is_active);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const onLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || warehouseId == null) return;
    setUploadBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await api.post<{ url: string }>("/uploads", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const url = res.data?.url?.trim();
      if (url) setLogoUrl(url);
    } catch {
      setErr("Nie udało się wgrać logo.");
    } finally {
      setUploadBusy(false);
    }
  };

  const parseAliases = (): string[] => {
    const parts = aliasesInput.split(",");
    const out: string[] = [];
    const seen = new Set<string>();
    for (const p of parts) {
      const s = p.trim().toLowerCase();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  };

  const save = async () => {
    if (warehouseId == null || !editing) return;
    const nm = name.trim();
    if (!nm) {
      setErr("Podaj nazwę metody.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await updateShippingMethod(editing.id, { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId }, {
        name: nm,
        aliases: parseAliases(),
        logo_url: logoUrl,
        is_active: isActive,
      });
      setModalOpen(false);
      await load();
    } catch {
      setErr("Nie udało się zapisać metody dostawy.");
    } finally {
      setSaving(false);
    }
  };

  const fieldCls = "w-full border-2 border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-slate-800";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-100">
      <div className="shrink-0 border-b border-slate-300/90 bg-white px-3 py-3 sm:px-4">
        <h1 className="text-xl font-extrabold tracking-tight text-[#222] sm:text-2xl">Metody dostawy</h1>
      </div>

      {warehouseId == null ? (
        <div className="mx-3 mt-4 border-2 border-amber-400 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-950 sm:mx-4">
          Wybierz magazyn w pasku u góry.
        </div>
      ) : null}

      {err ? (
        <div className="mx-3 mt-3 border-2 border-red-400 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 sm:mx-4">
          {err}
        </div>
      ) : null}

      {warehouseId != null && loading ? (
        <p className="px-4 py-10 text-center text-sm font-medium text-slate-600">Ładowanie…</p>
      ) : null}

      {warehouseId != null && !loading ? (
        <div className="min-h-0 flex-1">
          {rows.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm font-medium text-slate-600">Brak metod.</p>
          ) : (
            <ul className="w-full divide-y divide-slate-200 border-y border-slate-300/80 bg-white">
              {rows.map((r) => {
                return (
                  <li key={r.id}>
                    <div className="flex items-center gap-4 px-4 py-4 sm:gap-5 sm:px-5 sm:py-5">
                      <div className="flex w-20 shrink-0 justify-center">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center">
                          <ShippingMethodLogo logoUrl={r.logo_url} methodName={r.name} size="listRow" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-extrabold text-slate-900 sm:text-lg">{r.name}</p>
                        <p className="mt-1 font-mono text-xs text-slate-600 sm:text-sm">
                          Kod: <span className="font-semibold text-slate-800">{r.code || "—"}</span>
                        </p>
                        {(r.aliases?.length ?? 0) > 0 ? (
                          <p className="mt-1 line-clamp-2 text-xs text-slate-600 sm:text-sm">
                            Aliasy: <span className="text-slate-800">{r.aliases!.join(", ")}</span>
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-slate-500">Brak aliasów importu.</p>
                        )}
                        <p className="mt-2 text-sm font-bold">
                          {r.is_active ? (
                            <span className="text-emerald-800">Aktywna</span>
                          ) : (
                            <span className="text-slate-600">Nieaktywna</span>
                          )}
                        </p>
                      </div>
                      <div className="flex w-[120px] shrink-0 justify-end sm:w-[140px]">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="border-2 border-slate-800 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-50"
                        >
                          Edytuj
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {modalOpen && editing ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
        >
          <div
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto border-t-2 border-slate-800 bg-white p-4 shadow-xl sm:border-2"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-extrabold text-slate-900">Edytuj metodę</h2>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Kod</span>
                <input className={`mt-1 ${fieldCls} font-mono uppercase`} value={code} disabled readOnly />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Nazwa</span>
                <input
                  className={`mt-1 ${fieldCls}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  readOnly={DICTIONARY_CODES.has((editing.code ?? "").toUpperCase())}
                  aria-readonly={DICTIONARY_CODES.has((editing.code ?? "").toUpperCase())}
                />
                <span className="mt-1 block text-xs text-slate-500">
                  {DICTIONARY_CODES.has((editing.code ?? "").toUpperCase())
                    ? "Nazwa przewoźnika jest ustalona przez słownik."
                    : "Zmiana nazwy może zostać odrzucona przez serwer."}
                </span>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Aliasy (import)</span>
                <input
                  className={`mt-1 ${fieldCls}`}
                  value={aliasesInput}
                  onChange={(e) => setAliasesInput(e.target.value)}
                  placeholder="np. dpd, kurier dpd — oddziel przecinkami"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Dopasowanie: znormalizowany tekst z importu musi zawierać alias (najdłuższe wygrywa).
                  Nie tworzy nowych metod.
                </span>
              </label>
              <div>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Logo</span>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="cursor-pointer border-2 border-slate-400 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100">
                    {uploadBusy ? "Wgrywanie…" : "Wybierz plik"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => void onLogoFile(e)} />
                  </label>
                  {logoUrl ? (
                    <button type="button" className="text-sm font-bold text-red-800 hover:underline" onClick={() => setLogoUrl(null)}>
                      Usuń logo
                    </button>
                  ) : null}
                </div>
                {logoUrl ? (
                  <div className="mt-2">
                    <ShippingMethodLogo logoUrl={logoUrl} methodName={name} size="lg" />
                  </div>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
                Aktywna (widoczna na listach wyboru)
              </label>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="border-2 border-slate-400 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "Zapisywanie…" : "Zapisz"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
