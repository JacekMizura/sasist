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
import { EditorLeftPanel } from "./components/EditorLeftPanel";
import { EditorRightPanel } from "./components/EditorRightPanel";
import { EditorTopBar } from "./components/EditorTopBar";
import { PublishModal } from "./components/PublishModal";
import { TwigMonacoEditor, type TwigEditorHandle } from "./components/TwigMonacoEditor";

type RightTab = "html" | "pdf" | "errors" | "compare" | "usage" | "impact" | "dependencies" | "history";

export function DocumentTemplateEditorPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const editorRef = useRef<TwigEditorHandle>(null);
  const [ctx, setCtx] = useState<EditorContextDto | null>(null);
  const [twigContent, setTwigContent] = useState("");
  const [extendsVersionId, setExtendsVersionId] = useState<number | null>(null);
  const [partialPins, setPartialPins] = useState<Record<string, number>>({});
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewPdf, setPreviewPdf] = useState<Blob | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [contextMode, setContextMode] = useState<"sample" | "live">("sample");
  const [rightTab, setRightTab] = useState<RightTab>("html");
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [liveValidation, setLiveValidation] = useState<ValidationReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [usageHits, setUsageHits] = useState<UsageSearchHit[]>([]);
  const [usageQuery, setUsageQuery] = useState("");

  const partialPinsJson = useMemo(() => {
    const entries = Object.entries(partialPins).filter(([, v]) => v > 0);
    if (!entries.length) return null;
    return JSON.stringify(Object.fromEntries(entries));
  }, [partialPins]);

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

  useEffect(() => {
    const t = window.setTimeout(() => { void refreshPreview(); }, 800);
    return () => window.clearTimeout(t);
  }, [refreshPreview]);

  async function handleSave() {
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
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Nie udało się zapisać."));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishConfirm(changeSummary: string) {
    if (!templateId) return;
    setPublishing(true);
    try {
      await handleSave();
      await publishDocumentTemplate(DEFAULT_TENANT_ID, Number(templateId), undefined, changeSummary);
      toast.success("Opublikowano szablon.");
      setPublishOpen(false);
      await load();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Publikacja zablokowana lub nie powiodła się."));
      setRightTab("errors");
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
      setRightTab("errors");
      if (report.ok) toast.success("Walidacja przed publikacją — OK.");
      else toast.error(`Znaleziono ${report.issues.length} problemów.`);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Walidacja nie powiodła się."));
    }
  }

  async function handleSearchUsage(symbol: string) {
    setUsageQuery(symbol);
    setRightTab("usage");
    const hits = await searchSymbolUsage(DEFAULT_TENANT_ID, { symbol, symbol_type: "variable" });
    setUsageHits(hits);
  }

  const baseLabel = useMemo(() => {
    if (!extendsVersionId || !ctx) return null;
    for (const t of ctx.base_templates) {
      const v = t.published_versions.find((pv) => pv.id === extendsVersionId);
      if (v) return `${t.name} v${v.version_number}`;
    }
    return ctx.extends_base ? `${ctx.extends_base.template_name} v${ctx.extends_base.pinned_version.version_number}` : null;
  }, [ctx, extendsVersionId]);

  if (!ctx) {
    return <div className="flex h-[60vh] items-center justify-center text-slate-500">Wczytywanie edytora…</div>;
  }

  return (
    <>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-slate-50">
        <EditorTopBar
          ctx={ctx}
          extendsVersionId={extendsVersionId}
          baseLabel={baseLabel}
          saving={saving}
          onSave={handleSave}
          onPublish={() => setPublishOpen(true)}
          onValidate={handleValidate}
          onPreview={() => { setRightTab("html"); void refreshPreview(); }}
        />
        <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_minmax(320px,38%)]">
          <EditorLeftPanel
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
          <TwigMonacoEditor
            ref={editorRef}
            value={twigContent}
            onChange={setTwigContent}
            kindCode={ctx.detail.kind?.code}
            variableTree={ctx.variable_tree}
            variableFields={ctx.variable_fields}
            helpers={ctx.catalog.helpers}
            tags={ctx.catalog.tags}
            onValidationChange={setLiveValidation}
          />
          <EditorRightPanel
            activeTab={rightTab}
            onTabChange={setRightTab}
            previewHtml={previewHtml}
            previewPdf={previewPdf}
            previewLoading={previewLoading}
            previewError={previewError}
            contextMode={contextMode}
            onContextModeChange={setContextMode}
            validation={validation}
            liveValidation={liveValidation}
            onIssueClick={(issue) => {
              if (issue.line) editorRef.current?.goToLine(issue.line, issue.column ?? 1);
            }}
            impact={ctx.impact}
            dependencies={ctx.dependencies}
            versionsHistory={ctx.versions_history}
            usageHits={usageHits}
            usageQuery={usageQuery}
            onRefreshPreview={() => void refreshPreview()}
            onPreviewVersion={setTwigContent}
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
