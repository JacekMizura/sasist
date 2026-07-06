import { Link } from "react-router-dom";

import type { EditorContextDto } from "../../../../api/documentTemplatesApi";
import { DOC_TEMPLATE_STATUS_LABELS, LIST_BASE } from "../constants";
import { EditorOverflowMenu } from "./EditorOverflowMenu";
import { TemplateAssignmentsStrip } from "./TemplateAssignmentsStrip";
import type { EditorRightTab } from "../hooks/useEditorLayoutState";

type Props = {
  ctx: EditorContextDto;
  variant: string;
  saving: boolean;
  detailsOpen: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  fullscreen: boolean;
  onSave: () => void;
  onPublish: () => void;
  onValidate: () => void;
  onPreview: () => void;
  onToggleDetails: () => void;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onEnterFullscreen: () => void;
  onExitFullscreen: () => void;
  onOpenRightTab: (tab: EditorRightTab) => void;
  onOpenAssignmentsTab?: () => void;
};

export function EditorTopBar({
  ctx,
  variant,
  saving,
  detailsOpen,
  leftOpen,
  rightOpen,
  fullscreen,
  onSave,
  onPublish,
  onValidate,
  onPreview,
  onToggleDetails,
  onToggleLeft,
  onToggleRight,
  onEnterFullscreen,
  onExitFullscreen,
  onOpenRightTab,
  onOpenAssignmentsTab,
}: Props) {
  const detail = ctx.detail;
  const status = detail.draft_version?.status ?? detail.published_version?.status ?? "draft";
  const statusLabel = DOC_TEMPLATE_STATUS_LABELS[status] ?? status;

  return (
    <header className="shrink-0 border-b border-slate-200 bg-[#f9f9f9]">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2">
        <Link to={LIST_BASE} className="text-xs text-slate-500 hover:text-slate-800">
          ← Szablony
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-mono text-base font-semibold text-slate-900">{detail.name}</h1>
            <StatusBadge status={status} label={statusLabel} />
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[11px] text-slate-500">
            <span>{detail.kind?.name_pl ?? detail.template_role ?? "—"}</span>
            <span>·</span>
            <span>{variant}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="rounded px-2.5 py-1 text-xs text-slate-700 hover:bg-white" onClick={onPreview}>
            Podgląd
          </button>
          <button type="button" className="rounded px-2.5 py-1 text-xs text-slate-700 hover:bg-white" onClick={onValidate}>
            Waliduj
          </button>
          <button
            type="button"
            disabled={saving}
            className="rounded px-2.5 py-1 text-xs text-slate-700 hover:bg-white disabled:opacity-50"
            onClick={onSave}
            title="Ctrl+S"
          >
            Zapisz
          </button>
          <button
            type="button"
            className="rounded bg-[#0e639c] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#1177bb]"
            onClick={onPublish}
          >
            Publikuj
          </button>
          <EditorOverflowMenu
            leftOpen={leftOpen}
            rightOpen={rightOpen}
            fullscreen={fullscreen}
            detailsOpen={detailsOpen}
            onToggleLeft={onToggleLeft}
            onToggleRight={onToggleRight}
            onEnterFullscreen={onEnterFullscreen}
            onExitFullscreen={onExitFullscreen}
            onToggleDetails={onToggleDetails}
            onOpenRightTab={onOpenRightTab}
          />
        </div>
      </div>
      <TemplateAssignmentsStrip ctx={ctx} onOpenAssignmentsTab={onOpenAssignmentsTab} />
    </header>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone =
    status === "published"
      ? "bg-emerald-100 text-emerald-800"
      : status === "archived"
        ? "bg-slate-100 text-slate-600"
        : "bg-amber-100 text-amber-900";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{label}</span>;
}
