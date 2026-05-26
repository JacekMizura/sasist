import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronDown, ImagePlus, Trash2 } from "lucide-react";

import OrderCustomFieldIconPicker from "../../components/orders/OrderCustomFieldIconPicker";
import {
  createOrderCustomField,
  listOrderCustomFields,
  updateOrderCustomField,
  type OrderCustomFieldDto,
} from "../../api/orderCustomFieldsApi";
import { PageHeader } from "../../components/layout/PageHeader";
import { pageContainerWidthAlignClass } from "../../components/layout/PageLayout";
import { useAuth } from "../../context/AuthContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { formatApiErrorMessage } from "../../utils/formatApiErrorMessage";

/** Typ widoczny w UI — bez rozdzielenia SINGLE/MULTI (Lista + opcje niżej). */
type UiFieldKind = "TEXT" | "NUMBER" | "FILES" | "LIST" | "SALES_DOCUMENT" | "SHIPPING_LABEL";

const FIELD_TYPE_OPTIONS: { value: UiFieldKind; label: string }[] = [
  { value: "TEXT", label: "Pole tekstowe" },
  { value: "NUMBER", label: "Pole liczbowe" },
  { value: "FILES", label: "Pliki" },
  { value: "LIST", label: "Lista" },
  { value: "SALES_DOCUMENT", label: "Dokument sprzedaży" },
  { value: "SHIPPING_LABEL", label: "List przewozowy" },
];

function backendTypeFromUi(kind: UiFieldKind, listMulti: boolean): string {
  if (kind === "LIST") return listMulti ? "SELECT_MULTI" : "SELECT_SINGLE";
  return kind;
}

function uiFromBackendType(t: string): { kind: UiFieldKind; listMulti: boolean } {
  if (t === "SELECT_SINGLE") return { kind: "LIST", listMulti: false };
  if (t === "SELECT_MULTI") return { kind: "LIST", listMulti: true };
  if (
    t === "TEXT" ||
    t === "NUMBER" ||
    t === "FILES" ||
    t === "SALES_DOCUMENT" ||
    t === "SHIPPING_LABEL"
  ) {
    return { kind: t, listMulti: false };
  }
  return { kind: "TEXT", listMulti: false };
}

type OptionDraft = { label: string; sort_order: number };

function defaultSettings(type: string): Record<string, unknown> {
  switch (type) {
    case "TEXT":
      return { text: { subtype: "any" }, future: {} };
    case "NUMBER":
      return { number: { min: null, max: null, decimals: 2 }, future: {} };
    case "FILES":
      return { files: { mode: "documents" }, future: {} };
    case "SELECT_SINGLE":
    case "SELECT_MULTI":
      return { select: { multi: type === "SELECT_MULTI" }, future: {} };
    default:
      return { future: {} };
  }
}

function parseOptionsFromField(f: OrderCustomFieldDto): OptionDraft[] {
  return [...f.options]
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((o) => ({ label: o.label, sort_order: o.sort_order }));
}

