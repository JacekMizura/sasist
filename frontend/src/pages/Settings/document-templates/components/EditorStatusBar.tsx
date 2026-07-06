type Props = {
  language: string;
  encoding: string;
  line: number;
  column: number;
  statusLabel: string;
  autoSaveLabel: string;
  minimapOn: boolean;
  onToggleMinimap: () => void;
};

export function EditorStatusBar({
  language,
  encoding,
  line,
  column,
  statusLabel,
  autoSaveLabel,
  minimapOn,
  onToggleMinimap,
}: Props) {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-slate-200 bg-[#007acc] px-3 font-mono text-[11px] text-white">
      <span>{language}</span>
      <span>{encoding}</span>
      <span>
        Ln {line} Col {column}
      </span>
      <span className="ml-auto">{statusLabel}</span>
      <span>{autoSaveLabel}</span>
      <button
        type="button"
        className={`rounded px-1.5 py-0.5 hover:bg-white/15 ${minimapOn ? "bg-white/20" : ""}`}
        onClick={onToggleMinimap}
        title="Minimapa"
      >
        Minimap
      </button>
    </footer>
  );
}
