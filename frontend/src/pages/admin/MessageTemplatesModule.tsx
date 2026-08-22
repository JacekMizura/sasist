import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Routes, Route, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import type { Editor } from "@tiptap/react";
import DOMPurify from "isomorphic-dompurify";

import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { ModuleListBreadcrumb } from "../../components/listPage/moduleList";
import { PrimaryButton } from "../../design-system";
import { useAuth } from "../../context/AuthContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import {
  archiveMessageTemplate,
  createMessageTemplate,
  formatSupportedContextsLabel,
  getMessageTemplate,
  listMessageTemplateVariables,
  listMessageTemplates,
  modulesFromSupportedContexts,
  previewMessageTemplate,
  supportedContextsFromModules,
  updateMessageTemplate,
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
      const data = await listMessageTemplates({ tenantId: DAMAGE_TENANT_ID, activeOnly: false });
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
        subtitle="Współdzielone szablony e-mail dla Poczty i automatyzacji."
        actions={
          <PrimaryButton type="button" density="compact" onClick={() => navigate(`${BASE}/new`)}>
            + Dodaj szablon
          </PrimaryButton>
        }
      />
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Nazwa</th>
              <th className="px-4 py-3 font-semibold">Temat</th>
              <th className="px-4 py-3 font-semibold">Dostępne moduły</th>
              <th className="px-4 py-3 font-semibold">Aktywny</th>
              <th className="px-4 py-3 font-semibold">Ostatnia zmiana</th>
              <th className="px-4 py-3 text-right font-semibold">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  Ładowanie…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  Brak szablonów. Kliknij „Dodaj szablon”.
                </td>
              </tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                  <td className="max-w-[240px] truncate px-4 py-3 text-slate-600">{t.subject_template || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {t.supported_contexts_label || formatSupportedContextsLabel(t.supported_contexts)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        t.is_active
                          ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800"
                          : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                      }
                    >
                      {t.is_active ? "Tak" : "Nie"}
                    </span>
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
                    ) : null}
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
  const [loading, setLoading] = useState(mode === "edit");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p></p>");
  const [active, setActive] = useState(true);
  const [mods, setMods] = useState({ order: true, returns: true, complaints: true });
  const [groups, setGroups] = useState<MessageTemplateVariableGroupDto[]>([]);
  const [varsLoading, setVarsLoading] = useState(true);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [previewMissing, setPreviewMissing] = useState<string[]>([]);
  const [previewUnknown, setPreviewUnknown] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const focusTarget = useRef<"subject" | "body">("body");
  const editorRef = useRef<Editor | null>(null);

  useEffect(() => {
    void listMessageTemplateVariables()
      .then(setGroups)
      .catch(() => toast.error("Nie udało się wczytać zmiennych"))
      .finally(() => setVarsLoading(false));
  }, []);

  useEffect(() => {
    if (mode !== "edit") return;
    const tid = Number(id);
    if (!Number.isFinite(tid)) return;
    void getMessageTemplate(tid, DAMAGE_TENANT_ID)
      .then((row) => {
        setName(row.name);
        setSubject(row.subject_template || "");
        setBodyHtml(row.body_template || "<p></p>");
        setActive(row.is_active);
        setMods(modulesFromSupportedContexts(row.supported_contexts));
      })
      .catch(() => toast.error("Nie znaleziono szablonu"))
      .finally(() => setLoading(false));
  }, [mode, id]);

  const insertToken = (token: string) => {
    if (focusTarget.current === "subject") {
      insertTokenIntoInput(subjectRef.current, token, subject, setSubject);
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
        subject_template: subject,
        body_template: bodyHtml,
      });
      setPreviewSubject(res.subject);
      setPreviewHtml(DOMPurify.sanitize(res.body_html || ""));
      setPreviewMissing(res.missing_variables || []);
      setPreviewUnknown(res.unknown_variables || []);
    } catch {
      toast.error("Podgląd nie powiódł się");
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Podaj nazwę szablonu");
      return;
    }
    const supported_contexts = supportedContextsFromModules(mods);
    if (supported_contexts.length === 0) {
      toast.error("Zaznacz co najmniej jeden dostępny moduł");
      return;
    }
    setBusy(true);
    try {
      if (mode === "new") {
        const row = await createMessageTemplate({
          tenant_id: DAMAGE_TENANT_ID,
          name: name.trim(),
          subject_template: subject,
          body_template: bodyHtml,
          supported_contexts,
          is_active: active,
        });
        toast.success("Utworzono szablon");
        navigate(`${BASE}/${row.id}/edit`, { replace: true });
      } else {
        const tid = Number(id);
        await updateMessageTemplate(tid, DAMAGE_TENANT_ID, {
          name: name.trim(),
          subject_template: subject,
          body_template: bodyHtml,
          supported_contexts,
          is_active: active,
        });
        toast.success("Zapisano");
      }
    } catch {
      toast.error("Nie udało się zapisać");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <p className="text-sm text-slate-500">Ładowanie…</p>
      </PageLayout>
    );
  }

  const title = mode === "new" ? "Nowy szablon" : name || "Edycja szablonu";
  const gapTokens = [
    ...previewMissing.map((k) => `{${k}}`),
    ...previewUnknown.map((k) => `{${k}}`),
  ];

  return (
    <PageLayout flush>
      <ModuleListBreadcrumb
        items={[
          { label: "Szablony" },
          { label: "Szablony wiadomości", to: BASE },
          { label: mode === "new" ? "Nowy szablon" : "Edycja" },
        ]}
      />
      <PageHeader
        title={title}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => void handlePreview()}
            >
              Podgląd
            </button>
            <PrimaryButton type="button" density="compact" disabled={busy} onClick={() => void handleSave()}>
              Zapisz
            </PrimaryButton>
          </div>
        }
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,400px)]">
        <section className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Ustawienia</h2>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">Nazwa</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>

          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Dostępne moduły</legend>
            <p className="mt-1 text-xs text-slate-500">
              Określa, dla jakich encji szablon pojawia się w Poczcie i Automatyzacjach. Poczta i Automatyzacje
              zawsze korzystają z tej samej listy MessageTemplate (SSOT).
            </p>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-700">
              {(
                [
                  ["order", "Zamówienia"],
                  ["returns", "Zwroty"],
                  ["complaints", "Reklamacje"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={mods[key]}
                    onChange={(e) => setMods((m) => ({ ...m, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">Temat wiadomości</span>
            <input
              ref={subjectRef}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
              value={subject}
              onFocus={() => {
                focusTarget.current = "subject";
              }}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="np. Zamówienie {order_id} zostało wysłane"
            />
          </label>

          <div>
            <div className="mb-1 text-sm font-medium text-slate-700">Treść wiadomości</div>
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
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Aktywny
          </label>

          <Link to={BASE} className="inline-block text-sm font-medium text-slate-600 hover:text-slate-900">
            ← Wróć do listy
          </Link>
        </section>

        <MessageVariablesPanel groups={groups} loading={varsLoading} onInsert={insertToken} />
      </div>

      {previewHtml != null ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Podgląd</h3>
            <button
              type="button"
              className="text-xs text-slate-500 underline"
              onClick={() => {
                setPreviewHtml(null);
                setPreviewMissing([]);
                setPreviewUnknown([]);
              }}
            >
              Zamknij
            </button>
          </div>
          {gapTokens.length > 0 ? (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <p className="font-medium">Nie udało się uzupełnić części zmiennych</p>
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs">
                {gapTokens.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mb-3 text-sm text-slate-600">
            <span className="font-medium text-slate-800">Temat:</span> {previewSubject || "—"}
          </p>
          <div
            className="prose prose-sm max-w-none rounded-lg border border-slate-100 bg-slate-50 p-4"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
          <p className="mt-2 text-xs text-slate-400">
            Bez wybranego zamówienia placeholdery mogą pozostać puste lub nierozwiązane — podgląd nie zapisuje zmian.
          </p>
        </div>
      ) : null}
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
