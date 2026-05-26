import { Grid3x3, Magnet, ZoomIn, ZoomOut, Maximize2, Copy, Crosshair } from "lucide-react";

export type LabelDesignerCanvasToolbarProps = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  snapUiOn: boolean;
  onToggleSnapUi: () => void;
  onDuplicate: () => void;
  duplicateDisabled: boolean;
  onScrollToCanvas: () => void;
};

export function LabelDesignerCanvasToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onFitView,
  showGrid,
  onToggleGrid,
  snapUiOn,
  onToggleSnapUi,
  onDuplicate,
  duplicateDisabled,
  onScrollToCanvas,
}: LabelDesignerCanvasToolbarProps) {
  const pct = Math.round(zoom * 100);
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 bg-white/90 px-3 py-1.5 backdrop-blur-sm">
      <div className="flex items-center gap-0.5 min-w-0">
        <span className="text-[10px] font-medium text-slate-500 tabular-nums pr-2 shrink-0">{pct}%</span>
        <ToolbarIconBtn label="Pomniejsz" onClick={onZoomOut}>
          <ZoomOut className="h-3.5 w-3.5" strokeWidth={2} />
        </ToolbarIconBtn>
        <ToolbarIconBtn label="Powiększ" onClick={onZoomIn}>
          <ZoomIn className="h-3.5 w-3.5" strokeWidth={2} />
        </ToolbarIconBtn>
        <ToolbarIconBtn label="Dopasuj widok" onClick={onFitView}>
          <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} />
        </ToolbarIconBtn>
        <span className="mx-1 h-4 w-px bg-slate-200 shrink-0" aria-hidden />
        <ToolbarIconBtn label={showGrid ? "Ukryj siatkę" : "Pokaż siatkę"} onClick={onToggleGrid} pressed={showGrid}>
          <Grid3x3 className="h-3.5 w-3.5" strokeWidth={2} />
        </ToolbarIconBtn>
        <ToolbarIconBtn
          label="Przyciąganie do siatki"
          onClick={onToggleSnapUi}
          pressed={snapUiOn}
          titleHint="Wskazówka: przeciąganie nadal korzysta z siatki projektanta."
        >
          <Magnet className="h-3.5 w-3.5" strokeWidth={2} />
        </ToolbarIconBtn>
        <ToolbarIconBtn label="Skocz do płótna" onClick={onScrollToCanvas} titleHint="Przewija widok do obszaru etykiety.">
          <Crosshair className="h-3.5 w-3.5" strokeWidth={2} />
        </ToolbarIconBtn>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <ToolbarIconBtn label="Duplikuj zaznaczenie" onClick={onDuplicate} disabled={duplicateDisabled}>
          <Copy className="h-3.5 w-3.5" strokeWidth={2} />
        </ToolbarIconBtn>
      </div>
    </div>
  );
}

function ToolbarIconBtn({
  label,
  onClick,
  pressed,
  disabled,
  titleHint,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  titleHint?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={titleHint ? `${label} — ${titleHint}` : label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-slate-600 transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        pressed
          ? "border-cyan-300 bg-cyan-50 text-cyan-800 shadow-inner"
          : "border-transparent bg-transparent hover:border-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}
