import type { EditorRightTab } from "../hooks/useEditorLayoutState";

type Props = {
  leftOpen: boolean;
  rightOpen: boolean;
  fullscreen: boolean;
  detailsOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onEnterFullscreen: () => void;
  onExitFullscreen: () => void;
  onToggleDetails: () => void;
  onOpenRightTab: (tab: EditorRightTab) => void;
};

export function EditorOverflowMenu({
  leftOpen,
  rightOpen,
  fullscreen,
  detailsOpen,
  onToggleLeft,
  onToggleRight,
  onEnterFullscreen,
  onExitFullscreen,
  onToggleDetails,
  onOpenRightTab,
}: Props) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        Więcej ▾
      </summary>
      <div className="absolute right-0 z-20 mt-1 min-w-[220px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
        <MenuItem onClick={onToggleDetails}>{detailsOpen ? "Ukryj szczegóły" : "Szczegóły szablonu"}</MenuItem>
        <MenuItem onClick={onToggleLeft}>{leftOpen ? "Ukryj panel zmiennych" : "Pokaż panel zmiennych"}</MenuItem>
        <MenuItem onClick={onToggleRight}>{rightOpen ? "Ukryj inspektor" : "Pokaż inspektor"}</MenuItem>
        <hr className="my-1 border-slate-100" />
        <MenuItem onClick={() => onOpenRightTab("compare")}>Porównaj wersje</MenuItem>
        <MenuItem onClick={() => onOpenRightTab("impact")}>Wpływ zmian</MenuItem>
        <MenuItem onClick={() => onOpenRightTab("dependencies")}>Zależności</MenuItem>
        <MenuItem onClick={() => onOpenRightTab("history")}>Historia</MenuItem>
        <hr className="my-1 border-slate-100" />
        {fullscreen ? (
          <MenuItem onClick={onExitFullscreen}>Wyjdź z pełnego ekranu</MenuItem>
        ) : (
          <MenuItem onClick={onEnterFullscreen}>Pełny ekran edytora</MenuItem>
        )}
      </div>
    </details>
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
