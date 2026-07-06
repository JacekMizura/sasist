import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import {
  fetchVersionContent,
  type DependencyGraphDto,
  type DocumentTemplateVersionDto,
  type EditorImpactDto,
  type UsageSearchHit,
  type ValidationIssue,
  type ValidationReport,
} from "../../../../api/documentTemplatesApi";
import type { EditorRightTab } from "../hooks/useEditorLayoutState";
import { VersionComparePanel } from "./VersionComparePanel";
import { VersionReplacePanel } from "./VersionReplacePanel";
import { TemplateUsagePanel } from "./TemplateUsagePanel";
import { translateValidationIssue } from "../utils/twigErrorMessages";

export type InspectorPanelBodyProps = {
  activeTab: EditorRightTab;
  previewHtml: string | null;
  previewPdf: Blob | null;
  previewLoading: boolean;
  previewError: string | null;
  previewRevision: number;
  validation: ValidationReport | null;
  liveValidation: ValidationReport | null;
  onIssueClick: (issue: ValidationIssue) => void;
  onRunValidation?: () => void;
  impact: EditorImpactDto | null;
  dependencies: DependencyGraphDto | null;
  versionsHistory: DocumentTemplateVersionDto[];
  kindCode?: string | null;
  templateId: number;
  templateKindCode: string | null;
  publishedVersionId: number | null;
  usageHits: UsageSearchHit[];
  usageQuery: string;
  onRefreshPreview: () => void;
  onPreviewVersion?: (content: string) => void;
  onAssignmentsChange?: () => void;
  scrollRef?: MutableRefObject<number>;
};

export function InspectorPanelBody(props: InspectorPanelBodyProps) {
  const {
    activeTab,
    previewHtml,
    previewPdf,
    previewLoading,
    previewError,
    previewRevision,
    validation,
    liveValidation,
    onIssueClick,
    onRunValidation,
    impact,
    dependencies,
    versionsHistory,
    kindCode,
    templateId,
    templateKindCode,
    publishedVersionId,
    usageHits,
    usageQuery,
    onRefreshPreview,
    onPreviewVersion,
    onAssignmentsChange,
    scrollRef,
  } = props;

  const pdfUrl = useMemoPdfUrl(previewPdf);

  return (
    <>
      {(activeTab === "html" || activeTab === "pdf") && (
        <>
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
              onClick={onRefreshPreview}
            >
              Odśwież podgląd
            </button>
          </div>
          <PreviewPane
            mode={activeTab}
            html={previewHtml}
            pdfUrl={pdfUrl}
            loading={previewLoading}
            error={previewError}
            revision={previewRevision}
            scrollRef={scrollRef}
          />
        </>
      )}
      {activeTab === "errors" && (
        <ErrorsPane
          validation={liveValidation ?? validation}
          onIssueClick={onIssueClick}
          onRunValidation={onRunValidation}
          live={!!liveValidation}
        />
      )}
      {activeTab === "compare" && <VersionComparePanel versions={versionsHistory} />}
      {activeTab === "usage" && (
        <TemplateUsagePanel
          templateId={templateId}
          templateKindCode={templateKindCode}
          publishedVersionId={publishedVersionId}
          onAssignmentsChange={onAssignmentsChange}
        />
      )}
      {activeTab === "impact" && <ImpactPane impact={impact} />}
      {activeTab === "dependencies" && <DependenciesPane graph={dependencies} />}
      {activeTab === "history" && (
        <HistoryPane versions={versionsHistory} kindCode={kindCode} onPreviewVersion={onPreviewVersion} />
      )}
    </>
  );
}

