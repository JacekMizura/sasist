import type { LabelTemplate } from "../../../types/labelSystem";

type Props = {
  template: LabelTemplate;
  onTemplateChange: (t: LabelTemplate) => void;
};

export function DocumentTemplateHtmlPanel({ template, onTemplateChange }: Props) {
  const html = template.htmlContent ?? "";
  const css = template.cssContent ?? "";

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        Szablon dokumentu (HTML / CSS)
      </p>
      <p className="mb-3 text-xs text-slate-500">
        Użyj zmiennych Jinja, np. {"{{ document.number }}"}, {"{{ totals.gross }}"}, {"{{ items }}"}.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          HTML
          <textarea
            className="min-h-[140px] rounded-lg border border-slate-200 font-mono text-xs text-slate-800"
            value={html}
            onChange={(e) =>
              onTemplateChange({
                ...template,
                htmlContent: e.target.value,
                updatedAt: new Date().toISOString(),
              })
            }
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          CSS
          <textarea
            className="min-h-[140px] rounded-lg border border-slate-200 font-mono text-xs text-slate-800"
            value={css}
            onChange={(e) =>
              onTemplateChange({
                ...template,
                cssContent: e.target.value,
                updatedAt: new Date().toISOString(),
              })
            }
            spellCheck={false}
          />
        </label>
      </div>
    </div>
  );
}
