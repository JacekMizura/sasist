import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Link } from "react-router-dom";

import {
  fetchTemplateUsage,
  fetchVersionContent,
  type DependencyGraphDto,
  type DocumentTemplateVersionDto,
  type EditorImpactDto,
  type TemplateAssignmentItem,
  type TemplateUsageBadge,
  type UsageSearchHit,
  type ValidationIssue,
  type ValidationReport,
} from "../../../../api/documentTemplatesApi";
import { DEFAULT_TENANT_ID, LIST_BASE } from "../constants";
import type { EditorRightTab } from "../hooks/useEditorLayoutState";
import { VersionComparePanel } from "./VersionComparePanel";
import { VersionReplacePanel } from "./VersionReplacePanel";

export type InspectorPanelBodyProps = {
  activeTab: EditorRightTab;
  previewHtml: string | null;
  previewPdf: Blob | null;
  previewLoading: boolean;
  previewError: string | null;
  previewRevision: number;
  contextMode: "sample" | "live";
  onContextModeChange: (mode: "sample" | "live") => void;
  validation: ValidationReport | null;
  liveValidation: ValidationReport | null;
  onIssueClick: (issue: ValidationIssue) => void;
  impact: EditorImpactDto | null;
  dependencies: DependencyGraphDto | null;
  versionsHistory: DocumentTemplateVersionDto[];
  kindCode?: string | null;
  templateId: number;
  templateName: string;
  usageHits: UsageSearchHit[];
  usageQuery: string;
  onRefreshPreview: () => void;
  onPreviewVersion?: (content: string) => void;
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
    contextMode,
    onContextModeChange,
    validation,
    liveValidation,
    onIssueClick,
    impact,
    dependencies,
    versionsHistory,
    kindCode,
    templateId,
    templateName,
    usageHits,
    usageQuery,
    onRefreshPreview,
    onPreviewVersion,
    scrollRef,
  } = props;

  const pdfUrl = useMemoPdfUrl(previewPdf);

  return (
    <>
      {(activeTab === "html" || activeTab === "pdf") && (
        <div className="mb-2 flex items-center gap-2">
          <ContextToggle mode={contextMode} onChange={onContextModeChange} />
          <button type="button" className="rounded border border-slate-200 px-2 py-0.5 text-[11px]" onClick={onRefreshPreview}>
            Odśwież
          </button>
        </div>
      )}
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
        <ErrorsPane validation={liveValidation ?? validation} onIssueClick={onIssueClick} live={!!liveValidation} />
      )}
      {activeTab === "compare" && <VersionComparePanel versions={versionsHistory} />}
      {activeTab === "usage" && (
        <TemplateUsagePane templateId={templateId} templateName={templateName} symbolQuery={usageQuery} symbolHits={usageHits} />
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

function ContextToggle({ mode, onChange }: { mode: "sample" | "live"; onChange: (m: "sample" | "live") => void }) {
  return (
    <div className="flex rounded-lg border border-slate-200 p-0.5 text-[11px]">
      <button
        type="button"
        className={`rounded px-2 py-0.5 ${mode === "sample" ? "bg-slate-900 text-white" : "text-slate-600"}`}
        onClick={() => onChange("sample")}
      >
        Przykład
      </button>
      <button
        type="button"
        className={`rounded px-2 py-0.5 ${mode === "live" ? "bg-slate-900 text-white" : "text-slate-600"}`}
        onClick={() => onChange("live")}
      >
        Na żywo
      </button>
    </div>
  );
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
        className="h-[min(720px,70vh)] w-full border border-slate-200 bg-white"
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
        className="h-[min(720px,70vh)] w-full border border-slate-200 bg-white"
        src={pdfUrl}
      />
    );
  }
  return <p className="text-slate-500">Brak podglądu — użyj Podgląd, Waliduj lub Zapisz (Ctrl+S).</p>;
}

