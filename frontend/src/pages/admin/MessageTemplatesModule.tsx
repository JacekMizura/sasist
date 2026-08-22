import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Routes, Route, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import type { Editor } from "@tiptap/react";
import DOMPurify from "isomorphic-dompurify";
import { Plus, X } from "lucide-react";

import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { ModuleListBreadcrumb } from "../../components/listPage/moduleList";
import { Dialog, PrimaryButton, SecondaryButton, typography } from "../../design-system";
import { useAuth } from "../../context/AuthContext";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import {
  archiveMessageTemplate,
  createMessageTemplate,
  formatChannelLabel,
  getMessageTemplate,
  listMessageTemplateAttachmentSources,
  listMessageTemplateVariables,
  listMessageTemplates,
  previewMessageTemplate,
  updateMessageTemplate,
  type MessageTemplateAttachmentRef,
  type MessageTemplateAttachmentSourceDto,
  type MessageTemplateChannel,
  type MessageTemplateDto,
  type MessageTemplateVariableGroupDto,
} from "../../api/messageTemplatesApi";
import { TEMPLATES_MESSAGES_BASE } from "../Templates/templatesPaths";
import {
  MessageHtmlEditor,
  insertTokenIntoEditor,
  insertTokenIntoInput,
} from "../../components/messaging/MessageHtmlEditor";
import { MessageVariablesPanel } from "../../components/messaging/MessageVariablesPanel";

const BASE = TEMPLATES_MESSAGES_BASE;

const fieldInputClass =
  "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-200";

