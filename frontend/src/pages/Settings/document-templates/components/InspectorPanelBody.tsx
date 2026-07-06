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
  impact: EditorImpactDto | null;
  dependencies: DependencyGraphDto | null;
  versionsHistory: DocumentTemplateVersionDto[];
  kindCode?: string | null;
  templateId: number;
  templateKindCode: string | null;
  templateKindName: string | null;
  publishedVersionId: number | null;
  usageHits: UsageSearchHit[];
  usageQuery: string;
  onRefreshPreview: () => void;
  onPreviewVersion?: (content: string) => void;
  onAssignmentsChange?: () => void;
  scrollRef?: MutableRefObject<number>;
  highlightedIssueIndex?: number | null;
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
    impact,
    dependencies,
    versionsHistory,
    kindCode,
    templateId,
    templateKindCode,
    templateKindName,
    publishedVersionId,
    usageHits,
    usageQuery,
    onRefreshPreview,
    onPreviewVersion,
    onAssignmentsChange,
    scrollRef,
    highlightedIssueIndex,
  } = props;

  const pdfUrl = useMemoPdfUrl(previewPdf);

  return (
    <>
      {(activeTab === "html" || activeTab === "pdf") && (
        <PreviewPane
          mode={activeTab}
          html={previewHtml}
          pdfUrl={pdfUrl}
          loading={previewLoading}
          error={previewError}
          revision={previewRevision}
          scrollRef={scrollRef}
        />
      )}
      {activeTab === "errors" && (
        <ErrorsPane
          validation={validation}
          onIssueClick={onIssueClick}
          highlightedIndex={highlightedIssueIndex}
        />
      )}
      {activeTab === "compare" && <VersionComparePanel versions={versionsHistory} />}
      {activeTab === "usage" && (
        <TemplateUsagePanel
          templateId={templateId}
          templateKindCode={templateKindCode}
          templateKindName={templateKindName}
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
    const srcDoc = injectPreviewMarginsReset(html);
    return (
      <iframe
        ref={iframeRef}
        key={`html-${revision}`}
        title="Podgląd HTML"
        className="h-[min(900px,78vh)] w-full border-0 bg-white"
        srcDoc={srcDoc}
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
    const src = `${pdfUrl}#view=FitH&zoom=page-width`;
    return (
      <iframe
        ref={iframeRef}
        key={`pdf-${revision}`}
        title="Podgląd PDF"
        className="h-[min(900px,78vh)] w-full border-0 bg-white"
        src={src}
      />
    );
  }
  return <p className="px-2 text-slate-500">Zapisz szablon (Ctrl+S), aby wygenerować podgląd.</p>;
}

function injectPreviewMarginsReset(html: string): string {
  const reset = "<style>html,body{margin:0!important;padding:0!important;width:100%!important;}</style>";
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${reset}`);
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${reset}</head>`);
  }
  return `${reset}${html}`;
}

function ErrorsPane({
  validation,
  onIssueClick,
  highlightedIndex,
}: {
  validation: ValidationReport | null;
  onIssueClick: (issue: ValidationIssue) => void;
  highlightedIndex?: number | null;
}) {
  const firstErrorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (highlightedIndex === 0) {
      firstErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [highlightedIndex, validation]);

  if (!validation) {
    return <p className="px-2 text-slate-500">Sprawdzanie szablonu podczas edycji…</p>;
  }
  if (validation.ok) {
    return <p className="px-2 text-emerald-700">Brak błędów — szablon gotowy do publikacji.</p>;
  }
  return (
    <ul className="space-y-2 px-1">
      {validation.issues.map((issue, idx) => {
        const t = translateValidationIssue(issue);
        const highlighted = highlightedIndex === idx;
        return (
          <li key={idx}>
            <button
              ref={idx === 0 ? firstErrorRef : undefined}
              type="button"
              className={`w-full rounded-lg border px-3 py-2 text-left ${
                highlighted
                  ? "border-rose-400 bg-rose-100 ring-2 ring-rose-300"
                  : "border-rose-100 bg-rose-50/50 hover:bg-rose-50"
              }`}
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
