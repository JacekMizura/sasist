import { useState } from "react";
import type { LabelTemplate } from "../../types/labelSystem";
import { LabelTemplateDesigner } from "./LabelTemplateDesigner";
import { LabelPrintQueue } from "./LabelPrintQueue";

const DEFAULT_TEMPLATE: LabelTemplate = {
  id: "default",
  name: "Nowy szablon",
  widthMm: 50,
  heightMm: 30,
  dpi: 300,
  elements: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export default function LabelSystem() {
  const [activeTab, setActiveTab] = useState<"designer" | "queue">("designer");
  const [template, setTemplate] = useState<LabelTemplate>(() => {
    try {
      const raw = localStorage.getItem("label-system-current-template");
      if (raw) {
        const t = JSON.parse(raw) as LabelTemplate;
        if (t?.elements && Array.isArray(t.elements)) return t;
      }
    } catch {}
    return DEFAULT_TEMPLATE;
  });

  const persistTemplate = (next: LabelTemplate) => {
    setTemplate(next);
    try {
      localStorage.setItem("label-system-current-template", JSON.stringify(next));
    } catch {}
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#1E293B]">
      <header className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 bg-white border-b border-[#E2E8F0]">
        <h1 className="text-lg font-black uppercase tracking-widest text-[#1E293B]">
          System Etykiet
        </h1>
        <nav className="flex rounded-lg bg-slate-100 p-0.5 border border-[#E2E8F0]" aria-label="Moduły">
          <button
            type="button"
            onClick={() => setActiveTab("designer")}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
              activeTab === "designer" ? "bg-cyan-600 text-white" : "text-slate-600 hover:bg-slate-200"
            }`}
          >
            Projektant szablonów
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("queue")}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
              activeTab === "queue" ? "bg-cyan-600 text-white" : "text-slate-600 hover:bg-slate-200"
            }`}
          >
            Kolejka druku
          </button>
        </nav>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "designer" && (
          <LabelTemplateDesigner
            template={template}
            onTemplateChange={persistTemplate}
          />
        )}
        {activeTab === "queue" && (
          <LabelPrintQueue template={template} onTemplateChange={persistTemplate} />
        )}
      </main>
    </div>
  );
}