function attachmentSourceKindLabel(fieldType?: string | null): string {
  const t = String(fieldType || "").toUpperCase();
  if (t === "FILES") return "Pliki";
  if (t === "SALES_DOCUMENT") return "Dokument sprzedaży";
  if (t === "SHIPPING_LABEL") return "Etykieta wysyłkowa";
  return "Pole dodatkowe";
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function MessageTemplatesListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<MessageTemplateDto[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMessageTemplates({
        tenantId: DAMAGE_TENANT_ID,
        activeOnly: false,
        channel: "all",
      });
      setRows(data);
    } catch {
      toast.error("Nie udało się wczytać szablonów");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <PageLayout>
      <ModuleListBreadcrumb items={[{ label: "Szablony" }, { label: "Szablony wiadomości" }]} />
      <PageHeader
        title="Szablony wiadomości"
        actions={
          <PrimaryButton type="button" density="compact" onClick={() => navigate(`${BASE}/new`)}>
            + Dodaj szablon
          </PrimaryButton>
        }
      />
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Nazwa</th>
              <th className="px-4 py-3 font-semibold">Typ</th>
              <th className="px-4 py-3 font-semibold">Temat</th>
              <th className="px-4 py-3 font-semibold">Ostatnia zmiana</th>
              <th className="px-4 py-3 text-right font-semibold">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  Ładowanie…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  Brak szablonów. Kliknij „Dodaj szablon”.
                </td>
              </tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                  <td className="px-4 py-3 text-slate-600">{t.channel_label || formatChannelLabel(t.channel)}</td>
                  <td className="max-w-[260px] truncate px-4 py-3 text-slate-600">
                    {String(t.channel).toLowerCase() === "email" ? t.subject_template || "—" : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(t.updated_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`${BASE}/${t.id}/edit`} className="mr-3 text-xs font-medium text-slate-700 underline">
                      Edytuj
                    </Link>
                    {t.is_active ? (
                      <button
                        type="button"
                        className="text-xs text-amber-800 hover:underline"
                        onClick={() =>
                          void archiveMessageTemplate(t.id, DAMAGE_TENANT_ID)
                            .then(() => reload())
                            .catch(() => toast.error("Nie udało się zarchiwizować"))
                        }
                      >
                        Archiwizuj
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">Zarchiwizowany</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageLayout>
  );
}

function TemplateEditorPage({ mode }: { mode: "new" | "edit" }) {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { warehouseId } = useActiveWarehouseContext();
  const [loading, setLoading] = useState(mode === "edit");
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<MessageTemplateChannel>("email");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p></p>");
  const [bodyText, setBodyText] = useState("");
  const [attachments, setAttachments] = useState<MessageTemplateAttachmentRef[]>([]);
  const [attachSources, setAttachSources] = useState<MessageTemplateAttachmentSourceDto[]>([]);
  const [attachPickerOpen, setAttachPickerOpen] = useState(false);
  const [groups, setGroups] = useState<MessageTemplateVariableGroupDto[]>([]);
  const [varsLoading, setVarsLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewMissing, setPreviewMissing] = useState<string[]>([]);
  const [previewUnknown, setPreviewUnknown] = useState<string[]>([]);
  const [previewStructural, setPreviewStructural] = useState(true);
  const [busy, setBusy] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyTextRef = useRef<HTMLTextAreaElement>(null);
  const focusTarget = useRef<"subject" | "body">("body");
  const editorRef = useRef<Editor | null>(null);

  const isEmail = channel === "email";
  const isPlain = channel === "sms" || channel === "note";

  useEffect(() => {
    void listMessageTemplateVariables()
      .then(setGroups)
      .catch(() => toast.error("Nie udało się wczytać zmiennych"))
      .finally(() => setVarsLoading(false));
  }, []);

  useEffect(() => {
    if (!isEmail || warehouseId == null) {
      setAttachSources([]);
      return;
    }
    void listMessageTemplateAttachmentSources({
      tenantId: DAMAGE_TENANT_ID,
      warehouseId: Number(warehouseId),
    })
      .then(setAttachSources)
      .catch(() => setAttachSources([]));
  }, [isEmail, warehouseId]);

  useEffect(() => {
    if (mode !== "edit") return;
    const tid = Number(id);
    if (!Number.isFinite(tid)) return;
    void getMessageTemplate(tid, DAMAGE_TENANT_ID)
      .then((row) => {
        const ch = (String(row.channel || "email").toLowerCase() || "email") as MessageTemplateChannel;
        setName(row.name);
        setChannel(ch === "sms" || ch === "note" ? ch : "email");
        setSubject(row.subject_template || "");
        setAttachments(Array.isArray(row.attachments) ? row.attachments : []);
        if (ch === "sms" || ch === "note") {
          setBodyText(row.body_template || "");
          setBodyHtml("<p></p>");
        } else {
          setBodyHtml(row.body_template || "<p></p>");
          setBodyText("");
        }
      })
      .catch(() => toast.error("Nie znaleziono szablonu"))
      .finally(() => setLoading(false));
  }, [mode, id]);

  const insertToken = (token: string) => {
    if (isEmail && focusTarget.current === "subject") {
      insertTokenIntoInput(subjectRef.current, token, subject, setSubject);
      return;
    }
    if (isPlain) {
      insertTokenIntoInput(bodyTextRef.current, token, bodyText, setBodyText);
      return;
    }
    if (!insertTokenIntoEditor(editorRef.current, token)) {
      setBodyHtml((prev) => `${prev}${token}`);
    }
  };

  const handlePreview = async () => {
    try {
      const res = await previewMessageTemplate({
        tenant_id: DAMAGE_TENANT_ID,
        subject_template: isEmail ? subject : "",
        body_template: isPlain ? bodyText : bodyHtml,
      });
      setPreviewSubject(res.subject);
      setPreviewHtml(
        isPlain
          ? `<pre class="whitespace-pre-wrap font-sans text-sm">${DOMPurify.sanitize(res.body_html || "")}</pre>`
          : DOMPurify.sanitize(res.body_html || ""),
      );
      setPreviewMissing(res.missing_variables || []);
      setPreviewUnknown(res.unknown_variables || []);
      setPreviewStructural(res.structural_preview);
      setPreviewOpen(true);
    } catch {
      toast.error("Podgląd nie powiódł się");
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Podaj nazwę szablonu");
      return;
    }
    setBusy(true);
    const payload = {
      name: name.trim(),
      channel,
      subject_template: isEmail ? subject : "",
      body_template: isPlain ? bodyText : bodyHtml,
      attachments: isEmail ? attachments : [],
      is_active: true,
    };
    try {
      if (mode === "new") {
        const row = await createMessageTemplate({
          tenant_id: DAMAGE_TENANT_ID,
          ...payload,
        });
        toast.success("Utworzono szablon");
        navigate(`${BASE}/${row.id}/edit`, { replace: true });
      } else {
        const tid = Number(id);
        await updateMessageTemplate(tid, DAMAGE_TENANT_ID, payload);
        toast.success("Zapisano");
      }
    } catch {
      toast.error("Nie udało się zapisać");
    } finally {
      setBusy(false);
    }
  };

  const addAttachment = (src: MessageTemplateAttachmentSourceDto) => {
    if (attachments.some((a) => a.field_id === src.field_id)) {
      setAttachPickerOpen(false);
      return;
    }
    setAttachments((prev) => [
      ...prev,
      {
        source: "order_custom_field",
        field_id: src.field_id,
        field_slug: src.field_slug,
        field_name: src.field_name,
        field_type: src.field_type,
      },
    ]);
    setAttachPickerOpen(false);
  };

  if (loading) {
    return (
      <PageLayout>
        <p className="text-sm text-slate-500">Ładowanie…</p>
      </PageLayout>
    );
  }

  const crumbLabel = mode === "new" ? "Nowy szablon" : name || "Edycja";

  return (
    <PageLayout>
      <PageHeader
        className="mb-6"
        breadcrumbs={[
          { label: "Szablony" },
          { label: "Szablony wiadomości", to: BASE },
          { label: crumbLabel },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <SecondaryButton type="button" density="compact" onClick={() => void handlePreview()}>
              Podgląd
            </SecondaryButton>
            <PrimaryButton type="button" density="compact" disabled={busy} onClick={() => void handleSave()}>
              Zapisz
            </PrimaryButton>
          </div>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6">
        <div className="min-w-0 space-y-8">
          <section className="space-y-4">
            <h2 className={typography.section}>Dane szablonu</h2>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-end">
              <label className="block min-w-0">
                <span className={typography.label}>Nazwa</span>
                <input
                  className={fieldInputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <label className="block w-full sm:w-[240px]">
                <span className={typography.label}>Typ wiadomości</span>
                <select
                  className={fieldInputClass}
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as MessageTemplateChannel)}
                >
                  <option value="email">E-mail</option>
                  <option value="sms">SMS</option>
                  <option value="note">Notatka</option>
                </select>
              </label>
            </div>

            {isEmail ? (
              <label className="block">
                <span className={typography.label}>Temat wiadomości</span>
                <input
                  ref={subjectRef}
                  className={`${fieldInputClass} font-mono`}
                  value={subject}
                  onFocus={() => {
                    focusTarget.current = "subject";
                  }}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="np. Zamówienie {order_id} zostało wysłane"
                />
              </label>
            ) : null}
          </section>

          <section className="space-y-3 border-t border-slate-100 pt-7">
            <h2 className={typography.section}>Treść</h2>
            <div>
              <div className={`mb-1.5 ${typography.label}`}>Treść wiadomości</div>
              {isPlain ? (
                <textarea
                  ref={bodyTextRef}
                  className={`${fieldInputClass} min-h-[280px] font-mono leading-relaxed`}
                  value={bodyText}
                  onFocus={() => {
                    focusTarget.current = "body";
                  }}
                  onChange={(e) => setBodyText(e.target.value)}
                  placeholder="Treść (zwykły tekst)…"
                />
              ) : (
                <div
                  onFocusCapture={() => {
                    focusTarget.current = "body";
                  }}
                >
                  <MessageHtmlEditor
                    value={bodyHtml}
                    onChange={setBodyHtml}
                    onEditorReady={(ed) => {
                      editorRef.current = ed;
                    }}
                    placeholder="Wpisz treść e-mail. Kliknij zmienną po prawej, aby wstawić placeholder."
                  />
                </div>
              )}
            </div>
          </section>

          {isEmail ? (
            <section className="space-y-3 border-t border-slate-100 pt-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className={typography.section}>Załączniki</h2>
                  <p className={`mt-1.5 ${typography.caption}`}>
                    Źródła plików dodawanych automatycznie do wiadomości.
                  </p>
                </div>
                <SecondaryButton
                  type="button"
                  density="compact"
                  onClick={() => setAttachPickerOpen(true)}
                  disabled={warehouseId == null}
                >
                  <span className="inline-flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> Dodaj załącznik
                  </span>
                </SecondaryButton>
              </div>

              {attachments.length === 0 ? (
                <p className={typography.bodyMuted}>Brak załączników.</p>
              ) : (
                <ul className="divide-y divide-slate-100 border-y border-slate-100">
                  {attachments.map((a) => (
                    <li key={a.field_id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {a.field_name || a.field_slug || `Pole #${a.field_id}`}
                        </div>
                        <div className={typography.caption}>
                          Pole dodatkowe · {attachmentSourceKindLabel(a.field_type)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                        aria-label="Usuń"
                        onClick={() => setAttachments((prev) => prev.filter((x) => x.field_id !== a.field_id))}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {warehouseId == null ? (
                <p className="text-xs text-amber-700">Wybierz magazyn, aby dodać załączniki z pól zamówienia.</p>
              ) : null}
            </section>
          ) : null}
        </div>

        <MessageVariablesPanel groups={groups} loading={varsLoading} onInsert={insertToken} />
      </div>

      <Dialog
        open={attachPickerOpen}
        onClose={() => setAttachPickerOpen(false)}
        title="Dodaj załącznik"
        size="md"
        footer={
          <SecondaryButton type="button" density="compact" onClick={() => setAttachPickerOpen(false)}>
            Zamknij
          </SecondaryButton>
        }
      >
        {attachSources.length === 0 ? (
          <p className={typography.bodyMuted}>
            Brak aktywnych pól dodatkowych typu plik / dokument sprzedaży / etykieta w tym magazynie.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {attachSources.map((s) => (
              <li key={s.field_id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-1 py-2.5 text-left hover:bg-slate-50"
                  onClick={() => addAttachment(s)}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900">{s.label}</span>
                    <span className={typography.caption}>
                      Pole dodatkowe · {attachmentSourceKindLabel(s.field_type)}
                    </span>
                  </span>
                  <Plus className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      <Dialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Podgląd szablonu"
        size="lg"
        footer={
          <SecondaryButton type="button" density="compact" onClick={() => setPreviewOpen(false)}>
            Zamknij
          </SecondaryButton>
        }
      >
        {previewUnknown.length > 0 ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p className="font-medium">Nieznane zmienne (spoza katalogu)</p>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs">
              {previewUnknown.map((k) => (
                <li key={k}>{`{${k}}`}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {!previewStructural && previewMissing.length > 0 ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p className="font-medium">Nie udało się uzupełnić części zmiennych</p>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs">
              {previewMissing.map((k) => (
                <li key={k}>{`{${k}}`}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {previewStructural ? (
          <p className={`mb-3 ${typography.caption}`}>
            Podgląd strukturalny — placeholdery pozostają widoczne, bo nie wybrano zamówienia.
          </p>
        ) : null}
        {isEmail ? (
          <p className={`mb-3 ${typography.body}`}>
            <span className="font-semibold text-slate-900">Temat:</span> {previewSubject || "—"}
          </p>
        ) : null}
        <div
          className="prose prose-sm max-w-none rounded-lg border border-slate-100 bg-white p-4"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </Dialog>
    </PageLayout>
  );
}

export default function MessageTemplatesModule() {
  useAuth();
  return (
    <Routes>
      <Route index element={<MessageTemplatesListPage />} />
      <Route path="new" element={<TemplateEditorPage mode="new" />} />
      <Route path=":id/edit" element={<TemplateEditorPage mode="edit" />} />
    </Routes>
  );
}
