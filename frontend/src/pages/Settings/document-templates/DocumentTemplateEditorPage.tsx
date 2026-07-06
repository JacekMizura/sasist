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
import { DetachedInspectorPanel } from "./components/DetachedInspectorPanel";
import { EditorDetailsPanel } from "./components/EditorDetailsPanel";
import { EditorLeftPanel } from "./components/EditorLeftPanel";
import { EditorRightPanel } from "./components/EditorRightPanel";
import { EditorStatusBar } from "./components/EditorStatusBar";
import { EditorTopBar } from "./components/EditorTopBar";
import { PublishModal } from "./components/PublishModal";
import { TwigMonacoEditor, type TwigEditorHandle } from "./components/TwigMonacoEditor";
import { useEditorLayoutState } from "./hooks/useEditorLayoutState";

function useViewportWidth() {
  const [width, setWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1920));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

export function DocumentTemplateEditorPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const editorRef = useRef<TwigEditorHandle>(null);
  const previewScrollRef = useRef(0);
  const [ctx, setCtx] = useState<EditorContextDto | null>(null);
  const [twigContent, setTwigContent] = useState("");
  const [extendsVersionId, setExtendsVersionId] = useState<number | null>(null);
  const [partialPins, setPartialPins] = useState<Record<string, number>>({});
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewPdf, setPreviewPdf] = useState<Blob | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [contextMode, setContextMode] = useState<"sample" | "live">("sample");
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [liveValidation, setLiveValidation] = useState<ValidationReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [usageHits, setUsageHits] = useState<UsageSearchHit[]>([]);
  const [usageQuery, setUsageQuery] = useState("");
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [assignmentsFocusToken, setAssignmentsFocusToken] = useState(0);

  const viewportWidth = useViewportWidth();

  const {
    leftOpen,
    setLeftOpen,
    rightOpen,
    setRightOpen,
    rightDetached,
    detachRight,
    dockRight,
    minimapEnabled,
    toggleMinimap,
    fullscreen,
    setFullscreen,
    enterFullscreen,
    rightTab,
    setRightTab,
    openRightTab,
    detailsOpen,
    setDetailsOpen,
  } = useEditorLayoutState();

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

  const statusLabel = useMemo(() => {
    if (!ctx) return "—";
    const status = ctx.detail.draft_version?.status ?? ctx.detail.published_version?.status ?? "draft";
    if (status === "published") return "Published";
    if (status === "archived") return "Archived";
    return "Draft";
  }, [ctx]);

  const load = useCallback(async () => {
    if (!templateId) return;
    const data = await fetchEditorContext(DEFAULT_TENANT_ID, Number(templateId));
    setCtx(data);
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

  const refreshPreview = useCallback(async () => {
    if (!ctx?.detail.kind?.code || !twigContent.trim()) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewPdf(null);
    try {
      const previewPins = ctx.preview_pins;
      const payload = {
        kind_code: ctx.detail.kind.code,
        twig_content: twigContent,
        context_mode: contextMode,
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
        setPreviewError(extractApiErrorMessage(pdfErr, "Błąd podglądu PDF."));
      }
    } catch (err) {
      setPreviewHtml(null);
      setPreviewError(extractApiErrorMessage(err, "Błąd podglądu HTML."));
    } finally {
      setPreviewLoading(false);
    }
  }, [ctx, twigContent, contextMode, extendsVersionId, partialPinsJson]);

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

  async function handlePublishConfirm(changeSummary: string) {
    if (!templateId) return;
    setPublishing(true);
    try {
      await handleSave();
      await publishDocumentTemplate(DEFAULT_TENANT_ID, Number(templateId), undefined, changeSummary);
      toast.success("Opublikowano szablon.");
      setPublishOpen(false);
      await load();
      await refreshPreview();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Publikacja zablokowana lub nie powiodła się."));
      openRightTab("errors");
    } finally {
      setPublishing(false);
    }
  }

  async function handleValidate() {
    if (!templateId || !ctx) return;
    try {
      await saveDocumentTemplateDraft(DEFAULT_TENANT_ID, Number(templateId), {
        twig_content: twigContent,
        extends_version_id: extendsVersionId,
        partial_pins_json: partialPinsJson,
      });
      const refreshed = await fetchEditorContext(DEFAULT_TENANT_ID, Number(templateId));
      setCtx(refreshed);
      const versionId = refreshed.detail.active_version_id;
      if (!versionId) return;
      const report = await validateDocumentVersion(versionId, ctx.detail.kind?.code);
      setValidation(report);
      openRightTab("errors");
      await refreshPreview();
      if (report.ok) toast.success("Walidacja przed publikacją — OK.");
      else toast.error(`Znaleziono ${report.issues.length} problemów.`);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Walidacja nie powiodła się."));
    }
  }

  async function handleSearchUsage(symbol: string) {
    setUsageQuery(symbol);
    openRightTab("usage");
    const hits = await searchSymbolUsage(DEFAULT_TENANT_ID, { symbol, symbol_type: "variable" });
    setUsageHits(hits);
  }

  function openAssignmentsTab() {
    setLeftOpen(true);
    setAssignmentsFocusToken((n) => n + 1);
  }

  if (!ctx) {
    return <div className="flex h-[60vh] items-center justify-center text-slate-500">Wczytywanie edytora…</div>;
  }

  const numericTemplateId = Number(templateId);
  const issueCount = (liveValidation?.issues.length ?? 0) || (validation && !validation.ok ? validation.issues.length : 0);

  const inspectorBodyProps = {
    previewHtml,
    previewPdf,
    previewLoading,
    previewError,
    previewRevision,
    contextMode,
    onContextModeChange: setContextMode,
    validation,
    liveValidation,
    onIssueClick: (issue: { line?: number; column?: number }) => {
      if (issue.line) editorRef.current?.goToLine(issue.line, issue.column ?? 1);
    },
    impact: ctx.impact,
    dependencies: ctx.dependencies,
    versionsHistory: ctx.versions_history,
    kindCode: ctx.detail.kind?.code,
    templateId: numericTemplateId,
    templateName: ctx.detail.name,
    usageHits,
    usageQuery,
    onRefreshPreview: () => void refreshPreview(),
    onPreviewVersion: setTwigContent,
    scrollRef: previewScrollRef,
  };

  const editorMaxWidthClass = viewportWidth > 2200 ? "mx-auto w-full max-w-[1600px]" : "w-full max-w-full";

  return (
    <>
      <div className={`flex flex-col bg-[#f3f3f3] ${fullscreen ? "fixed inset-0 z-40" : "h-[calc(100vh-3.5rem)]"}`}>
        {!fullscreen ? (
          <>
            <EditorTopBar
              ctx={ctx}
              variant={variant}
              saving={saving}
              detailsOpen={detailsOpen}
              leftOpen={leftOpen}
              rightOpen={rightOpen}
              fullscreen={fullscreen}
              onSave={() => void handleSave()}
              onOpenAssignmentsTab={openAssignmentsTab}
              onPublish={() => setPublishOpen(true)}
              onValidate={handleValidate}
              onPreview={() => {
                openRightTab("html");
                void refreshPreview();
              }}
              onToggleDetails={() => setDetailsOpen((v) => !v)}
              onToggleLeft={() => setLeftOpen((v) => !v)}
              onToggleRight={() => setRightOpen((v) => !v)}
              onEnterFullscreen={enterFullscreen}
              onExitFullscreen={() => setFullscreen(false)}
              onOpenRightTab={openRightTab}
            />
            <EditorDetailsPanel
              ctx={ctx}
              baseLabel={baseLabel}
              variant={variant}
              open={detailsOpen}
              onClose={() => setDetailsOpen(false)}
            />
          </>
        ) : null}

        <div className="relative flex min-h-0 flex-1">
          {!fullscreen ? (
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
          ) : null}

          <main className={`relative flex min-w-0 flex-1 flex-col ${editorMaxWidthClass}`}>
            {!leftOpen && !fullscreen ? (
              <button
                type="button"
                className="absolute left-2 top-2 z-10 rounded border border-slate-200 bg-white/90 px-2 py-1 text-[11px] shadow-sm"
                onClick={() => setLeftOpen(true)}
              >
                « Panel
              </button>
            ) : null}
            <TwigMonacoEditor
              ref={editorRef}
              value={twigContent}
              onChange={setTwigContent}
              kindCode={ctx.detail.kind?.code}
              variableTree={ctx.variable_tree}
              variableFields={ctx.variable_fields}
              helpers={ctx.catalog.helpers}
              tags={ctx.catalog.tags}
              minimapEnabled={minimapEnabled}
              onValidationChange={setLiveValidation}
              onCursorChange={setCursor}
            />
            {fullscreen ? (
              <button
                type="button"
                className="absolute bottom-4 right-4 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white shadow-lg"
                onClick={() => setFullscreen(false)}
              >
                Wyjdź z pełnego ekranu (Esc)
              </button>
            ) : (
              <EditorStatusBar
                language="TWIG"
                encoding="UTF-8"
                line={cursor.line}
                column={cursor.column}
                statusLabel={statusLabel}
                autoSaveLabel="Auto Save OFF"
                minimapOn={minimapEnabled}
                onToggleMinimap={toggleMinimap}
              />
            )}
          </main>

          {!fullscreen ? (
            <EditorRightPanel
              collapsed={!rightOpen}
              detached={rightDetached}
              onExpand={() => setRightOpen(true)}
              onCollapse={() => setRightOpen(false)}
              onDetach={detachRight}
              activeTab={rightTab}
              onTabChange={setRightTab}
              {...inspectorBodyProps}
            />
          ) : null}
        </div>
      </div>

      {rightDetached && !fullscreen ? (
        <DetachedInspectorPanel
          activeTab={rightTab}
          onTabChange={setRightTab}
          onDock={dockRight}
          issueCount={issueCount}
          {...inspectorBodyProps}
        />
      ) : null}
      <PublishModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={handlePublishConfirm}
        publishing={publishing}
      />
    </>
  );
}