function extractUiBlock(prev: Record<string, unknown>): Record<string, unknown> {
  const raw = prev.ui;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

/** Sekcje formularza — kompaktowy panel konfiguracyjny. */
const SECTION = "rounded-lg border border-slate-200/90 bg-slate-50/60 p-3 sm:p-4";
const LABEL = "block text-[12px] font-medium text-slate-700";
const INPUT =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-1 focus:ring-slate-300/40";
const SELECT_SHELL = "relative mt-1";

export default function OrderCustomFieldEditPage() {
  const { fieldId } = useParams<{ fieldId: string }>();
  const isCreate = !fieldId;
  const idNum = fieldId ? Number(fieldId) : NaN;

  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const tenantId = DAMAGE_TENANT_ID;

  const [loading, setLoading] = useState(!isCreate);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [uiKind, setUiKind] = useState<UiFieldKind>("TEXT");
  const [listMulti, setListMulti] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [settings, setSettings] = useState<Record<string, unknown>>(() => defaultSettings("TEXT"));
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const resolvedType = useMemo(() => backendTypeFromUi(uiKind, listMulti), [uiKind, listMulti]);

  const mergeSettings = useCallback((incoming: Record<string, unknown> | null | undefined, fieldType: string) => {
    const base = defaultSettings(fieldType);
    if (!incoming || typeof incoming !== "object") return base;
    const out = { ...base };
    for (const k of Object.keys(incoming)) {
      const v = incoming[k];
      if (k in out && typeof out[k] === "object" && out[k] !== null && typeof v === "object" && v !== null && !Array.isArray(v)) {
        out[k] = { ...(out[k] as Record<string, unknown>), ...(v as Record<string, unknown>) };
      } else {
        out[k] = v;
      }
    }
    return out;
  }, []);

  useEffect(() => {
    if (isCreate || !Number.isFinite(idNum)) {
      setLoading(false);
      return;
    }
    if (warehouseId == null) return;

    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const list = await listOrderCustomFields({
          tenant_id: tenantId,
          warehouse_id: warehouseId,
          active_only: false,
        });
        const found = list.find((x) => x.id === idNum);
        if (cancelled || !found) {
          if (!cancelled && !found) setErr("Nie znaleziono pola.");
          return;
        }
        const ui = uiFromBackendType(found.type);
        setName(found.name);
        setSlug(found.slug);
        setUiKind(ui.kind);
        setListMulti(ui.listMulti);
        setSortOrder(found.sort_order);
        setIsActive(found.is_active);
        setSettings(mergeSettings(found.settings_json as Record<string, unknown>, found.type));
        setOptions(parseOptionsFromField(found));
      } catch (e: unknown) {
        if (!cancelled) setErr(formatApiErrorMessage(e, "Nie udało się wczytać pola."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [idNum, isCreate, mergeSettings, tenantId, warehouseId]);

  const applyUiKindChange = (next: UiFieldKind) => {
    setUiKind(next);
    setSettings((prev) => {
      const ui = extractUiBlock(prev);
      if (next === "LIST") {
        return { ...defaultSettings("SELECT_SINGLE"), select: { multi: false }, ui };
      }
      return { ...defaultSettings(next), ui };
    });
    if (next === "LIST") {
      setListMulti(false);
      setOptions([{ label: "Opcja 1", sort_order: 0 }]);
    } else {
      setListMulti(false);
      setOptions([]);
    }
  };

  const applyListMultiChange = (multi: boolean) => {
    setListMulti(multi);
    setSettings((prev) => ({
      ...prev,
      select: { ...((prev.select as object) ?? {}), multi },
    }));
  };

  const payload = useMemo(() => {
    const optPayload = options.map((o, i) => ({
      label: o.label.trim() || `Opcja ${i + 1}`,
      sort_order: Number.isFinite(o.sort_order) ? o.sort_order : i,
    }));
    const t = resolvedType;
    return {
      name: name.trim() || "Pole",
      slug: slug.trim() || null,
      type: t,
      settings_json: settings,
      icon_file_id: null as number | null,
      sort_order: sortOrder,
      is_active: isActive,
      options: t === "SELECT_SINGLE" || t === "SELECT_MULTI" ? optPayload : [],
    };
  }, [name, slug, resolvedType, settings, sortOrder, isActive, options]);

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (warehouseId == null) return;
    const t = resolvedType;
    if ((t === "SELECT_SINGLE" || t === "SELECT_MULTI") && payload.options.length === 0) {
      setErr("Dodaj co najmniej jedną opcję listy.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (isCreate) {
        await createOrderCustomField({ tenant_id: tenantId, warehouse_id: warehouseId }, payload);
        navigate("/orders/custom-fields");
      } else if (Number.isFinite(idNum)) {
        await updateOrderCustomField(idNum, { tenant_id: tenantId, warehouse_id: warehouseId }, payload);
        navigate("/orders/custom-fields");
      }
    } catch (e: unknown) {
      setErr(formatApiErrorMessage(e, "Zapis nie powiódł się."));
    } finally {
      setSaving(false);
    }
  };

  const textSubtype = String((settings.text as { subtype?: string } | undefined)?.subtype ?? "any");
  const num = (settings.number as { min?: number | null; max?: number | null; decimals?: number | null } | undefined) ?? {};
  const fileMode = String((settings.files as { mode?: string } | undefined)?.mode ?? "documents");

  const contentShell = `mx-auto w-full max-w-5xl ${pageContainerWidthAlignClass}`;

  const breadcrumbs = useMemo(() => {
    const base = [
      { label: "Zamówienia", to: "/orders/list" as const },
      { label: "Dodatkowe pola", to: "/orders/custom-fields" as const },
    ];
    if (isCreate) return [...base, { label: "Nowe pole" }];
    return [...base, { label: name.trim() || "Edycja pola" }];
  }, [isCreate, name]);

  if (warehouseId == null) {
    return (
      <div className={`${contentShell} py-6`}>
        <p className="text-sm text-slate-600">Wybierz magazyn w nagłówku aplikacji.</p>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className={`${contentShell} py-6 text-sm text-slate-600`}>
        Wczytywanie sesji…
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`${contentShell} py-6`}>
        <p className="text-sm text-slate-600">
          <Link to="/login" className="font-medium text-blue-700 hover:underline">
            Zaloguj się
          </Link>{" "}
          — wymagana aktywna sesja, aby zapisać pole.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`${contentShell} py-6 text-sm text-slate-600`}>
        Wczytywanie…
      </div>
    );
  }

  return (
    <div className="min-h-full w-full pb-28">
      <div className={`${contentShell} pb-6 pt-4`}>
        <PageHeader
          className="space-y-4"
          breadcrumbs={breadcrumbs}
          title={
            <span className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {isCreate ? "Nowe pole" : "Edycja pola"}
            </span>
          }
        />

        {err ? (
          <div
            className="mb-3 mt-2 max-w-2xl rounded-md border border-red-200/90 bg-red-50/90 px-2.5 py-1.5 text-[11px] leading-snug text-red-900"
            role="alert"
          >
            {err}
          </div>
        ) : null}

        <form id="ocf-edit-form" onSubmit={(e) => void onSubmit(e)} className="space-y-3">
          <section className={SECTION}>
            <div className="mt-3 space-y-3">
              <label className={LABEL}>
                Nazwa pola <span className="font-normal text-red-600">*</span>
                <input required className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Np. Numer referencyjny" />
              </label>

              <details className="group rounded-lg border border-slate-200/80 bg-white/60">
                <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-slate-600 marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex items-center gap-2">
                    <span className="text-slate-400 transition group-open:rotate-90">▸</span>
                    Zaawansowane
                  </span>
                </summary>
                <div className="border-t border-slate-100 px-3 pb-3 pt-2">
                  <label className={LABEL}>
                    Identyfikator techniczny <span className="font-normal text-slate-400">— opcjonalnie</span>
                    <input
                      className={`${INPUT} font-mono text-[12px]`}
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="np. numer_referencyjny"
                    />
                  </label>
                  <p className="mt-1 text-[11px] leading-snug text-slate-500">Puste = wygenerujemy automatycznie z nazwy.</p>
                </div>
              </details>
            </div>

            <div className="mt-3 border-t border-slate-200/80 pt-2">
              <span className={LABEL}>Ikona</span>
              <div className="mt-2">
                <OrderCustomFieldIconPicker
                  backendType={resolvedType}
                  previewSettings={settings}
                  lucideKey={(settings.ui as { icon?: string | null } | undefined)?.icon ?? null}
                  onLucideKeyChange={(next) =>
                    setSettings((prev) => ({
                      ...prev,
                      ui: { ...extractUiBlock(prev), icon: next },
                    }))
                  }
                  customIconUrl={(settings.ui as { custom_icon_url?: string | null } | undefined)?.custom_icon_url ?? null}
                  onCustomIconUrlChange={(next) =>
                    setSettings((prev) => ({
                      ...prev,
                      ui: { ...extractUiBlock(prev), custom_icon_url: next },
                    }))
                  }
                  definitionUpload={
                    !isCreate && Number.isFinite(idNum) && warehouseId != null
                      ? {
                          fieldId: idNum,
                          tenantId,
                          warehouseId,
                          onDefinitionUpdated: (dto) =>
                            setSettings(mergeSettings(dto.settings_json as Record<string, unknown>, dto.type)),
                        }
                      : undefined
                  }
                />
              </div>
            </div>

            <div className="mt-4">
              <span className={LABEL}>Typ pola</span>
              <div className={SELECT_SHELL}>
                <select
                  className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-2.5 pr-9 text-sm font-medium text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-300/40"
                  value={uiKind}
                  onChange={(e) => applyUiKindChange(e.target.value as UiFieldKind)}
                >
                  {FIELD_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:items-end">
              <label className={LABEL}>
                Kolejność
                <input
                  type="number"
                  className={`${INPUT} tabular-nums`}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Aktywne (widoczne na zamówieniach)
              </label>
            </div>
          </section>

          <section className={SECTION}>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Konfiguracja typu</h2>

            {uiKind === "TEXT" ? (
              <div className="mt-3">
                <p className="text-sm font-medium text-slate-800">Format danych</p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {(
                    [
                      { v: "any", label: "Dowolny tekst" },
                      { v: "email", label: "E-mail" },
                      { v: "url", label: "URL" },
                    ] as const
                  ).map(({ v, label }) => (
                    <label
                      key={v}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition hover:border-slate-200"
                    >
                      <input
                        type="radio"
                        name="text-subtype"
                        className="text-slate-900 focus:ring-slate-400"
                        checked={textSubtype === v}
                        onChange={() =>
                          setSettings((prev) => ({
                            ...prev,
                            text: { ...((prev.text as object) ?? {}), subtype: v },
                          }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                    checked={Boolean((settings.text as { multiline?: boolean } | undefined)?.multiline)}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        text: { ...((prev.text as object) ?? {}), multiline: e.target.checked },
                      }))
                    }
                  />
                  Wiele linii (pole tekstowe na zamówieniu)
                </label>
              </div>
            ) : null}

            {uiKind === "NUMBER" ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className={LABEL}>
                  Min
                  <input
                    type="number"
                    className={`${INPUT} tabular-nums`}
                    value={num.min ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSettings((prev) => ({
                        ...prev,
                        number: { ...((prev.number as object) ?? {}), min: v === "" ? null : Number(v) },
                      }));
                    }}
                  />
                </label>
                <label className={LABEL}>
                  Max
                  <input
                    type="number"
                    className={`${INPUT} tabular-nums`}
                    value={num.max ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSettings((prev) => ({
                        ...prev,
                        number: { ...((prev.number as object) ?? {}), max: v === "" ? null : Number(v) },
                      }));
                    }}
                  />
                </label>
                <label className={LABEL}>
                  Miejsca po przecinku
                  <input
                    type="number"
                    min={0}
                    max={8}
                    className={`${INPUT} tabular-nums`}
                    value={num.decimals ?? 2}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        number: { ...((prev.number as object) ?? {}), decimals: Number(e.target.value) },
                      }))
                    }
                  />
                </label>
              </div>
            ) : null}

            {uiKind === "FILES" ? (
              <div className="mt-3">
                <p className="text-sm font-medium text-slate-800">Typ plików</p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {(
                    [
                      { v: "images", label: "Zdjęcia" },
                      { v: "documents", label: "Dokumenty" },
                      { v: "both", label: "Zdjęcia i dokumenty" },
                    ] as const
                  ).map(({ v, label }) => (
                    <label
                      key={v}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition hover:border-slate-200"
                    >
                      <input
                        type="radio"
                        name="files-mode"
                        className="text-slate-900 focus:ring-slate-400"
                        checked={fileMode === v}
                        onChange={() =>
                          setSettings((prev) => ({
                            ...prev,
                            files: { ...((prev.files as object) ?? {}), mode: v },
                          }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  Akceptowane m.in. PNG, JPG, PDF — dokładne reguły zależą od ustawień magazynu.
                </p>
              </div>
            ) : null}

            {uiKind === "LIST" ? (
              <div className="mt-3 space-y-4">
                <div>
                  <p className="text-sm font-medium text-slate-800">Rodzaj wyboru</p>
                  <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:gap-3">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2 text-sm font-medium text-slate-800">
                      <input
                        type="radio"
                        name="list-multi"
                        checked={!listMulti}
                        onChange={() => applyListMultiChange(false)}
                        className="text-slate-900 focus:ring-slate-400"
                      />
                      Jedna opcja
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2 text-sm font-medium text-slate-800">
                      <input
                        type="radio"
                        name="list-multi"
                        checked={listMulti}
                        onChange={() => applyListMultiChange(true)}
                        className="text-slate-900 focus:ring-slate-400"
                      />
                      Wiele opcji
                    </label>
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800">Opcje listy</p>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                      onClick={() => setOptions((prev) => [...prev, { label: "", sort_order: prev.length }])}
                    >
                      + Dodaj opcję
                    </button>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {options.map((op, idx) => (
                      <li
                        key={`opt-${idx}`}
                        className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2"
                      >
                        <input
                          className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-400/15"
                          placeholder={`Opcja ${idx + 1}`}
                          value={op.label}
                          onChange={(e) =>
                            setOptions((prev) => prev.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))
                          }
                        />
                        <button
                          type="button"
                          title="Ikona opcji (opcjonalnie)"
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-slate-400 transition hover:border-slate-400 hover:text-slate-600"
                          disabled
                        >
                          <ImagePlus className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </button>
                        <button
                          type="button"
                          title="Usuń opcję"
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setOptions((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </button>
                        <label className="flex items-center gap-1 text-xs text-slate-500">
                          <span className="sr-only">Kolejność</span>
                          <input
                            type="number"
                            className="w-14 rounded border border-slate-200 bg-white px-2 py-1 text-xs tabular-nums"
                            title="Kolejność"
                            value={op.sort_order}
                            onChange={(e) =>
                              setOptions((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, sort_order: Number(e.target.value) } : x)),
                              )
                            }
                          />
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            {uiKind === "SALES_DOCUMENT" ? (
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                Pole przechowuje jeden plik dokumentu sprzedaży wgrany bezpośrednio przy zamówieniu (pobieranie, podmiana, usunięcie).
              </p>
            ) : null}
            {uiKind === "SHIPPING_LABEL" ? (
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                Pole przechowuje jeden plik listu przewozowego wgrany bezpośrednio przy zamówieniu (pobieranie, podmiana, usunięcie).
              </p>
            ) : null}

            {uiKind === "TEXT" || uiKind === "NUMBER" || uiKind === "FILES" || uiKind === "LIST" ? null : uiKind === "SALES_DOCUMENT" || uiKind === "SHIPPING_LABEL" ? null : (
              <p className="mt-5 text-sm text-slate-500">Brak dodatkowej konfiguracji dla tego typu.</p>
            )}
          </section>
        </form>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 shadow-[0_-4px_24px_rgba(15,23,42,0.06)] backdrop-blur-sm supports-[backdrop-filter]:bg-white/85">
        <div className={`${contentShell} flex flex-wrap items-center justify-between gap-3 py-3 sm:py-4`}>
          <Link
            to="/orders/custom-fields"
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Anuluj
          </Link>
          <button
            type="submit"
            form="ocf-edit-form"
            disabled={saving}
            className="rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Zapisywanie…" : isCreate ? "Utwórz pole" : "Zapisz pole"}
          </button>
        </div>
      </div>
    </div>
  );
}
