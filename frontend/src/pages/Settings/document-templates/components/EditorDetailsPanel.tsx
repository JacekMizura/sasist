import type { EditorContextDto } from "../../../../api/documentTemplatesApi";
import { DOC_TEMPLATE_ROLE_LABELS, DOC_TEMPLATE_SOURCE_LABELS } from "../constants";

type Props = {
  ctx: EditorContextDto;
  baseLabel: string | null;
  variant: string;
  open: boolean;
  onClose: () => void;
};

export function EditorDetailsPanel({ ctx, baseLabel, variant, open, onClose }: Props) {
  if (!open) return null;

  const detail = ctx.detail;

  return (
    <div className="border-t border-slate-200 bg-slate-50/90 px-4 py-3 text-xs text-slate-700">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-slate-900">Szczegóły szablonu</span>
        <button type="button" className="text-slate-500 hover:text-slate-800" onClick={onClose}>
          Zamknij
        </button>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <DetailRow label="Provider" value={detail.kind?.provider_key ?? "—"} mono />
        <DetailRow label="Schema" value={detail.kind?.schema_key ?? "—"} mono />
        <DetailRow label="Rola" value={DOC_TEMPLATE_ROLE_LABELS[detail.template_role] ?? detail.template_role} />
        <DetailRow label="Źródło" value={DOC_TEMPLATE_SOURCE_LABELS[detail.source] ?? detail.source} />
        <DetailRow label="Kod" value={detail.template_code ?? "—"} mono />
        <DetailRow label="Szablon bazowy" value={baseLabel ?? "—"} />
        <DetailRow label="Wariant" value={variant} />
        <DetailRow
          label="Opublikowana wersja"
          value={
            detail.published_version
              ? `v${detail.published_version.version_number}`
              : "—"
          }
        />
        <DetailRow
          label="Wersja robocza"
          value={detail.draft_version ? `v${detail.draft_version.version_number}` : "—"}
        />
      </dl>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className={mono ? "font-mono text-slate-800" : "text-slate-800"}>{value}</dd>
    </div>
  );
}
