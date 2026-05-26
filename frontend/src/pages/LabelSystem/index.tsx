import { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Outlet, useNavigate, useParams, useLocation, Navigate } from "react-router-dom";
import type { LabelTemplate } from "../../types/labelSystem";
import { LabelTemplatesList } from "./LabelTemplatesList";
import { LabelTemplateDesigner } from "./LabelTemplateDesigner";
import { LabelPrintQueue } from "./LabelPrintQueue";
import api from "../../api/axios";
import { alertFailedRequest } from "../../utils/apiError";
import PageLayout from "../../components/layout/PageLayout";
import TopTabsNavigation from "../../components/TopTabsNavigation";
import type { TemplateMeta } from "./LabelTemplateDesigner";
import { labelModuleBasePath } from "./labelModuleBasePath";
import { labelModuleTabs } from "./labelModuleTabs";
import { LABEL_PRINT_MODULE_TYPE_ORDER } from "./labelPrintModuleTypes";
import { PrintTemplateNewPage } from "./PrintTemplateNewPage";
import { LabelReadyTemplatesPage } from "./LabelReadyTemplatesPage";

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

type DesignerLocationState = {
  initialTemplateType?: LabelTemplate["template_type"];
  presetTemplate?: LabelTemplate;
};

function DesignerWrapper() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const labelBase = labelModuleBasePath(pathname);
  const [template, setTemplate] = useState<LabelTemplate>(DEFAULT_TEMPLATE);
  const [templateMeta, setTemplateMeta] = useState<TemplateMeta>({ group_id: null });
  const [loading, setLoading] = useState(!!id && id !== "new");
  const navStateRef = useRef(location.state);
  navStateRef.current = location.state;

  useEffect(() => {
    if (!id || id === "new") {
      const st = (navStateRef.current ?? null) as DesignerLocationState | null;
      let next: LabelTemplate = { ...DEFAULT_TEMPLATE, id: "new" };
      if (st?.presetTemplate) {
        next = {
          ...st.presetTemplate,
          id: "new",
          name: st.presetTemplate.name || DEFAULT_TEMPLATE.name,
          updatedAt: new Date().toISOString(),
        };
      } else if (st?.initialTemplateType) {
        const allowed = LABEL_PRINT_MODULE_TYPE_ORDER as readonly string[];
        if (allowed.includes(String(st.initialTemplateType))) {
          next = {
            ...DEFAULT_TEMPLATE,
            id: "new",
            template_type: st.initialTemplateType,
          };
        }
      }
      setTemplate(next);
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
        const row = (
          res.data as {
            id: number;
            name: string;
            template_type?: string;
            template_json: string;
            group_id?: number | null;
          }[]
        ).find((r) => r.id === numId);
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
      .catch((err: unknown) => {
        alertFailedRequest("LabelSystem/DesignerWrapper", err, "Failed to load label template");
      })
      .finally(() => setLoading(false));
  }, [id, location.key]);

  const onTemplateChange = (next: LabelTemplate) => {
    setTemplate(next);
  };

  const onBack = () => navigate(labelBase);

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

function LabelListQueueShell() {
  const { pathname } = useLocation();
  const labelBase = labelModuleBasePath(pathname);
  const tabs = useMemo(() => labelModuleTabs(labelBase), [labelBase]);

  const tabNav = (
    <TopTabsNavigation tabs={tabs} exact aria-label="System etykiet" />
  );

  return (
    <PageLayout fullBleed cardClassName="min-h-[60vh] min-w-0">
      {tabNav}
      <Outlet />
    </PageLayout>
  );
}

function PrintTemplateEditRedirect() {
  const { id } = useParams<{ id: string }>();
  if (!id || id === "new") {
    return <Navigate to=".." replace />;
  }
  return <Navigate to={`../designer/${id}`} replace />;
}

export default function LabelSystem() {
  return (
    <Routes>
      <Route path="designer/:id" element={<DesignerWrapper />} />
      <Route path="designer" element={<DesignerWrapper />} />
      <Route path="new" element={<PrintTemplateNewPage />} />
      <Route path=":id/edit" element={<PrintTemplateEditRedirect />} />
      <Route element={<LabelListQueueShell />}>
        <Route index element={<LabelTemplatesList />} />
        <Route path="ready" element={<LabelReadyTemplatesPage />} />
        <Route path="queue" element={<LabelPrintQueueStandalone />} />
      </Route>
    </Routes>
  );
}

function LabelPrintQueueStandalone() {
  const [template] = useState<LabelTemplate>(() => ({
    ...DEFAULT_TEMPLATE,
    id: "queue-default",
  }));
  return <LabelPrintQueue template={template} onTemplateChange={() => {}} />;
}
