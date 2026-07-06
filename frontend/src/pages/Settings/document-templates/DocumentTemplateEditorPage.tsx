import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useParams } from "react-router-dom";

import toast from "react-hot-toast";



import {

  fetchEditorContext,

  previewDocumentHtml,

  previewDocumentPdf,

  publishDocumentTemplate,

  saveDocumentTemplateDraft,

  searchSymbolUsage,

  validateDocumentVersion,

  type EditorContextDto,

  type UsageSearchHit,

  type ValidationReport,

} from "../../../api/documentTemplatesApi";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";

import { DEFAULT_TENANT_ID } from "./constants";

import { EditorDetailsPanel } from "./components/EditorDetailsPanel";

import { EditorLeftPanel } from "./components/EditorLeftPanel";

import { EditorRightPanel } from "./components/EditorRightPanel";

import { EditorTopBar } from "./components/EditorTopBar";

import { PublishModal } from "./components/PublishModal";

import { TwigMonacoEditor, type TwigEditorHandle } from "./components/TwigMonacoEditor";

import { useEditorLayoutState } from "./hooks/useEditorLayoutState";

import { useRightPanelWidth } from "./hooks/useRightPanelWidth";

import { formatPublishError, extractValidationReportFromError } from "./utils/publishErrorMessages";

import { translateValidationReport } from "./utils/twigErrorMessages";



