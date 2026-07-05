import { Link } from "react-router-dom";

import type { EditorContextDto } from "../../../../api/documentTemplatesApi";
import { DOC_TEMPLATE_STATUS_LABELS, LIST_BASE } from "../constants";

type Props = {
  ctx: EditorContextDto;
  extendsVersionId: number | null;
  baseLabel: string | null;
  saving: boolean;
  onSave: () => void;
  onPublish: () => void;
  onValidate: () => void;
  onPreview: () => void;
};

export function EditorTopBar({
  ctx,
  extendsVersionId,
  baseLabel,
  saving,
  onSave,
  onPublish,
  onValidate,
  onPreview,
}: Props) {
  const detail = ctx.detail;
  const status = detail.draft_version?.status ?? detail.published_version?.status ?? "—";
  const variant = ctx.bindings[0]?.variant_code ?? "standard";

  return (
    <div className="border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={LIST_BASE} className="text-sm text-slate-500 hover:text-slate-800">
          ← Lista
        </Link>
        <div className="mr-auto min-w-0">
          <h1 className="truncate text-lg font-semibold text-slate-900">{detail.name}</h1>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>Status: {DOC_TEMPLATE_STATUS_LABELS[status] ?? status}</span>
            <span>Rodzina: {detail.kind ? "—" : "—"}</span>
            <span>Typ: {detail.kind?.name_pl ?? detail.template_role ?? "—"}</span>
            <span>Wariant: {variant}</span>
            <span>Szablon bazowy: {baseLabel ?? (extendsVersionId ? "wybrany" : "—")}</span>
          </div>
        </div>
        <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" onClick={onPreview}>
          Podgląd
        </button>
        <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" onClick={onValidate}>
          Waliduj
        </button>
        <button
          type="button"
          disabled={saving}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50"
          onClick={onSave}
        >
          Zapisz wersję roboczą
        </button>
        <button type="button" className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white" onClick={onPublish}>
          Opublikuj
        </button>
      </div>
    </div>
  );
}
