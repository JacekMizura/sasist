import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Link2, Loader2, Trash2, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

import {
  getProductCustomFieldsWithValues,
  putProductCustomFieldValues,
  uploadProductCustomFieldFile,
  type ProductCustomFieldFileMeta,
  type ProductCustomFieldWithValue,
} from "../../api/productCustomFieldsApi";
import { extractApiErrorMessage } from "../../api/authApi";
import { getBackendPublicOrigin } from "../../config/apiBase";
import { Checkbox, GhostButton, Input, PrimaryButton, Select } from "../../design-system";

type Props = {
  productId: number;
  tenantId: number;
};

function publicUrl(path: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const origin = getBackendPublicOrigin();
  if (!origin) return path;
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

function isFileField(type: string): boolean {
  return type === "FILES" || type === "GPSR_ATTACHMENTS" || type === "ATTACHMENTS";
}

function filesFrom(row: ProductCustomFieldWithValue): ProductCustomFieldFileMeta[] {
  const j = row.value?.json_value;
  return Array.isArray(j) ? (j as ProductCustomFieldFileMeta[]) : [];
}

/**
 * Product card → Podstawowe: additional fields above history.
 */
export function ProductAdditionalFieldsSection({ productId, tenantId }: Props) {
  const [rows, setRows] = useState<ProductCustomFieldWithValue[]>([]);
  const [drafts, setDrafts] = useState<Record<number, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProductCustomFieldsWithValues(tenantId, productId);
      setRows(data);
      const next: Record<number, unknown> = {};
      for (const row of data) {
        const ft = row.field.type;
        const v = row.value;
        if (ft === "TEXT") next[row.field.id] = v?.string_value ?? "";
        else if (ft === "NUMBER") next[row.field.id] = v?.number_value != null ? String(v.number_value) : "";
        else if (ft === "SELECT_SINGLE") next[row.field.id] = v?.string_value ?? "";
        else if (ft === "SELECT_MULTI") next[row.field.id] = Array.isArray(v?.json_value) ? v!.json_value : [];
        else if (isFileField(ft)) next[row.field.id] = filesFrom(row);
        else next[row.field.id] = null;
      }
      setDrafts(next);
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się wczytać pól dodatkowych."));
    } finally {
      setLoading(false);
    }
  }, [tenantId, productId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onSave = async () => {
    setSaving(true);
    try {
      const values = rows.map((row) => {
        const ft = row.field.type;
        const d = drafts[row.field.id];
        if (ft === "TEXT") return { field_id: row.field.id, string_value: String(d ?? "") };
        if (ft === "NUMBER") {
          const raw = String(d ?? "").trim();
          return {
            field_id: row.field.id,
            number_value: raw === "" ? null : Number(raw),
          };
        }
        if (ft === "SELECT_SINGLE") {
          return { field_id: row.field.id, string_value: String(d ?? "") || null, json_value: d || null };
        }
        if (ft === "SELECT_MULTI") {
          return { field_id: row.field.id, json_value: Array.isArray(d) ? d : [] };
        }
        if (isFileField(ft)) {
          return { field_id: row.field.id, json_value: Array.isArray(d) ? d : [] };
        }
        return { field_id: row.field.id };
      });
      const updated = await putProductCustomFieldValues(tenantId, productId, values);
      setRows(updated);
      toast.success("Zapisano pola dodatkowe.");
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Zapis pól nie powiódł się."));
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (fieldId: number, file: File) => {
    setUploadingId(fieldId);
    try {
      const meta = await uploadProductCustomFieldFile(tenantId, productId, fieldId, file);
      setDrafts((prev) => {
        const cur = Array.isArray(prev[fieldId]) ? [...(prev[fieldId] as ProductCustomFieldFileMeta[])] : [];
        return { ...prev, [fieldId]: [...cur, meta] };
      });
      toast.success("Dodano plik — zapisz pola, aby utrwalić.");
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Upload nie powiódł się."));
    } finally {
      setUploadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="mt-8 border-t border-slate-100 pt-4">
        <p className="text-sm text-slate-500">Ładowanie pól dodatkowych…</p>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="mt-8 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Pola dodatkowe</h3>
          <Link to="/product-custom-fields/new" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            Skonfiguruj pola
          </Link>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Brak aktywnych pól. Dodaj je w Asortyment → Pola dodatkowe produktów.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 border-t border-slate-100 pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Pola dodatkowe</h3>
          <p className="text-xs text-slate-500">Wartości zapisywane osobno — nie wymaga zapisu całej karty produktu.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/product-custom-fields" className="text-sm text-blue-700 hover:underline">
            Zarządzaj polami
          </Link>
          <PrimaryButton type="button" density="compact" disabled={saving} onClick={() => void onSave()}>
            {saving ? "Zapisywanie…" : "Zapisz pola"}
          </PrimaryButton>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {rows.map((row) => {
          const ft = row.field.type;
          const id = row.field.id;
          const draft = drafts[id];
          return (
            <div key={id} className="border-b border-slate-100 pb-4 last:border-b-0 last:pb-0">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {row.field.name}
                {ft === "GPSR_ATTACHMENTS" ? (
                  <span className="ml-2 font-normal normal-case text-slate-400">GPSR</span>
                ) : null}
                {ft === "ATTACHMENTS" ? (
                  <span className="ml-2 font-normal normal-case text-slate-400">
                    {(row.field.settings_json?.attachments as { kind?: string } | undefined)?.kind ?? "załącznik"}
                  </span>
                ) : null}
              </label>

              {ft === "TEXT" ? (
                <Input
                  value={String(draft ?? "")}
                  onChange={(e) => setDrafts((p) => ({ ...p, [id]: e.target.value }))}
                />
              ) : null}

              {ft === "NUMBER" ? (
                <Input
                  type="number"
                  step="any"
                  value={String(draft ?? "")}
                  onChange={(e) => setDrafts((p) => ({ ...p, [id]: e.target.value }))}
                  className="max-w-xs"
                />
              ) : null}

              {ft === "SELECT_SINGLE" ? (
                <Select
                  value={String(draft ?? "")}
                  onChange={(e) => setDrafts((p) => ({ ...p, [id]: e.target.value }))}
                >
                  <option value="">— wybierz —</option>
                  {row.field.options.map((o) => (
                    <option key={o.id} value={String(o.id)}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : null}

              {ft === "SELECT_MULTI" ? (
                <div className="flex flex-wrap gap-3">
                  {row.field.options.map((o) => {
                    const selected = Array.isArray(draft) ? (draft as number[]).includes(o.id) : false;
                    return (
                      <label key={o.id} className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <Checkbox
                          checked={selected}
                          onChange={(e) => {
                            setDrafts((p) => {
                              const cur = Array.isArray(p[id]) ? [...(p[id] as number[])] : [];
                              const next = e.target.checked
                                ? Array.from(new Set([...cur, o.id]))
                                : cur.filter((x) => x !== o.id);
                              return { ...p, [id]: next };
                            });
                          }}
                        />
                        {o.label}
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {isFileField(ft) ? (
                <div className="space-y-2">
                  <ul className="space-y-1">
                    {(Array.isArray(draft) ? (draft as ProductCustomFieldFileMeta[]) : []).map((f, idx) => (
                      <li
                        key={`${f.stored_filename}-${idx}`}
                        className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                      >
                        <span className="truncate text-slate-800">{f.original_filename}</span>
                        <div className="flex shrink-0 gap-1">
                          <a
                            href={publicUrl(f.file_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center rounded px-2 py-1 text-slate-600 hover:bg-white"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          <GhostButton
                            type="button"
                            density="compact"
                            onClick={() =>
                              setDrafts((p) => ({
                                ...p,
                                [id]: (Array.isArray(p[id]) ? (p[id] as ProductCustomFieldFileMeta[]) : []).filter(
                                  (_, i) => i !== idx,
                                ),
                              }))
                            }
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </GhostButton>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <input
                    ref={(el) => {
                      fileRefs.current[id] = el;
                    }}
                    type="file"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void onUpload(id, file);
                    }}
                  />
                  <GhostButton
                    type="button"
                    density="compact"
                    disabled={uploadingId === id}
                    onClick={() => fileRefs.current[id]?.click()}
                  >
                    {uploadingId === id ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-1 h-4 w-4" />
                    )}
                    Dodaj plik
                  </GhostButton>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
