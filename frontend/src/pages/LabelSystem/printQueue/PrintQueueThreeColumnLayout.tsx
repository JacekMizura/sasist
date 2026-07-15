import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  leftOpen: boolean;
  onToggleLeft: () => void;
  rightDrawerOpen: boolean;
  onCloseRightDrawer: () => void;
  onOpenRightDrawer: () => void;
};

/**
 * Responsive 3-column print-queue shell.
 * ≥1600: 320 | auto | 320 · 1200–1600: 300 | auto | 300 · &lt;1200: collapsible left + right drawer.
 */
export default function PrintQueueThreeColumnLayout({
  left,
  center,
  right,
  leftOpen,
  onToggleLeft,
  rightDrawerOpen,
  onCloseRightDrawer,
  onOpenRightDrawer,
}: Props) {
  return (
    <div className="relative">
      <div className="mb-3 flex items-center gap-2 xl:hidden">
        <button
          type="button"
          onClick={onToggleLeft}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:shadow-md"
        >
          {leftOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          {leftOpen ? "Ukryj konfigurację" : "Konfiguracja"}
        </button>
        <button
          type="button"
          onClick={onOpenRightDrawer}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:shadow-md xl:hidden"
        >
          Podsumowanie
        </button>
      </div>

      <div
        className={[
          "grid gap-5 items-start",
          "grid-cols-1",
          "xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,300px)]",
          "min-[1600px]:grid-cols-[320px_minmax(0,1fr)_320px]",
        ].join(" ")}
      >
        <div
          className={[
            "min-w-0 space-y-3",
            leftOpen ? "block" : "hidden",
            "xl:block",
          ].join(" ")}
        >
          {left}
        </div>

        <div className="min-w-0">{center}</div>

        <div className="hidden min-w-0 xl:block">
          <div className="sticky top-6 space-y-3">{right}</div>
        </div>
      </div>

      {rightDrawerOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/30"
            aria-label="Zamknij podsumowanie"
            onClick={onCloseRightDrawer}
          />
          <aside className="absolute inset-y-0 right-0 flex w-[min(100%,360px)] flex-col border-l border-gray-200 bg-white p-5 shadow-md">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Podsumowanie</h2>
              <button
                type="button"
                onClick={onCloseRightDrawer}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-slate-600 hover:bg-white hover:shadow-sm"
                aria-label="Zamknij"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">{right}</div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
