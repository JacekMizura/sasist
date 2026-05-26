import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Download, File as FileIcon, Loader2, Pencil, Upload, X } from "lucide-react";

import {
  getOrderCustomFieldsWithValues,
  putOrderCustomFieldValues,
  uploadOrderCustomFieldFile,
  type OrderCustomFieldDto,
  type OrderCustomFieldWithValueDto,
} from "../../api/orderCustomFieldsApi";
import { getBackendPublicOrigin } from "../../config/apiBase";
import { formatApiError } from "../../utils/apiErrorMessage";
import OrderCustomFieldGlyph from "./OrderCustomFieldGlyph";

type OrderDocBrief = {
  id: number;
  document_type: string;
  original_filename: string;
  file_url: string;
  created_at?: string | null;
};

/** Mała ikona w wierszu metadanych — ta sama dla wszystkich typów. */
const GLYPH_BOX_CLASS =
  "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200/90 bg-slate-50 text-slate-600";

const GLYPH_LUCIDE_CLASS = "h-3.5 w-3.5";

/** Akcje: zawsze widoczne na małym ekranie; na lg subtelnie po hoverze wiersza. */
const ROW_ACTIONS_CLASS =
  "flex shrink-0 items-center gap-0.5 opacity-100 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:group-focus-within:opacity-100";

