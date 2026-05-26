import type { ReactNode } from "react";
import { Link, Routes, Route } from "react-router-dom";

import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";

const BASE = "/admin/message-templates";

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
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      <div className="mt-6 max-w-4xl space-y-4">{children}</div>
    </PageLayout>
  );
}

function MessageTemplatesListPage() {
  return (
    <MessageTemplatesShell
      title="Szablony wiadomości"
      subtitle="Lista i zarządzanie szablonami wiadomości (w przygotowaniu — API pod /api/admin/message-templates)."
      actions={
        <Link
          to={`${BASE}/new`}
          className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-orange-600"
        >
          Dodaj szablon
        </Link>
      }
    >
      <div className="rounded-xl border border-slate-200/90 bg-white px-6 py-14 text-center shadow-sm">
        <p className="text-sm text-slate-500">Sekcja w przygotowaniu — po podłączeniu modułu pojawi się tu lista z filtrami i paginacją.</p>
      </div>
    </MessageTemplatesShell>
  );
}

function MessageTemplatesNewPage() {
  return (
    <MessageTemplatesShell title="Nowy szablon wiadomości" subtitle="Utwórz nowy szablon (formularz w przygotowaniu).">
      <div className="flex flex-wrap gap-3">
        <Link to={BASE} className="text-sm font-medium text-slate-600 hover:text-slate-900">
          ← Wróć do listy
        </Link>
      </div>
      <div className="rounded-xl border border-slate-200/90 bg-white px-6 py-14 text-center shadow-sm">
        <p className="text-sm text-slate-500">Edytor i formularz zostaną podłączone do istniejącej logiki szablonów wiadomości.</p>
      </div>
    </MessageTemplatesShell>
  );
}

function MessageTemplatesEditPage() {
  return (
    <MessageTemplatesShell title="Edycja szablonu wiadomości" subtitle="Edycja istniejącego szablonu (w przygotowaniu).">
      <div className="flex flex-wrap gap-3">
        <Link to={BASE} className="text-sm font-medium text-slate-600 hover:text-slate-900">
          ← Wróć do listy
        </Link>
      </div>
      <div className="rounded-xl border border-slate-200/90 bg-white px-6 py-14 text-center shadow-sm">
        <p className="text-sm text-slate-500">Po wdrożeniu modułu zachowamy TinyMCE, panel zmiennych i ustawienia modułów.</p>
      </div>
    </MessageTemplatesShell>
  );
}

/** Trasy: `/admin/message-templates`, `/new`, `/:id/edit`. */
export default function MessageTemplatesModule() {
  return (
    <Routes>
      <Route index element={<MessageTemplatesListPage />} />
      <Route path="new" element={<MessageTemplatesNewPage />} />
      <Route path=":id/edit" element={<MessageTemplatesEditPage />} />
    </Routes>
  );
}