export function DocumentTemplateEditorPage() {

  const { templateId } = useParams<{ templateId: string }>();

  const editorRef = useRef<TwigEditorHandle>(null);

  const previewScrollRef = useRef(0);

  const [ctx, setCtx] = useState<EditorContextDto | null>(null);

  const [displayName, setDisplayName] = useState("");

  const [twigContent, setTwigContent] = useState("");

  const [extendsVersionId, setExtendsVersionId] = useState<number | null>(null);

  const [partialPins, setPartialPins] = useState<Record<string, number>>({});

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const [previewPdf, setPreviewPdf] = useState<Blob | null>(null);

  const [previewLoading, setPreviewLoading] = useState(false);

  const [previewError, setPreviewError] = useState<string | null>(null);

  const [previewRevision, setPreviewRevision] = useState(0);

  const [validation, setValidation] = useState<ValidationReport | null>(null);

  const [liveValidation, setLiveValidation] = useState<ValidationReport | null>(null);

  const [highlightedIssueIndex, setHighlightedIssueIndex] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);

  const [publishOpen, setPublishOpen] = useState(false);

  const [publishing, setPublishing] = useState(false);

  const [usageHits, setUsageHits] = useState<UsageSearchHit[]>([]);

  const [usageQuery, setUsageQuery] = useState("");

  const [assignmentsFocusToken, setAssignmentsFocusToken] = useState(0);



  const {

    leftOpen,

    setLeftOpen,

    rightOpen,

    setRightOpen,

    rightTab,

    setRightTab,

    openRightTab,

    detailsOpen,

    setDetailsOpen,

  } = useEditorLayoutState();



  const { width: rightPanelWidth, startResize, dragging: rightPanelDragging } = useRightPanelWidth();



  const variant = ctx?.bindings[0]?.variant_code ?? "standard";



  const partialPinsJson = useMemo(() => {

    const entries = Object.entries(partialPins).filter(([, v]) => v > 0);

    if (!entries.length) return null;

    return JSON.stringify(Object.fromEntries(entries));

  }, [partialPins]);



  const baseLabel = useMemo(() => {

    if (!extendsVersionId || !ctx) return null;

    for (const t of ctx.base_templates) {

      const v = t.published_versions.find((pv) => pv.id === extendsVersionId);

      if (v) return `${t.name} v${v.version_number}`;

    }

    return ctx.extends_base ? `${ctx.extends_base.template_name} v${ctx.extends_base.pinned_version.version_number}` : null;

  }, [ctx, extendsVersionId]);



  const publishedVersionId = ctx?.detail.published_version?.id ?? ctx?.detail.draft_version?.id ?? null;



  const load = useCallback(async () => {

    if (!templateId) return;

    const data = await fetchEditorContext(DEFAULT_TENANT_ID, Number(templateId));

    setCtx(data);

    setDisplayName(data.detail.name);

    setTwigContent(data.detail.twig_content ?? "");

    const draft = data.detail.draft_version;

    const previewPins = data.preview_pins;

    setExtendsVersionId(

      draft?.extends_version_id

        ?? data.extends_base?.pinned_version?.id

        ?? previewPins?.extends_version_id

        ?? null,

    );

    const pins: Record<string, number> = {};

    const pinsJson = draft?.partial_pins_json ?? previewPins?.partial_pins_json;

    if (pinsJson) {

      try {

        Object.assign(pins, JSON.parse(pinsJson));

      } catch {

        /* ignore */

      }

    }

    for (const p of data.partials_used) {

      const versionId = p.pinned_version?.id ?? p.latest_published?.id;

      if (versionId) pins[p.partial_code] = versionId;

    }

    setPartialPins(pins);

  }, [templateId]);



  useEffect(() => {

    load().catch((err) => toast.error(extractApiErrorMessage(err, "Nie udało się wczytać edytora.")));

  }, [load]);



  const refreshPreview = useCallback(async (): Promise<string | null> => {

    if (!ctx?.detail.kind?.code || !twigContent.trim()) return null;

    setPreviewLoading(true);

    setPreviewError(null);

    setPreviewPdf(null);

    let pdfErrMsg: string | null = null;

    try {

      const previewPins = ctx.preview_pins;

      const payload = {

        kind_code: ctx.detail.kind.code,

        twig_content: twigContent,

        context_mode: "sample" as const,

        extends_version_id: extendsVersionId ?? previewPins?.extends_version_id ?? null,

        partial_pins_json: partialPinsJson ?? previewPins?.partial_pins_json ?? null,

        params: {},

        warehouse_id: 1,

      };

      const html = await previewDocumentHtml(DEFAULT_TENANT_ID, payload);

      setPreviewHtml(html);

      setPreviewRevision((r) => r + 1);

      try {

        const pdf = await previewDocumentPdf(DEFAULT_TENANT_ID, payload);

        setPreviewPdf(pdf);

      } catch (pdfErr) {

        pdfErrMsg = extractApiErrorMessage(pdfErr, "Nie udało się wygenerować podglądu PDF.");

        setPreviewError(pdfErrMsg);

      }

      return pdfErrMsg;

    } catch (err) {

      const msg = extractApiErrorMessage(err, "Błąd podglądu HTML.");

      setPreviewHtml(null);

      setPreviewError(msg);

      return msg;

    } finally {

      setPreviewLoading(false);

    }

  }, [ctx, twigContent, extendsVersionId, partialPinsJson]);



  const handleSave = useCallback(async () => {

    if (!templateId) return;

    setSaving(true);

    try {

      await saveDocumentTemplateDraft(DEFAULT_TENANT_ID, Number(templateId), {

        twig_content: twigContent,

        change_summary: "Zapis w edytorze",

        extends_version_id: extendsVersionId,

        partial_pins_json: partialPinsJson,

      });

      toast.success("Zapisano wersję roboczą.");

      await load();

      await refreshPreview();

    } catch (err) {

      toast.error(extractApiErrorMessage(err, "Nie udało się zapisać."));

    } finally {

      setSaving(false);

    }

  }, [templateId, twigContent, extendsVersionId, partialPinsJson, load, refreshPreview]);



  useEffect(() => {

    const onKey = (e: KeyboardEvent) => {

      if ((e.ctrlKey || e.metaKey) && e.key === "s") {

        e.preventDefault();

        void handleSave();

      }

    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);

  }, [handleSave]);



  const runPublicationValidation = useCallback(async (): Promise<ValidationReport | null> => {

    if (!templateId || !ctx) return null;

    await saveDocumentTemplateDraft(DEFAULT_TENANT_ID, Number(templateId), {

      twig_content: twigContent,

      extends_version_id: extendsVersionId,

      partial_pins_json: partialPinsJson,

    });

    const refreshed = await fetchEditorContext(DEFAULT_TENANT_ID, Number(templateId));

    setCtx(refreshed);

    const versionId = refreshed.detail.draft_version?.id ?? refreshed.detail.active_version_id;

    if (!versionId) return null;

    const kindCode = refreshed.detail.kind?.code ?? undefined;

    const report = translateValidationReport(

      await validateDocumentVersion(versionId, kindCode),

    );

    setValidation(report);

    return report;

  }, [templateId, ctx, twigContent, extendsVersionId, partialPinsJson]);



  useEffect(() => {

    if (!ctx) return;

    const timer = window.setTimeout(() => {

      void runPublicationValidation().catch(() => {

        /* errors surfaced on publish or tab */

      });

    }, 1200);

    return () => window.clearTimeout(timer);

  }, [ctx, twigContent, extendsVersionId, partialPinsJson, runPublicationValidation]);



  function applyPublishFailure(err: unknown, report?: ValidationReport | null) {

    const fromErr = extractValidationReportFromError(err);

    const failure = report && !report.ok ? report : fromErr && !fromErr.ok ? translateValidationReport(fromErr) : null;

    if (failure) {

      setValidation(failure);

      focusFirstValidationIssue(failure);

    } else {

      openRightTab("errors");

      setRightOpen(true);

    }

    toast.error(formatPublishError(err, failure));

  }



  const runValidation = runPublicationValidation;



  function focusFirstValidationIssue(report: ValidationReport) {

    const first = report.issues[0];

    if (first?.line) editorRef.current?.goToLine(first.line, first.column ?? 1);

    setHighlightedIssueIndex(0);

    openRightTab("errors");

    setRightOpen(true);

  }



  async function handlePublishClick() {

    try {

      const report = await runValidation();

      if (!report) {

        toast.error("Nie udało się uruchomić walidacji.");

        return;

      }

      if (!report.ok) {

        focusFirstValidationIssue(report);

        toast.error(formatPublishError(null, report));

        return;

      }

      setHighlightedIssueIndex(null);

      const previewErr = await refreshPreview();

      if (previewErr) {

        openRightTab("pdf");

        toast.error(previewErr);

        return;

      }

      setPublishOpen(true);

    } catch (err) {

      applyPublishFailure(err);

    }

  }



  async function handlePublishConfirm(changeSummary: string) {

    if (!templateId) return;

    setPublishing(true);

    try {

      const report = await runValidation();

      if (report && !report.ok) {

        focusFirstValidationIssue(report);

        toast.error(formatPublishError(null, report));

        return;

      }

      await publishDocumentTemplate(DEFAULT_TENANT_ID, Number(templateId), undefined, changeSummary);

      toast.success("Opublikowano szablon.");

      setPublishOpen(false);

      setHighlightedIssueIndex(null);

      await load();

      await refreshPreview();

    } catch (err) {

      applyPublishFailure(err, validation);

    } finally {

      setPublishing(false);

    }

  }



  async function handleSearchUsage(symbol: string) {

    setUsageQuery(symbol);

    openRightTab("usage");

    const hits = await searchSymbolUsage(DEFAULT_TENANT_ID, { symbol, symbol_type: "variable" });

    setUsageHits(hits);

  }



  function openUsageTab() {

    setRightOpen(true);

    setRightTab("usage");

  }



  if (!ctx) {

    return <div className="flex h-48 items-center justify-center text-slate-500">Wczytywanie szablonu…</div>;

  }



  const numericTemplateId = Number(templateId);



  const inspectorBodyProps = {

    previewHtml,

    previewPdf,

    previewLoading,

    previewError,

    previewRevision,

    validation,

    liveValidation,

    highlightedIssueIndex,

    onIssueClick: (issue: { line?: number; column?: number }) => {

      if (issue.line) editorRef.current?.goToLine(issue.line, issue.column ?? 1);

    },

    impact: ctx.impact,

    dependencies: ctx.dependencies,

    versionsHistory: ctx.versions_history,

    kindCode: ctx.detail.kind?.code,

    templateId: numericTemplateId,

    templateKindCode: ctx.detail.kind?.code ?? null,

    templateKindName: ctx.detail.kind?.name_pl ?? null,

    publishedVersionId,

    usageHits,

    usageQuery,

    onRefreshPreview: () => void refreshPreview(),

    onPreviewVersion: setTwigContent,

    scrollRef: previewScrollRef,

    onAssignmentsChange: () => void load(),

  };



  return (

    <>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">

        <EditorTopBar

          ctx={ctx}

          displayName={displayName}

          variant={variant}

          saving={saving}

          leftOpen={leftOpen}

          rightOpen={rightOpen}

          detailsOpen={detailsOpen}

          onNameChange={setDisplayName}

          onSave={() => void handleSave()}

          onPublish={() => void handlePublishClick()}

          onAssignmentsChange={() => void load()}

          onToggleDetails={() => setDetailsOpen((v) => !v)}

          onToggleLeft={() => setLeftOpen((v) => !v)}

          onToggleRight={() => setRightOpen((v) => !v)}

          onOpenRightTab={openRightTab}

          onOpenUsageTab={openUsageTab}

        />

        <EditorDetailsPanel

          ctx={ctx}

          baseLabel={baseLabel}

          variant={variant}

          open={detailsOpen}

          onClose={() => setDetailsOpen(false)}

        />



        <div className="flex min-h-0 flex-1">

          <EditorLeftPanel

            templateId={numericTemplateId}

            collapsed={!leftOpen}

            onExpand={() => setLeftOpen(true)}

            assignmentsFocusToken={assignmentsFocusToken}

            ctx={ctx}

            onInsert={(s) => editorRef.current?.insertSnippet(s)}

            extendsVersionId={extendsVersionId}

            partialPins={partialPins}

            onBaseVersionChange={setExtendsVersionId}

            onPartialPinChange={(code, vid) =>

              setPartialPins((prev) => {

                const next = { ...prev };

                if (vid) next[code] = vid;

                else delete next[code];

                return next;

              })

            }

            onSearchUsage={(sym) => void handleSearchUsage(sym)}

          />



          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col border-x border-slate-100">

            <TwigMonacoEditor

              ref={editorRef}

              value={twigContent}

              onChange={setTwigContent}

              kindCode={ctx.detail.kind?.code}

              variableFields={ctx.variable_fields}

              helpers={ctx.catalog.helpers}

              tags={ctx.catalog.tags}

              onValidationChange={(r) => setLiveValidation(r ? translateValidationReport(r) : null)}

            />

          </div>



          <EditorRightPanel

            collapsed={!rightOpen}

            onExpand={() => setRightOpen(true)}

            onCollapse={() => setRightOpen(false)}

            activeTab={rightTab}

            onTabChange={setRightTab}

            panelWidth={rightPanelWidth}

            onResizeStart={startResize}

            resizing={rightPanelDragging}

            {...inspectorBodyProps}

          />

        </div>

      </div>



      <PublishModal

        open={publishOpen}

        onClose={() => setPublishOpen(false)}

        onConfirm={handlePublishConfirm}

        publishing={publishing}

      />

    </>

  );

}