function resolvePublicFileUrl(path: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const origin = getBackendPublicOrigin();
  if (!origin) return path;
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

function isAttachmentListField(ft: string): boolean {
  return ft === "FILES" || ft === "SALES_DOCUMENT" || ft === "SHIPPING_LABEL";
}

function emptyDraft(ft: string): unknown {
  switch (ft) {
    case "TEXT":
      return "";
    case "NUMBER":
      return "";
    case "FILES":
    case "SALES_DOCUMENT":
    case "SHIPPING_LABEL":
      return [];
    case "SELECT_SINGLE":
      return "";
    case "SELECT_MULTI":
      return [];
    default:
      return null;
  }
}

function draftFromRow(row: OrderCustomFieldWithValueDto, documents: OrderDocBrief[]): unknown {
  const ft = row.field.type;
  const v = row.value;
  if (!v) return emptyDraft(ft);
  if (ft === "TEXT") return v.string_value ?? "";
  if (ft === "NUMBER") return v.number_value != null ? String(v.number_value) : "";
  if (ft === "FILES") return Array.isArray(v.json_value) ? v.json_value : [];
  if (ft === "SELECT_SINGLE") {
    if (v.string_value && /^\d+$/.test(v.string_value)) return v.string_value;
    if (typeof v.json_value === "number") return String(v.json_value);
    return "";
  }
  if (ft === "SELECT_MULTI") return Array.isArray(v.json_value) ? v.json_value.map(Number) : [];
  if (ft === "SALES_DOCUMENT" || ft === "SHIPPING_LABEL") {
    const j = v.json_value;
    if (Array.isArray(j)) return j;
    if (j && typeof j === "object" && "order_document_id" in j) {
      const id = Number((j as { order_document_id?: number }).order_document_id);
      if (!Number.isFinite(id)) return [];
      const doc = documents.find((d) => d.id === id);
      if (!doc) return [];
      return [
        {
          original_filename: doc.original_filename,
          file_url: doc.file_url,
          order_document_id: doc.id,
        },
      ];
    }
    return [];
  }
  return emptyDraft(ft);
}

function buildPayload(field: OrderCustomFieldDto, draft: unknown): {
  field_id: number;
  string_value?: string | null;
  number_value?: number | null;
  json_value?: unknown;
} {
  const id = field.id;
  const ft = field.type;
  if (ft === "TEXT") {
    const s = typeof draft === "string" ? draft.trim() : "";
    return { field_id: id, string_value: s || null };
  }
  if (ft === "NUMBER") {
    const raw = typeof draft === "string" ? draft.trim().replace(",", ".") : "";
    if (!raw) return { field_id: id, number_value: null };
    const n = Number(raw);
    if (!Number.isFinite(n)) return { field_id: id, number_value: null };
    return { field_id: id, number_value: n };
  }
  if (ft === "FILES" || ft === "SALES_DOCUMENT" || ft === "SHIPPING_LABEL") {
    const arr = Array.isArray(draft) ? draft : [];
    return { field_id: id, json_value: arr.length ? arr : null };
  }
  if (ft === "SELECT_SINGLE") {
    const raw = draft === "" || draft == null ? "" : String(draft);
    if (!raw) return { field_id: id, json_value: null };
    return { field_id: id, json_value: Number(raw) };
  }
  if (ft === "SELECT_MULTI") {
    const arr = Array.isArray(draft) ? draft.map((x) => Number(x)).filter((x) => Number.isFinite(x)) : [];
    return { field_id: id, json_value: arr.length ? arr : null };
  }
  return { field_id: id };
}

function payloadsEqual(
  a: ReturnType<typeof buildPayload>,
  b: ReturnType<typeof buildPayload>,
): boolean {
  const norm = (x: typeof a) =>
    JSON.stringify({
      field_id: x.field_id,
      string_value: x.string_value ?? null,
      number_value: x.number_value ?? null,
      json_value: x.json_value ?? null,
    });
  return norm(a) === norm(b);
}

function validateDraft(field: OrderCustomFieldDto, draft: unknown): string | null {
  const settings = (field.settings_json ?? {}) as Record<string, unknown>;
  const ft = field.type;
  if (ft === "TEXT") {
    const s = typeof draft === "string" ? draft.trim() : "";
    if (!s) return null;
    const sub = String((settings.text as { subtype?: string } | undefined)?.subtype ?? "any").toLowerCase();
    if (sub === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "Nieprawidłowy e-mail.";
    }
    if (sub === "url") {
      if (!/^https?:\/\//i.test(s)) return "URL musi zaczynać się od http:// lub https://";
    }
  }
  if (ft === "NUMBER") {
    const raw = typeof draft === "string" ? draft.trim().replace(",", ".") : "";
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return "Nieprawidłowa liczba.";
    const num = settings.number as { min?: number | null; max?: number | null } | undefined;
    if (num?.min != null && n < Number(num.min)) return `Wartość musi być ≥ ${num.min}`;
    if (num?.max != null && n > Number(num.max)) return `Wartość musi być ≤ ${num.max}`;
  }
  return null;
}

type Props = {
  orderId: number;
  /** Do odczytu starych wartości powiązanych z rekordem dokumentu (legacy) — bez wymuszania zakładki Dokumenty. */
  documents: OrderDocBrief[];
  /** Po uploadzie pliku — odśwież zamówienie (np. gdy pole FILES tworzy wpis w dokumentach). */
  onOrderRefresh?: () => void;
};

export default function OrderAdditionalFieldsSection({ orderId, documents, onOrderRefresh }: Props) {
  const [rows, setRows] = useState<OrderCustomFieldWithValueDto[]>([]);
  const [draftByFieldId, setDraftByFieldId] = useState<Record<number, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<Record<number, string | null>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filesDragFieldId, setFilesDragFieldId] = useState<number | null>(null);

  const documentsRef = useRef<OrderDocBrief[]>(documents);
  documentsRef.current = documents;

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await getOrderCustomFieldsWithValues(orderId);
      setRows(list);
      const next: Record<number, unknown> = {};
      for (const r of list) {
        next[r.field.id] = draftFromRow(r, documentsRef.current);
      }
      setDraftByFieldId(next);
      setRowErr({});
    } catch (e) {
      setErr(formatApiError(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!rows.length) return;
    setDraftByFieldId((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const r of rows) {
        const ft = r.field.type;
        if (ft !== "SALES_DOCUMENT" && ft !== "SHIPPING_LABEL") continue;
        const j = r.value?.json_value;
        if (!j || typeof j !== "object" || Array.isArray(j) || !("order_document_id" in j)) continue;
        const cur = next[r.field.id];
        if (Array.isArray(cur) && cur.length > 0) continue;
        const docId = Number((j as { order_document_id?: number }).order_document_id);
        if (!Number.isFinite(docId)) continue;
        const doc = documents.find((d) => d.id === docId);
        if (!doc) continue;
        next[r.field.id] = [
          { original_filename: doc.original_filename, file_url: doc.file_url, order_document_id: doc.id },
        ];
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [rows, documents]);

  const setDraft = useCallback((fieldId: number, v: unknown) => {
    setDraftByFieldId((prev) => ({ ...prev, [fieldId]: v }));
    setRowErr((prev) => ({ ...prev, [fieldId]: null }));
  }, []);

  const rowByFieldId = useMemo(() => {
    const m = new Map<number, OrderCustomFieldWithValueDto>();
    for (const r of rows) m.set(r.field.id, r);
    return m;
  }, [rows]);

  const saveOne = useCallback(
    async (field: OrderCustomFieldDto, opts?: { skipIfUnchanged?: boolean }) => {
      const draft = draftByFieldId[field.id];
      const row = rowByFieldId.get(field.id);
      const localErr = validateDraft(field, draft);
      if (localErr) {
        setRowErr((prev) => ({ ...prev, [field.id]: localErr }));
        return false;
      }
      const payload = buildPayload(field, draft);
      if (opts?.skipIfUnchanged !== false && row) {
        const baseline = buildPayload(field, draftFromRow(row, documentsRef.current));
        if (payloadsEqual(payload, baseline)) return true;
      }
      setSavingId(field.id);
      setRowErr((prev) => ({ ...prev, [field.id]: null }));
      try {
        await putOrderCustomFieldValues(orderId, [payload]);
        await load();
        return true;
      } catch (e) {
        setRowErr((prev) => ({
          ...prev,
          [field.id]: formatApiError(e),
        }));
        return false;
      } finally {
        setSavingId(null);
      }
    },
    [draftByFieldId, load, orderId, rowByFieldId],
  );

  const onUploadFile = useCallback(
    async (field: OrderCustomFieldDto, file: File) => {
      setUploadingId(field.id);
      setRowErr((prev) => ({ ...prev, [field.id]: null }));
      try {
        const meta = await uploadOrderCustomFieldFile(orderId, field.id, file);
        const prevList = (draftByFieldId[field.id] as Record<string, unknown>[]) ?? [];
        const replaceOne = field.type === "SALES_DOCUMENT" || field.type === "SHIPPING_LABEL";
        const nextList = replaceOne ? [meta] : [...prevList, meta];
        setDraft(field.id, nextList);
        await putOrderCustomFieldValues(orderId, [buildPayload(field, nextList)]);
        await load();
        onOrderRefresh?.();
        return true;
      } catch (e) {
        setRowErr((prev) => ({
          ...prev,
          [field.id]: formatApiError(e),
        }));
        return false;
      } finally {
        setUploadingId(null);
      }
    },
    [draftByFieldId, load, orderId, onOrderRefresh, setDraft],
  );

  const removeFileAt = useCallback(
    async (field: OrderCustomFieldDto, index: number) => {
      const prevList = (draftByFieldId[field.id] as Record<string, unknown>[]) ?? [];
      const nextList = prevList.filter((_, i) => i !== index);
      setDraft(field.id, nextList);
      setSavingId(field.id);
      try {
        await putOrderCustomFieldValues(orderId, [buildPayload(field, nextList)]);
        await load();
        onOrderRefresh?.();
      } catch (e) {
        setRowErr((prev) => ({
          ...prev,
          [field.id]: formatApiError(e),
        }));
      } finally {
        setSavingId(null);
      }
    },
    [draftByFieldId, load, orderId, onOrderRefresh, setDraft],
  );

  const revertDraft = useCallback(
    (fieldId: number) => {
      const row = rowByFieldId.get(fieldId);
      if (row) setDraft(fieldId, draftFromRow(row, documentsRef.current));
    },
    [rowByFieldId, setDraft],
  );

  const selectCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (selectCommitTimer.current) clearTimeout(selectCommitTimer.current);
    };
  }, []);

  const scheduleMultiSave = useCallback(
    (field: OrderCustomFieldDto) => {
      if (selectCommitTimer.current) clearTimeout(selectCommitTimer.current);
      selectCommitTimer.current = setTimeout(() => {
        void saveOne(field, { skipIfUnchanged: true });
      }, 380);
    },
    [saveOne],
  );

  const renderDisplayValue = (
    field: OrderCustomFieldDto,
    draft: unknown,
    ft: string,
  ): string => {
    if (ft === "TEXT") return (typeof draft === "string" ? draft : "").trim() || "—";
    if (ft === "NUMBER") {
      const raw = typeof draft === "string" ? draft.trim() : "";
      return raw || "—";
    }
    if (ft === "FILES" || ft === "SALES_DOCUMENT" || ft === "SHIPPING_LABEL") {
      const n = Array.isArray(draft) ? draft.length : 0;
      return n ? `${n} plik${n === 1 ? "" : n < 5 ? "i" : "ów"}` : "Brak plików";
    }
    if (ft === "SELECT_SINGLE") {
      const raw = draft === "" || draft == null ? "" : String(draft);
      if (!raw) return "—";
      const oid = Number(raw);
      const opt = field.options.find((o) => o.id === oid);
      return opt?.label ?? "—";
    }
    if (ft === "SELECT_MULTI") {
      const ids = Array.isArray(draft) ? draft.map(Number) : [];
      if (!ids.length) return "—";
      const labels = ids
        .map((id) => field.options.find((o) => o.id === id)?.label)
        .filter(Boolean) as string[];
      return labels.length ? labels.join(", ") : "—";
    }
    return "—";
  };

  if (loading && rows.length === 0) {
    return (
      <p className="flex items-center gap-2 text-[11px] text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Ładowanie pól…
      </p>
    );
  }

  if (err) {
    return (
      <div
        className="max-w-xl rounded-md border border-red-200/90 bg-red-50/90 px-2.5 py-1.5 text-[11px] leading-snug text-red-900"
        role="alert"
      >
        {err}
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-[11px] leading-snug text-slate-500">Zamówienia: Pola dodatkowe</p>;
  }

  return (
    <div className="rounded-lg border border-slate-200/90 bg-white">
      <div className="divide-y divide-slate-100">
      {rows.map(({ field }) => {
        const draft = draftByFieldId[field.id];
        const ft = field.type;
        const re = rowErr[field.id];
        const busy = savingId === field.id || uploadingId === field.id;
        const editing = editingId === field.id;
        const displayText = renderDisplayValue(field, draft, ft);
        const settings = (field.settings_json ?? {}) as Record<string, unknown>;
        const textSubtype = String((settings.text as { subtype?: string } | undefined)?.subtype ?? "any").toLowerCase();
        const textMultiline = Boolean((settings.text as { multiline?: boolean } | undefined)?.multiline);

        const usesPencil =
          ft === "TEXT" || ft === "NUMBER" || isAttachmentListField(ft) || ft === "SELECT_SINGLE" || ft === "SELECT_MULTI";

        const openEdit = () => {
          if (usesPencil) setEditingId(field.id);
        };

        const onPencilClick = () => {
          if (editingId === field.id) {
            revertDraft(field.id);
            setEditingId(null);
            return;
          }
          setEditingId(field.id);
        };

        const finishEdit = async () => {
          await saveOne(field, { skipIfUnchanged: true });
          setEditingId((cur) => (cur === field.id ? null : cur));
        };

        const onKeyEdit = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          if (e.key === "Escape") {
            e.preventDefault();
            revertDraft(field.id);
            setEditingId(null);
          } else if (e.key === "Enter" && ft === "NUMBER") {
            e.preventDefault();
            void finishEdit();
          }
        };

        return (
          <div key={field.id} className="group px-2 py-1.5">
            <div className="flex items-start gap-2">
              <OrderCustomFieldGlyph
                type={field.type}
                settings={settings}
                boxClassName={GLYPH_BOX_CLASS}
                lucideClassName={GLYPH_LUCIDE_CLASS}
              />

              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[11px] font-semibold leading-tight text-slate-800">{field.name}</p>
                <div className="min-w-0 text-[11px] leading-snug text-slate-600">
                      {ft === "TEXT" && !editing ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={openEdit}
                          className="max-w-full rounded border border-transparent px-0 py-0 text-left text-[11px] text-slate-800 hover:border-slate-200 hover:bg-slate-50/80"
                        >
                          <span
                            className={`${displayText === "—" ? "text-slate-400" : ""} ${textMultiline ? "line-clamp-6 whitespace-pre-wrap" : "truncate"}`}
                          >
                            {displayText}
                          </span>
                        </button>
                      ) : null}

                      {ft === "NUMBER" && !editing ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={openEdit}
                          className="max-w-full rounded border border-transparent px-0 py-0 text-left text-[11px] tabular-nums text-slate-800 hover:border-slate-200 hover:bg-slate-50/80"
                        >
                          <span className={displayText === "—" ? "text-slate-400" : ""}>{displayText}</span>
                        </button>
                      ) : null}

                      {isAttachmentListField(ft) && !editing ? (
                        <p className="text-[11px]">
                          <span className={displayText.startsWith("Brak") ? "text-slate-400" : "text-slate-700"}>{displayText}</span>
                          {displayText.startsWith("Brak") ? (
                            <>
                              <span className="text-slate-300"> · </span>
                              <span className="italic text-slate-400">Dodaj w trybie edycji</span>
                            </>
                          ) : null}
                        </p>
                      ) : null}

                      {ft === "SELECT_SINGLE" && !editing ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={openEdit}
                          className="max-w-full rounded border border-transparent px-0 py-0 text-left text-[11px] text-slate-800 hover:border-slate-200 hover:bg-slate-50/80"
                        >
                          <span className={displayText === "—" ? "text-slate-400" : ""}>{displayText}</span>
                        </button>
                      ) : null}

                      {ft === "SELECT_MULTI" && !editing ? (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {Array.isArray(draft) && draft.length > 0 ? (
                            draft.map(Number).map((oid) => {
                              const op = field.options.find((o) => o.id === oid);
                              return op ? (
                                <span
                                  key={oid}
                                  className="inline-flex items-center rounded border border-slate-200/90 bg-slate-50 px-1 py-0 text-[10px] font-medium text-slate-700"
                                >
                                  {op.label}
                                </span>
                              ) : null;
                            })
                          ) : (
                            <>
                              <span className="text-slate-400">—</span>
                              <span className="text-slate-300"> · </span>
                              <span className="italic text-slate-400">Dodaj w trybie edycji</span>
                            </>
                          )}
                        </div>
                      ) : null}

                </div>

                {ft === "TEXT" && editing ? (
                  <div className="border-t border-slate-100 pt-2">
                    {textSubtype === "email" || textSubtype === "url" ? (
                      <input
                        autoFocus
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-blue-500/20"
                        type={textSubtype === "email" ? "email" : "url"}
                        value={typeof draft === "string" ? draft : ""}
                        onChange={(e) => setDraft(field.id, e.target.value)}
                        onBlur={() => void finishEdit()}
                        onKeyDown={onKeyEdit}
                      />
                    ) : textMultiline ? (
                      <textarea
                        autoFocus
                        rows={3}
                        className="w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-blue-500/20"
                        value={typeof draft === "string" ? draft : ""}
                        onChange={(e) => setDraft(field.id, e.target.value)}
                        onBlur={() => void finishEdit()}
                        onKeyDown={onKeyEdit}
                      />
                    ) : (
                      <input
                        autoFocus
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-blue-500/20"
                        value={typeof draft === "string" ? draft : ""}
                        onChange={(e) => setDraft(field.id, e.target.value)}
                        onBlur={() => void finishEdit()}
                        onKeyDown={onKeyEdit}
                      />
                    )}
                  </div>
                ) : null}

                {ft === "NUMBER" && editing ? (
                  <div className="border-t border-slate-100 pt-2">
                    <input
                      autoFocus
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs tabular-nums text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-blue-500/20"
                      inputMode="decimal"
                      value={typeof draft === "string" ? draft : ""}
                      onChange={(e) => setDraft(field.id, e.target.value)}
                      onBlur={() => void finishEdit()}
                      onKeyDown={onKeyEdit}
                    />
                  </div>
                ) : null}

                {isAttachmentListField(ft) && editing ? (
                  <div className="border-t border-slate-100 pt-2">
                    <div
                      className={`space-y-2 rounded-lg border border-dashed px-2 py-2 transition ${
                        filesDragFieldId === field.id ? "border-blue-400 bg-blue-50/50" : "border-slate-200/90 bg-slate-50/50"
                      }`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setFilesDragFieldId(field.id);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFilesDragFieldId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setFilesDragFieldId(null);
                        const f = e.dataTransfer.files?.[0];
                        if (f) void onUploadFile(field, f);
                      }}
                    >
                    {ft === "SALES_DOCUMENT" || ft === "SHIPPING_LABEL" ? (
                      <p className="text-[10px] leading-snug text-slate-500">
                        Jedna pozycja — wgranie nowego pliku zastąpi obecny. Przeciągnij plik tutaj lub wybierz z dysku.
                      </p>
                    ) : (
                      <p className="text-[10px] leading-snug text-slate-500">Przeciągnij plik tutaj lub wybierz z dysku.</p>
                    )}
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                      <Upload className="h-3 w-3" strokeWidth={2} aria-hidden />
                      <span>{ft === "FILES" ? "Wgraj plik" : "Wgraj / zamień plik"}</span>
                      <input
                        type="file"
                        className="hidden"
                        disabled={busy}
                        onChange={(ev) => {
                          const f = ev.target.files?.[0];
                          ev.target.value = "";
                          if (f) void onUploadFile(field, f);
                        }}
                      />
                    </label>
                    <ul className="space-y-1">
                      {(Array.isArray(draft) ? draft : []).map((item, idx) => {
                        const meta = item as {
                          original_filename?: string;
                          file_url?: string;
                          name?: string;
                          order_document_id?: number;
                        };
                        const name = meta.original_filename || meta.name || "plik";
                        const url = meta.file_url ? resolvePublicFileUrl(String(meta.file_url)) : "";
                        return (
                          <li
                            key={`${field.id}-f-${idx}`}
                            className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-white/90 px-2 py-1"
                          >
                            <span className="flex min-w-0 flex-1 items-center gap-1.5">
                              <FileIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
                              <span className="min-w-0 truncate text-[11px] font-medium text-slate-800">{name}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              {url ? (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded p-1 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                                  aria-label="Pobierz"
                                >
                                  <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                                </a>
                              ) : null}
                              <button
                                type="button"
                                className="rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-red-600"
                                disabled={busy}
                                title="Usuń z pola"
                                aria-label="Usuń plik"
                                onClick={() => void removeFileAt(field, idx)}
                              >
                                <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                              </button>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    </div>
                  </div>
                ) : null}

                {ft === "SELECT_SINGLE" && editing ? (
                  <div className="relative border-t border-slate-100 pt-2">
                    <select
                      disabled={busy}
                      className="w-full appearance-none rounded-md border border-slate-200 bg-white py-1.5 pl-2 pr-7 text-xs text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-blue-500/20"
                      value={typeof draft === "string" ? draft : ""}
                      onChange={async (e) => {
                        setDraft(field.id, e.target.value);
                        const ok = await saveOne(field, { skipIfUnchanged: false });
                        if (ok) setEditingId(null);
                      }}
                    >
                      <option value="">Wybierz…</option>
                      {[...field.options]
                        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
                        .map((o) => (
                          <option key={o.id} value={String(o.id)}>
                            {o.label}
                          </option>
                        ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden
                    />
                  </div>
                ) : null}

                {ft === "SELECT_MULTI" && editing ? (
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 px-2 py-2">
                    {[...field.options]
                      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
                      .map((o) => {
                        const selected = new Set(Array.isArray(draft) ? draft.map(Number) : []);
                        const on = selected.has(o.id);
                        return (
                          <label key={o.id} className="flex cursor-pointer items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              disabled={busy}
                              checked={on}
                              onChange={() => {
                                const cur = new Set(Array.isArray(draft) ? draft.map(Number) : []);
                                if (cur.has(o.id)) cur.delete(o.id);
                                else cur.add(o.id);
                                const next = [...cur];
                                setDraft(field.id, next);
                                scheduleMultiSave(field);
                              }}
                              className="rounded border-slate-300 text-slate-900"
                            />
                            <span className="text-slate-800">{o.label}</span>
                            {on ? <Check className="ml-auto h-3.5 w-3.5 text-emerald-600" aria-hidden /> : null}
                          </label>
                        );
                      })}
                  </div>
                ) : null}

                {re ? <p className="mt-1 text-[11px] leading-snug text-red-600">{re}</p> : null}
              </div>
              <div className={ROW_ACTIONS_CLASS}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden /> : null}
                {isAttachmentListField(ft) &&
                !editing &&
                Array.isArray(draft) &&
                draft.length > 0 &&
                (draft[0] as { file_url?: string }).file_url ? (
                  <a
                    href={resolvePublicFileUrl(String((draft[0] as { file_url?: string }).file_url))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    title="Pobierz plik"
                    aria-label="Pobierz plik"
                  >
                    <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </a>
                ) : null}
                {usesPencil ? (
                  <button
                    type="button"
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    title={editing ? "Zamknij" : "Edytuj"}
                    aria-label={editing ? "Zamknij edycję" : `Edytuj ${field.name}`}
                    disabled={busy}
                    onClick={onPencilClick}
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
