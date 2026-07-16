import { TemplatePreview } from "../../../components/labels/TemplatePreview";
import { formatLabelSizeMm } from "../../../utils/formatMm";
import {
  getModalPreviewSize,
  parseTemplateJson,
  type TemplateWithMeta,
} from "./templatesListTypes";

type Props = {
  template: TemplateWithMeta;
  onClose: () => void;
};

export default function TemplatePreviewModal({ template, onClose }: Props) {
  const size = getModalPreviewSize(template.widthMm, template.heightMm);

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/35 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{template.name}</h3>
            <p className="text-xs text-slate-500">{formatLabelSizeMm(template.widthMm, template.heightMm)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Zamknij
          </button>
        </div>
        <div className="flex items-center justify-center bg-white p-4">
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-sm">
            <TemplatePreview
              templateId={template.id}
              template={parseTemplateJson(template.template_json)}
              containerWidthPx={size.width}
              containerHeightPx={size.height}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
