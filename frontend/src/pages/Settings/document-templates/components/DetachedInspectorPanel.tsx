import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { EditorRightTab } from "../hooks/useEditorLayoutState";
import { InspectorPanelBody, type InspectorPanelBodyProps } from "./InspectorPanelBody";

type Props = InspectorPanelBodyProps & {
  onDock: () => void;
  issueCount: number;
};

const FLOAT_TABS: EditorRightTab[] = ["html", "pdf", "errors", "usage"];

const TAB_LABELS: Partial<Record<EditorRightTab, string>> = {
  html: "HTML",
  pdf: "PDF",
  errors: "Walidacja",
  usage: "Użycia",
};

export function DetachedInspectorPanel({ onDock, issueCount, activeTab, onTabChange, ...bodyProps }: Props & { onTabChange: (t: EditorRightTab) => void }) {
  const [pos, setPos] = useState(() => ({
    x: Math.max(24, window.innerWidth - 460),
    y: 72,
  }));
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
        y: Math.max(48, dragRef.current.origY + (e.clientY - dragRef.current.startY)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return createPortal(
    <div
      className="fixed z-50 flex w-[min(420px,42vw)] flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl"
      style={{ left: pos.x, top: pos.y, height: "min(82vh, 900px)" }}
    >
      <div
        className="flex cursor-move items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2"
        onMouseDown={(e) => {
          dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
        }}
      >
        <span className="text-xs font-medium text-slate-700">Inspektor</span>
        <div className="ml-1 flex gap-1">
          {FLOAT_TABS.map((t) => (
            <button
              key={t}
              type="button"
              className={`rounded px-2 py-0.5 text-[10px] ${
                activeTab === t ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"
              }`}
              onClick={() => onTabChange(t)}
            >
              {TAB_LABELS[t]}
              {t === "errors" && issueCount ? ` (${issueCount})` : ""}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ml-auto rounded px-2 py-1 text-[11px] text-slate-600 hover:bg-white"
          title="Przypnij do panelu bocznego"
          onClick={onDock}
        >
          📌 Przypnij
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 text-sm">
        <InspectorPanelBody activeTab={activeTab} {...bodyProps} />
      </div>
    </div>,
    document.body,
  );
}
