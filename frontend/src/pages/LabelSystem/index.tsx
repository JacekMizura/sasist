import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useParams, Link } from "react-router-dom";
import type { LabelTemplate } from "../../types/labelSystem";
import { LabelTemplatesList } from "./LabelTemplatesList";
import { LabelTemplateDesigner } from "./LabelTemplateDesigner";
import { LabelPrintQueue } from "./LabelPrintQueue";
import api from "../../api/axios";

const DEFAULT_TEMPLATE: LabelTemplate = {
  id: "new",
  name: "Nowy szablon",
  widthMm: 50,
  heightMm: 30,
  dpi: 300,
  elements: [],
  template_type: "location",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

import type { TemplateMeta } from "./LabelTemplateDesigner";

function DesignerWrapper() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<LabelTemplate>(DEFAULT_TEMPLATE);
  const [templateMeta, setTemplateMeta] = useState<TemplateMeta>({ group_id: null });
  const [loading, setLoading] = useState(!!id && id !== "new");

  useEffect(() => {
    if (!id || id === "new") {
      setTemplate({ ...DEFAULT_TEMPLATE, id: "new" });
      setTemplateMeta({ group_id: null });
      setLoading(false);
      return;
    }
    const numId = parseInt(id, 10);
    if (Number.isNaN(numId)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get(`/label-templates/`, { params: { tenant_id: 1 } })
      .then((res) => {
        const row = (res.data as { id: number; name: string; template_type?: string; template_json: string; group_id?: number | null }[]).find((r) => r.id === numId);
        if (row) {
          const t = JSON.parse(row.template_json) as LabelTemplate;
          setTemplate({
            ...t,
            id: String(row.id),
            name: row.name,
            template_type: (row.template_type || t.template_type) as LabelTemplate["template_type"],
            updatedAt: new Date().toISOString(),
          });
          setTemplateMeta({ group_id: row.group_id ?? null });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const onTemplateChange = (next: LabelTemplate) => {
    setTemplate(next);
  };

  const onBack = () => navigate("/labels");

  if (loading) return <div className="p-6 text-slate-500">Loading…</div>;

  return (
    <LabelTemplateDesigner
      template={template}
      onTemplateChange={onTemplateChange}
      templateId={id === "new" ? null : id ? parseInt(id, 10) : null}
      templateMeta={templateMeta}
      onTemplateMetaChange={setTemplateMeta}
      onBack={onBack}
    />
  );
}

import PageLayout from "../../components/layout/PageLayout";

export default function LabelSystem() {
  return (
    <PageLayout
      title="System etykiet"
      actions={
        <nav className="flex rounded-lg bg-slate-100 p-0.5 border border-[#E2E8F0]" aria-label="Moduły">
          <Link
            to="/labels"
            className="px-4 py-2 rounded-md text-sm font-semibold transition-colors text-slate-600 hover:bg-slate-200"
          >
            Szablony
          </Link>
          <Link
            to="/labels/queue"
            className="px-4 py-2 rounded-md text-sm font-semibold transition-colors text-slate-600 hover:bg-slate-200"
          >
            Kolejka druku
          </Link>
        </nav>
      }
    >
      <div className="min-h-[60vh]">
        <Routes>
          <Route index element={<LabelTemplatesList />} />
          <Route path="designer/:id" element={<DesignerWrapper />} />
          <Route path="designer" element={<DesignerWrapper />} />
          <Route path="queue" element={<LabelPrintQueueStandalone />} />
        </Routes>
      </div>
    </PageLayout>
  );
}

function LabelPrintQueueStandalone() {
  const [template] = useState<LabelTemplate>(() => ({
    ...DEFAULT_TEMPLATE,
    id: "queue-default",
  }));
  return <LabelPrintQueue template={template} onTemplateChange={() => {}} />;
}
