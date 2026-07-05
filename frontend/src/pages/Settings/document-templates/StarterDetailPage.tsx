import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import {
  createDocumentTemplateFromStarter,
  fetchStarterGalleryDetail,
  previewStarterDocumentPdf,
  type StarterGalleryDetailDto,
} from "@/api/documentTemplatesApi";
import { extractApiErrorMessage } from "@/api/apiErrorMessage";
import { DEFAULT_TENANT_ID, LIST_BASE } from "./constants";
import { StarterThumbnailImage } from "./components/StarterThumbnailImage";

export function StarterDetailPage() {
  const { starterId } = useParams<{ starterId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<StarterGalleryDetailDto | null>(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!starterId) return;
    fetchStarterGalleryDetail(DEFAULT_TENANT_ID, Number(starterId))
      .then(setDetail)
      .catch((err) => toast.error(extractApiErrorMessage(err, "Nie udało się wczytać startera.")))
      .finally(() => setLoading(false));
  }, [starterId]);

  useEffect(() => () => {
    if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
  }, [previewPdfUrl]);

  async function createTemplate() {
    if (!detail) return;
    try {
      const created = await createDocumentTemplateFromStarter(DEFAULT_TENANT_ID, {
        kind_code: detail.kind_code,
        name: detail.name_pl,
        starter_code: detail.code,
      });
      toast.success("Utworzono szablon.");
      navigate(`${LIST_BASE}/${created.id}`);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Nie udało się utworzyć szablonu."));
    }
  }

  async function handlePdfPreview() {
    if (!detail?.twig_content || !detail.kind_code) return;
    try {
      const blob = await previewStarterDocumentPdf(DEFAULT_TENANT_ID, {
        kind_code: detail.kind_code,
        twig_content: detail.twig_content,
      });
      const url = URL.createObjectURL(blob);
      setPreviewPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Podgląd PDF niedostępny."));
    }
  }

  const variables = useMemo(() => {
    const labels: string[] = [];
    const walk = (nodes: unknown[]) => {
      for (const n of nodes) {
        const node = n as { label?: string; path?: string; children?: unknown[] };
        if (node.path) labels.push(node.path);
        else if (node.label && !node.children?.length) labels.push(node.label);
        if (node.children?.length) walk(node.children);
      }
    };
    walk(detail?.variables ?? []);
    return labels.slice(0, 24);
  }, [detail]);

  if (loading) return <p className="p-6 text-slate-500">Wczytywanie startera…</p>;
  if (!detail) return <p className="p-6 text-slate-500">Starter nie istnieje.</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-6">
      <Link to={`${LIST_BASE}/starters`} className="text-sm text-slate-600 hover:text-slate-900">
        ← Galeria starterów
      </Link>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="aspect-[210/297] bg-slate-50">
            <StarterThumbnailImage starterId={detail.id} alt={detail.name_pl} className="h-full w-full object-cover object-top" />
          </div>
          {detail.preview_html ? (
            <iframe title="Podgląd HTML" className="hidden" srcDoc={detail.preview_html} />
          ) : null}
        </div>
        <div className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">{detail.family_name}</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">{detail.name_pl}</h1>
            <p className="mt-3 text-sm text-slate-600">{detail.description}</p>
          </div>
          <dl className="grid gap-3 text-sm text-slate-700">
            <div><dt className="font-medium text-slate-900">Typ dokumentu</dt><dd>{detail.kind_name}</dd></div>
            <div><dt className="font-medium text-slate-900">Rodzina</dt><dd>{detail.family_name}</dd></div>
            <div><dt className="font-medium text-slate-900">Autor</dt><dd>{detail.author_label}</dd></div>
            {detail.base_template ? (
              <div>
                <dt className="font-medium text-slate-900">Szablon bazowy</dt>
                <dd>{detail.base_template.template_name} v{detail.base_template.version_number}</dd>
              </div>
            ) : null}
          </dl>
          {detail.partials_used?.length ? (
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Partiale</h2>
              <ul className="mt-2 list-inside list-disc text-sm text-slate-600">
                {detail.partials_used.map((p) => (
                  <li key={p.partial_code}>{p.partial_code}: {p.template_name}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {variables.length ? (
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Zmienne</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {variables.map((v) => (
                  <span key={v} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{v}</span>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3 pt-2">
            <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm" onClick={() => void handlePdfPreview()}>
              Podgląd PDF
            </button>
            <button type="button" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white" onClick={() => void createTemplate()}>
              Utwórz szablon
            </button>
          </div>
          {previewPdfUrl ? (
            <iframe title="Podgląd PDF" className="h-[480px] w-full rounded-lg border border-slate-200" src={previewPdfUrl} />
          ) : detail.preview_html ? (
            <iframe title="Podgląd" className="h-[480px] w-full rounded-lg border border-slate-200 bg-white" srcDoc={detail.preview_html} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
