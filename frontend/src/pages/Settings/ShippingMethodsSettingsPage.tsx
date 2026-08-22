import { memo, useCallback, useEffect, useState } from "react";
import { getShippingMethods, updateShippingMethod, type ShippingMethodDto } from "../../api/shippingMethodsApi";
import api from "../../api/axios";
import { useWarehouse } from "../../context/WarehouseContext";
import { ShippingMethodLogo } from "../../components/shipping/ShippingMethodLogo";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { GhostButton, PrimaryButton } from "@/design-system";
import { AppOverlayPortal } from "../../components/overlay";
import {
  mergeShippingMethodsRows,
  shippingMethodsShouldUnmountList,
} from "../../utils/shippingMethodsListLifecycle";

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

type RowProps = {
  row: ShippingMethodDto;
  onEdit: (r: ShippingMethodDto) => void;
};

/** One delivery method = one stable row; memoized so page rerenders do not remount logos. */
const ShippingMethodListRow = memo(function ShippingMethodListRow({ row, onEdit }: RowProps) {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[ShippingMethodListRow] mount", {
      methodId: row.id,
      logoUrl: row.logo_url,
      name: row.name,
    });
    return () => {
      console.debug("[ShippingMethodListRow] unmount", { methodId: row.id });
    };
    // Instance lifetime only — logo_url changes must not look like remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  return (
    <li>
      <div className="flex items-center gap-4 px-4 py-4 sm:gap-5 sm:px-5 sm:py-5">
        <div className="flex w-20 shrink-0 justify-center">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center">
            <ShippingMethodLogo
              debugMethodId={row.id}
              logoUrl={row.logo_url}
              methodName={row.name}
              size="listRow"
            />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold text-slate-900 sm:text-lg">{row.name}</p>
          <p className="mt-1 font-mono text-xs text-slate-600 sm:text-sm">
            Kod: <span className="font-semibold text-slate-800">{row.code || "—"}</span>
          </p>
          {(row.aliases?.length ?? 0) > 0 ? (
            <p className="mt-1 line-clamp-2 text-xs text-slate-600 sm:text-sm">
              Aliasy: <span className="text-slate-800">{row.aliases!.join(", ")}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Brak aliasów importu.</p>
          )}
          <p className="mt-2 text-sm font-bold">
            {row.is_active ? (
              <span className="text-emerald-800">Aktywna</span>
            ) : (
              <span className="text-slate-600">Nieaktywna</span>
            )}
          </p>
        </div>
        <div className="flex w-[120px] shrink-0 justify-end sm:w-[140px]">
          <button
            type="button"
            onClick={() => onEdit(row)}
            className="border-2 border-slate-800 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-50"
          >
            Edytuj
          </button>
        </div>
      </div>
    </li>
  );
});

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
  /** Logo at modal open — omit `logo_url` from PUT unless the operator changed/cleared it. */
  const [initialLogoUrl, setInitialLogoUrl] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);

  /**
   * Single load pipeline keyed by warehouseId.
   * Cleanup ignores stale responses so StrictMode/double-invoke cannot setRows twice
   * while logo <img> requests are in flight (NS_BINDING_ABORTED).
   */
  useEffect(() => {
    if (warehouseId == null) {
      setRows([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErr(null);

    if (import.meta.env.DEV) {
      console.debug("[ShippingMethodsSettingsPage] fetch start", { warehouseId });
    }

    void (async () => {
      try {
        const data = await getShippingMethods({
          tenant_id: DAMAGE_TENANT_ID,
          warehouse_id: warehouseId,
          active_only: false,
        });
        if (cancelled) {
          if (import.meta.env.DEV) {
            console.debug("[ShippingMethodsSettingsPage] fetch ignored (cancelled)", { warehouseId });
          }
          return;
        }
        setRows((prev) => mergeShippingMethodsRows(prev, data));
      } catch {
        if (cancelled) return;
        setErr("Nie udało się wczytać metod dostawy.");
        setRows((prev) => (prev.length > 0 ? prev : []));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [warehouseId]);

  const softReload = useCallback(async () => {
    if (warehouseId == null) return;
    try {
      const data = await getShippingMethods({
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId,
        active_only: false,
      });
      setRows((prev) => mergeShippingMethodsRows(prev, data));
    } catch {
      setErr("Nie udało się wczytać metod dostawy.");
    }
  }, [warehouseId]);

  const openEdit = useCallback((r: ShippingMethodDto) => {
    setEditing(r);
    setCode(r.code ?? "");
    setAliasesInput((r.aliases ?? []).join(", "));
    setName(r.name);
    const existingLogo = r.logo_url?.trim() || null;
    setLogoUrl(existingLogo);
    setInitialLogoUrl(existingLogo);
    setIsActive(r.is_active);
    setModalOpen(true);
  }, []);

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
      const payload: {
        name: string;
        aliases: string[];
        is_active: boolean;
        logo_url?: string | null;
      } = {
        name: nm,
        aliases: parseAliases(),
        is_active: isActive,
      };
      const nextLogo = logoUrl?.trim() || null;
      const prevLogo = initialLogoUrl?.trim() || null;
      if (nextLogo !== prevLogo) {
        // Backend: field present + null/"" clears; non-empty sets. Omit when unchanged.
        payload.logo_url = nextLogo ?? "";
      }
      await updateShippingMethod(editing.id, { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId }, payload);
      setModalOpen(false);
      await softReload();
    } catch {
      setErr("Nie udało się zapisać metody dostawy.");
    } finally {
      setSaving(false);
    }
  };

  const fieldCls = "w-full border-2 border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-slate-800";
  const showLoading = warehouseId != null && shippingMethodsShouldUnmountList(loading, rows.length);
  const showList = warehouseId != null && (rows.length > 0 || !loading);

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

      {showLoading ? (
        <p className="px-4 py-10 text-center text-sm font-medium text-slate-600">Ładowanie…</p>
      ) : null}

      {showList ? (
        <div className="min-h-0 flex-1">
          {rows.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm font-medium text-slate-600">Brak metod.</p>
          ) : (
            <ul className="w-full divide-y divide-slate-200 border-y border-slate-300/80 bg-white">
              {rows.map((r) => (
                <ShippingMethodListRow key={r.id} row={r} onEdit={openEdit} />
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {modalOpen && editing ? (
        <AppOverlayPortal>
        <div
          className="fixed inset-0 z-[280] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
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
              <GhostButton type="button" onClick={closeModal} disabled={saving}>
                Anuluj
              </GhostButton>
              <PrimaryButton type="button" onClick={() => void save()} disabled={saving}>
                {saving ? "Zapisywanie…" : "Zapisz"}
              </PrimaryButton>
            </div>
          </div>
        </div>
        </AppOverlayPortal>
      ) : null}
    </div>
  );
}