function ErrorsPane({
  validation,
  onIssueClick,
  live,
}: {
  validation: ValidationReport | null;
  onIssueClick: (issue: ValidationIssue) => void;
  live: boolean;
}) {
  if (!validation) return <p className="text-slate-500">Walidacja na bieżąco podczas edycji…</p>;
  if (validation.ok) {
    return <p className="text-emerald-700">{live ? "Brak błędów (walidacja na żywo)." : "Walidacja przed publikacją — OK."}</p>;
  }
  return (
    <ul className="space-y-2">
      {validation.issues.map((issue, idx) => (
        <li key={idx}>
          <button
            type="button"
            className="w-full rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2 text-left hover:bg-rose-50"
            onClick={() => onIssueClick(issue)}
          >
            <div className="text-xs font-medium text-rose-800">
              {issue.line ? `Linia ${issue.line}` : "Błąd"}
              {issue.code ? ` · ${issue.code}` : ""}
            </div>
            <div className="mt-0.5 text-sm text-rose-900">{issue.message}</div>
            {issue.suggestion ? <div className="mt-1 text-xs text-slate-600">{issue.suggestion}</div> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function TemplateUsagePane({
  templateId,
  templateName,
  symbolQuery,
  symbolHits,
}: {
  templateId: number;
  templateName: string;
  symbolQuery: string;
  symbolHits: UsageSearchHit[];
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [badges, setBadges] = useState<TemplateUsageBadge[]>([]);
  const [items, setItems] = useState<TemplateAssignmentItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchTemplateUsage(DEFAULT_TENANT_ID, templateId)
      .then((data) => {
        if (cancelled) return;
        setBadges(data.badges);
        setItems(data.items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Nie udało się wczytać użyć szablonu.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  return (
    <div className="space-y-5">
      {symbolQuery ? <SymbolUsageSection query={symbolQuery} hits={symbolHits} /> : null}
      <section>
        <h3 className="text-xs font-semibold text-slate-800">Przypisania: {templateName}</h3>
        {loading ? <p className="mt-2 text-slate-500">Ładowanie…</p> : null}
        {error ? <p className="mt-2 text-rose-700">{error}</p> : null}
        {!loading && !error ? (
          <>
            {badges.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {badges.map((b) => (
                  <span key={b.label} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {b.label} ({b.count})
                  </span>
                ))}
              </div>
            ) : null}
            <ul className="mt-3 divide-y divide-slate-100">
              {items.length === 0 ? (
                <li className="py-4 text-slate-500">Brak przypisań tego szablonu w ERP.</li>
              ) : (
                items.map((item, idx) => (
                  <li key={`${item.scope_type}-${item.scope_id}-${idx}`} className="flex items-center justify-between gap-3 py-3 text-xs">
                    <div>
                      <div className="font-medium text-slate-900">{item.scope_label}</div>
                      <div className="text-slate-500">
                        {item.scope_type_label}
                        {item.kind_name ? ` · ${item.kind_name}` : ""}
                      </div>
                    </div>
                    {item.erp_link ? (
                      <Link to={item.erp_link} className="shrink-0 font-medium text-blue-700 hover:underline">
                        Otwórz
                      </Link>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}

function SymbolUsageSection({ query, hits }: { query: string; hits: UsageSearchHit[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h3 className="text-xs font-semibold text-slate-800">Wystąpienia symbolu „{query}”</h3>
      {!hits.length ? (
        <p className="mt-2 text-slate-500">Brak użyć w innych szablonach.</p>
      ) : (
        <ul className="mt-2 space-y-2 text-xs">
          {hits.map((hit, idx) => (
            <li key={idx} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <Link to={`${LIST_BASE}/${hit.template_id}`} className="font-medium text-blue-800 hover:underline">
                {hit.template_name}
              </Link>
              <div className="text-slate-500">
                wersja {hit.version_number} · {hit.status}
                {hit.kind_code ? ` · ${hit.kind_code}` : ""}
              </div>
              <div className="mt-1 text-slate-600">Linie: {hit.lines.join(", ")}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
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
