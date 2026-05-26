import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../../api/axios";
import {
  EXPORT_FIELD_OPTIONS,
  type ExportEntityType,
  createExportTemplate,
  listExportTemplates,
  updateExportTemplate,
} from "../../api/exportsApi";
import { csvFieldLabelPl, entityTypeLabelPl } from "../../utils/exportImportLabelsPl";
import { EXPORT_FIELD_SECTIONS } from "../../utils/exportFieldSections";
import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";

const TENANT_ID = 1;

const ENTITY_TYPES: ExportEntityType[] = [
  "products",
  "sets",
  "orders",
  "cartons",
  "suppliers",
  "manufacturers",
  "customers",
  "label_templates",
];

type LabelTplOpt = { id: number; name: string; template_type: string | null };

function matchesFieldSearch(entityType: ExportEntityType, fieldKey: string, q: string): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  const label = csvFieldLabelPl(entityType, fieldKey).toLowerCase();
  return label.includes(needle) || fieldKey.toLowerCase().includes(needle);
}

export default function ExportEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  const [name, setName] = useState("");
  const [entityType, setEntityType] = useState<ExportEntityType>("products");
  const [fields, setFields] = useState<string[]>([...EXPORT_FIELD_OPTIONS.products]);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [labelTplRows, setLabelTplRows] = useState<LabelTplOpt[]>([]);
  const [labelTplLoading, setLabelTplLoading] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");

  const options = useMemo(() => [...EXPORT_FIELD_OPTIONS[entityType]], [entityType]);

  const fieldSections = useMemo(() => {
    const preset = EXPORT_FIELD_SECTIONS[entityType];
    if (preset?.length) {
      return preset.map((s) => ({
        ...s,
        fields: s.fields.filter((f) => options.includes(f) && matchesFieldSearch(entityType, f, fieldSearch)),
      })).filter((s) => s.fields.length > 0);
    }
    const filtered = options.filter((f) => matchesFieldSearch(entityType, f, fieldSearch));
    return [{ id: "all", title: "Pola eksportu", fields: filtered }];
  }, [entityType, options, fieldSearch]);

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    listExportTemplates(TENANT_ID)
      .then((rows) => {
        const row = rows.find((r) => String(r.id) === id);
        if (!row) {
          setErr("Nie znaleziono szablonu");
          return;
        }
        setName(row.name);
        setEntityType(row.type);
        setFields(row.fields_json?.length ? [...row.fields_json] : [...EXPORT_FIELD_OPTIONS[row.type]]);
        setIsActive(row.is_active);
      })
      .catch((e) => setErr(e?.message ?? "Błąd"))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  useEffect(() => {
    if (entityType !== "label_templates") {
      setLabelTplRows([]);
      return;
    }
    setLabelTplLoading(true);
    api
      .get<LabelTplOpt[]>("/label-templates/", { params: { tenant_id: TENANT_ID } })
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : [];
        setLabelTplRows(rows.map((r) => ({ id: r.id, name: r.name, template_type: r.template_type ?? null })));
      })
      .catch(() => setLabelTplRows([]))
      .finally(() => setLabelTplLoading(false));
  }, [entityType]);

  const toggleField = useCallback((f: string) => {
    setFields((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }, []);

  const selectAllVisible = useCallback(() => {
    const keys = new Set<string>();
    fieldSections.forEach((s) => s.fields.forEach((f) => keys.add(f)));
    if (keys.size === 0) {
      setFields([...options]);
      return;
    }
    setFields((prev) => {
      const n = new Set(prev);
      keys.forEach((k) => n.add(k));
      return [...n];
    });
  }, [fieldSections, options]);

  const clearVisible = useCallback(() => {
    const keys = new Set<string>();
    fieldSections.forEach((s) => s.fields.forEach((f) => keys.add(f)));
    if (keys.size === 0) {
      setFields([]);
      return;
    }
    setFields((prev) => prev.filter((f) => !keys.has(f)));
  }, [fieldSections]);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      if (isNew) {
        await createExportTemplate(TENANT_ID, {
          name: name.trim() || "Bez nazwy",
          type: entityType,
          fields_json:
            entityType === "label_templates"
              ? fields.filter((x) => /^\d+$/.test(x))
              : fields.length
                ? fields
                : [...options],
          is_active: isActive,
        });
        navigate("/settings/exports");
      } else {
        await updateExportTemplate(TENANT_ID, Number(id), {
          name: name.trim() || "Bez nazwy",
          type: entityType,
          fields_json:
            entityType === "label_templates"
              ? fields.filter((x) => /^\d+$/.test(x))
              : fields.length
                ? fields
                : [...options],
          is_active: isActive,
        });
        navigate("/settings/exports");
      }
    } catch (e: unknown) {
      const m = e as { message?: string };
      setErr(m?.message ?? "Zapis nie powiódł się");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="py-12 text-center text-sm text-slate-500">Ładowanie…</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title={isNew ? "Nowy szablon eksportu" : "Edycja szablonu eksportu"}
        subtitle="Wybierz typ danych, pola do wyeksportowania i zapisz szablon. Wygenerowany plik CSV ma nagłówki po polsku."
        breadcrumbs={[
          { label: "Ustawienia", to: "/settings/wms" },
          { label: "Eksport", to: "/settings/exports" },
          { label: isNew ? "Nowy szablon" : "Edycja" },
        ]}
      />

      {err && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</div>}

      <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Nazwa szablonu</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="np. Produkty — pełny"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Typ encji</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={entityType}
            onChange={(e) => {
              const nt = e.target.value as ExportEntityType;
              setEntityType(nt);
              setFieldSearch("");
              if (nt === "label_templates") {
                setFields([]);
              } else {
                setFields([...EXPORT_FIELD_OPTIONS[nt]]);
              }
            }}
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {entityTypeLabelPl(t)}
              </option>
            ))}
          </select>
        </label>

        {entityType === "label_templates" ? (
          <fieldset className="space-y-2 border-t border-slate-100 pt-4">
            <legend className="text-sm font-semibold text-slate-800">Szablony do eksportu (JSON)</legend>
            <p className="text-xs text-slate-500">
              Zaznacz jeden lub wiele szablonów — w pliku JSON znajdzie się pełna struktura layoutu (template_json).
            </p>
            {labelTplLoading ? (
              <p className="text-sm text-slate-500">Ładowanie listy szablonów…</p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/40 p-2">
                {labelTplRows.length === 0 ? (
                  <p className="text-sm text-slate-500">Brak szablonów w bazie.</p>
                ) : (
                  labelTplRows.map((r) => {
                    const sid = String(r.id);
                    return (
                      <label
                        key={r.id}
                        className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm hover:bg-white"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 rounded border-slate-300"
                          checked={fields.includes(sid)}
                          onChange={() => toggleField(sid)}
                        />
                        <span className="min-w-0 flex-1 leading-snug">
                          <span className="font-medium text-slate-800">{r.name}</span>{" "}
                          <span className="text-slate-400">({r.template_type || "—"})</span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            )}
          </fieldset>
        ) : (
          <fieldset className="space-y-3 border-t border-slate-100 pt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <legend className="text-sm font-semibold text-slate-800">Pola w pliku CSV</legend>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={selectAllVisible}
                >
                  Zaznacz widoczne
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={clearVisible}
                >
                  Wyczyść widoczne
                </button>
              </div>
            </div>
            <input
              type="search"
              value={fieldSearch}
              onChange={(e) => setFieldSearch(e.target.value)}
              placeholder="Szukaj pola…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="space-y-4">
              {fieldSections.length === 0 ? (
                <p className="text-sm text-slate-500">Brak pól pasujących do wyszukiwania.</p>
              ) : (
                fieldSections.map((section) => (
                  <div key={section.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{section.title}</h3>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {section.fields.map((f) => (
                        <label
                          key={f}
                          className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent px-2 py-1.5 hover:border-slate-200 hover:bg-white"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 rounded border-slate-300"
                            checked={fields.includes(f)}
                            onChange={() => toggleField(f)}
                          />
                          <span className="min-w-0 flex-1 text-sm leading-snug text-slate-800">{csvFieldLabelPl(entityType, f)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </fieldset>
        )}

        <label className="flex items-center gap-2 border-t border-slate-100 pt-4 text-sm text-slate-700">
          <input type="checkbox" className="rounded border-slate-300" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Aktywny (dostępny na listach i w modalu eksportu)
        </label>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Link to="/settings/exports" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50">
            Anuluj
          </Link>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-cyan-700 disabled:opacity-50"
          >
            {saving ? "Zapisywanie…" : isNew ? "Utwórz" : "Zapisz"}
          </button>
        </div>
      </div>
    </PageLayout>
  );
}
