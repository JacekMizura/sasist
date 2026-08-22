import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Link, Routes, Route, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { ModuleListBreadcrumb } from "../../components/listPage/moduleList";
import { PrimaryButton } from "../../design-system";
import { useAuth } from "../../context/AuthContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import {
  archiveMessageTemplate,
  createMessageTemplate,
  getMessageTemplate,
  listMessageTemplates,
  updateMessageTemplate,
  type MessageTemplateDto,
} from "../../api/messageTemplatesApi";
import { TEMPLATES_MESSAGES_BASE } from "../Templates/templatesPaths";

const BASE = TEMPLATES_MESSAGES_BASE;

function MessageTemplatesShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PageLayout>
      <ModuleListBreadcrumb items={[{ label: "Szablony" }, { label: "Szablony wiadomości" }]} />
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      <div className="mt-6 max-w-4xl space-y-4">{children}</div>
    </PageLayout>
  );
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
    <MessageTemplatesShell
      title="Szablony wiadomości"
      subtitle="Współdzielone szablony e-mail używane w Poczcie i automatyzacjach."
      actions={
        <PrimaryButton type="button" density="compact" onClick={() => navigate(`${BASE}/new`)}>
          Dodaj szablon
        </PrimaryButton>
      }
    >
      {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}
      {!loading && rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200/90 bg-white px-6 py-14 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-800">Brak szablonów wiadomości.</p>
          <p className="mt-1 text-sm text-slate-500">Utwórz pierwszy szablon, aby użyć go w Poczcie lub automatyzacjach.</p>
        </div>
      ) : null}
      <ul className="space-y-2">
        {rows.map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{t.name}</p>
              <p className="text-xs text-slate-500">
                {t.entity_scope} · {t.is_active ? "aktywny" : "nieaktywny"} · {t.code}
              </p>
            </div>
            <Link to={`${BASE}/${t.id}/edit`} className="text-xs font-medium text-slate-700 underline">
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
          </li>
        ))}
      </ul>
    </MessageTemplatesShell>
  );
}

function TemplateForm({
  initial,
  onSave,
}: {
  initial?: Partial<MessageTemplateDto>;
  onSave: (v: {
    name: string;
    subject_template: string;
    body_template: string;
    entity_scope: string;
    is_active: boolean;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject_template ?? "");
  const [body, setBody] = useState(initial?.body_template ?? "");
  const [scope, setScope] = useState(initial?.entity_scope ?? "ALL");
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void onSave({
          name,
          subject_template: subject,
          body_template: body,
          entity_scope: scope,
          is_active: active,
        }).finally(() => setBusy(false));
      }}
    >
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Nazwa</span>
        <input
          className="mt-1 w-full rounded border border-slate-200 px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Zakres</span>
        <select
          className="mt-1 w-full rounded border border-slate-200 px-3 py-2"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="ALL">ALL</option>
          <option value="ORDER">ORDER</option>
          <option value="RETURN">RETURN</option>
          <option value="COMPLAINT">COMPLAINT</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Temat</span>
        <input
          className="mt-1 w-full rounded border border-slate-200 px-3 py-2"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="np. Status zamówienia {{order_number}}"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Treść</span>
        <textarea
          className="mt-1 w-full rounded border border-slate-200 px-3 py-2"
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Placeholdery: {{order_number}}, {{status_name}}, {{customer_email}}…"
        />
      </label>
      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Aktywny
      </label>
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        Zapisz
      </button>
    </form>
  );
}

function MessageTemplatesNewPage() {
  const navigate = useNavigate();
  return (
    <MessageTemplatesShell title="Nowy szablon wiadomości" subtitle="Szablon e-mail współdzielony w systemie.">
      <Link to={BASE} className="text-sm font-medium text-slate-600 hover:text-slate-900">
        ← Wróć do listy
      </Link>
      <TemplateForm
        onSave={async (v) => {
          try {
            const row = await createMessageTemplate({ tenant_id: DAMAGE_TENANT_ID, ...v });
            toast.success("Utworzono szablon");
            navigate(`${BASE}/${row.id}/edit`, { replace: true });
          } catch {
            toast.error("Nie udało się utworzyć szablonu");
          }
        }}
      />
    </MessageTemplatesShell>
  );
}

function MessageTemplatesEditPage() {
  const { id } = useParams<{ id: string }>();
  const [row, setRow] = useState<MessageTemplateDto | null>(null);

  useEffect(() => {
    const tid = Number(id);
    if (!Number.isFinite(tid)) return;
    void getMessageTemplate(tid, DAMAGE_TENANT_ID)
      .then(setRow)
      .catch(() => toast.error("Nie znaleziono szablonu"));
  }, [id]);

  return (
    <MessageTemplatesShell
      title="Edycja szablonu wiadomości"
      subtitle="Zmiany nie wpływają na już zlecone wiadomości w outboxie."
    >
      <Link to={BASE} className="text-sm font-medium text-slate-600 hover:text-slate-900">
        ← Wróć do listy
      </Link>
      {row ? (
        <TemplateForm
          initial={row}
          onSave={async (v) => {
            try {
              const updated = await updateMessageTemplate(row.id, DAMAGE_TENANT_ID, v);
              setRow(updated);
              toast.success("Zapisano");
            } catch {
              toast.error("Nie udało się zapisać");
            }
          }}
        />
      ) : (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      )}
    </MessageTemplatesShell>
  );
}

/** Canonical route: `/templates/messages`. */
export default function MessageTemplatesModule() {
  useAuth();
  return (
    <Routes>
      <Route index element={<MessageTemplatesListPage />} />
      <Route path="new" element={<MessageTemplatesNewPage />} />
      <Route path=":id/edit" element={<MessageTemplatesEditPage />} />
    </Routes>
  );
}