function useMemoPdfUrl(previewPdf: Blob | null) {
  const pdfUrl = useMemo(() => (previewPdf ? URL.createObjectURL(previewPdf) : null), [previewPdf]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  return pdfUrl;
}

export function PreviewPane({
  mode,
  html,
  pdfUrl,
  loading,
  error,
  revision,
  scrollRef,
}: {
  mode: "html" | "pdf";
  html: string | null;
  pdfUrl: string | null;
  loading: boolean;
  error: string | null;
  revision: number;
  scrollRef?: MutableRefObject<number>;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const restore = () => {
      const y = scrollRef?.current ?? 0;
      if (!y) return;
      try {
        iframe.contentWindow?.scrollTo(0, y);
      } catch {
        /* ignore */
      }
    };
    iframe.addEventListener("load", restore);
    return () => iframe.removeEventListener("load", restore);
  }, [html, pdfUrl, revision, scrollRef]);

  if (loading) return <p className="text-slate-500">Generowanie podglądu…</p>;
  if (error) return <p className="text-rose-700">{error}</p>;
  if (mode === "html" && html) {
    return (
      <iframe
        ref={iframeRef}
        key={`html-${revision}`}
        title="Podgląd HTML"
        className="h-[min(900px,78vh)] w-full rounded border border-slate-200 bg-white shadow-sm"
        srcDoc={html}
        onLoad={() => {
          const iframe = iframeRef.current;
          if (!iframe || !scrollRef) return;
          try {
            iframe.contentWindow?.addEventListener("scroll", () => {
              scrollRef.current = iframe.contentWindow?.scrollY ?? 0;
            });
          } catch {
            /* ignore */
          }
        }}
      />
    );
  }
  if (mode === "pdf" && pdfUrl) {
    return (
      <iframe
        ref={iframeRef}
        key={`pdf-${revision}`}
        title="Podgląd PDF"
        className="h-[min(900px,78vh)] w-full rounded border border-slate-200 bg-white shadow-sm"
        src={pdfUrl}
      />
    );
  }
  return <p className="text-slate-500">Kliknij „Odśwież podgląd” lub zapisz szablon (Ctrl+S).</p>;
}

function ErrorsPane({
  validation,
  onIssueClick,
  onRunValidation,
  live,
}: {
  validation: ValidationReport | null;
  onIssueClick: (issue: ValidationIssue) => void;
  onRunValidation?: () => void;
  live: boolean;
}) {
  return (
    <div className="space-y-3">
      {onRunValidation ? (
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
          onClick={onRunValidation}
        >
          Waliduj przed publikacją
        </button>
      ) : null}
      {!validation ? (
        <p className="text-slate-500">Błędy składni pojawią się tutaj podczas edycji.</p>
      ) : validation.ok ? (
        <p className="text-emerald-700">{live ? "Brak błędów w szablonie." : "Walidacja przed publikacją — OK."}</p>
      ) : (
        <ul className="space-y-2">
          {validation.issues.map((issue, idx) => {
            const t = translateValidationIssue(issue);
            return (
              <li key={idx}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2 text-left hover:bg-rose-50"
                  onClick={() => onIssueClick(issue)}
                >
                  {t.lineLabel ? <div className="text-xs font-medium text-rose-800">{t.lineLabel}</div> : null}
                  <div className="mt-0.5 text-sm text-rose-900">{t.message}</div>
                  {t.suggestion ? <div className="mt-1 text-xs text-slate-600">{t.suggestion}</div> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ImpactPane({ impact }: { impact: EditorImpactDto | null }) {
  if (!impact) return <p className="text-slate-500">Brak danych o wpływie.</p>;
  return (
    <div className="space-y-4 text-xs">
      {impact.messages.map((msg, i) => (
        <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">{msg}</div>
      ))}
    </div>
  );
}

function DependenciesPane({ graph }: { graph: DependencyGraphDto | null }) {
  if (!graph?.nodes?.length) return <p className="text-slate-500">Brak zależności.</p>;
  return (
    <div className="space-y-3 text-xs">
      {graph.nodes.map((node) => (
        <div key={String(node.version_id)} className="rounded-lg border border-slate-200 px-3 py-2">
          <div className="font-medium text-slate-800">
            {String(node.template_name)} · wersja {String(node.version_number)}
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryPane({
  versions,
  kindCode,
  onPreviewVersion,
}: {
  versions: DocumentTemplateVersionDto[];
  kindCode?: string | null;
  onPreviewVersion?: (content: string) => void;
}) {
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);

  async function loadPreview(id: number) {
    setPreviewId(id);
    const data = await fetchVersionContent(id);
    setPreviewContent(data.twig_content);
    onPreviewVersion?.(data.twig_content);
  }

  if (!versions.length) return <p className="text-slate-500">Brak historii wersji.</p>;

  return (
    <div className="space-y-3 text-xs">
      <ul className="space-y-2">
        {versions.map((v) => (
          <li
            key={v.id}
            className={`rounded-lg border px-3 py-2 ${
              v.status === "published" ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-slate-900">
                  v{v.version_number} · {v.status_label ?? v.status}
                </div>
                {v.change_summary ? <div className="mt-1 text-slate-700">{v.change_summary}</div> : null}
              </div>
              <button type="button" className="shrink-0 text-blue-700" onClick={() => void loadPreview(v.id)}>
                Podgląd
              </button>
            </div>
            {v.status === "published" ? (
              <div className="mt-3">
                <VersionReplacePanel kindCode={kindCode} fromVersion={v} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {previewContent && previewId ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[10px]">{previewContent.slice(0, 2000)}</pre>
        </div>
      ) : null}
    </div>
  );
}
