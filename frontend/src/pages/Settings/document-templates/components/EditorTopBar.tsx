import type { EditorContextDto } from "../../../../api/documentTemplatesApi";
import { EditableTemplateName } from "./EditableTemplateName";
import { EditorOverflowMenu } from "./EditorOverflowMenu";
import { TemplateAssignmentsStrip } from "./TemplateAssignmentsStrip";
import type { EditorRightTab } from "../hooks/useEditorLayoutState";

type Props = {
  ctx: EditorContextDto;
  displayName: string;
  variant: string;
  saving: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onPublish: () => void;
  onAssignmentsChange: () => void;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onToggleDetails: () => void;
  detailsOpen: boolean;
  onOpenRightTab: (tab: EditorRightTab) => void;
  onOpenUsageTab: () => void;
};

export function EditorTopBar({
  ctx,
  displayName,
  variant,
  saving,
  leftOpen,
  rightOpen,
  onNameChange,
  onSave,
  onPublish,
  onAssignmentsChange,
  onToggleLeft,
  onToggleRight,
  onToggleDetails,
  detailsOpen,
  onOpenRightTab,
  onOpenUsageTab,
}: Props) {
  const detail = ctx.detail;
  const status = detail.draft_version?.status ?? detail.published_version?.status ?? "draft";

  return (
    <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <EditableTemplateName
              templateId={detail.id}
              serverName={displayName}
              onNameChange={onNameChange}
            />
            <StatusBadge status={status} />
          </div>
          <div className="flex flex-wrap gap-x-4 text-xs text-slate-600">
            <span>
              <span className="text-slate-400">Typ:</span> {detail.kind?.name_pl ?? "—"}
            </span>
            <span>
              <span className="text-slate-400">Wariant:</span> {variant}
            </span>
          </div>
          <TemplateAssignmentsStrip ctx={ctx} onAssignmentsChange={onAssignmentsChange} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={saving}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            onClick={onSave}
            title="Ctrl+S"
          >
            Zapisz
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            onClick={onPublish}
          >
            Opublikuj
          </button>
          <EditorOverflowMenu
            leftOpen={leftOpen}
            rightOpen={rightOpen}
            detailsOpen={detailsOpen}
            onToggleLeft={onToggleLeft}
            onToggleRight={onToggleRight}
            onToggleDetails={onToggleDetails}
            onOpenRightTab={onOpenRightTab}
            onOpenUsageTab={onOpenUsageTab}
          />
        </div>
      </div>
    </header>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isPublished = status === "published";
  const isArchived = status === "archived";
  const text = isPublished ? "Opublikowana" : isArchived ? "Archiwum" : "Wersja robocza";
  const tone = isPublished
    ? "text-emerald-700"
    : isArchived
      ? "text-slate-500"
      : "text-amber-800";
  const dot = isPublished ? "bg-emerald-500" : isArchived ? "bg-slate-400" : "bg-amber-500";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tone}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {text}
    </span>
  );
}
