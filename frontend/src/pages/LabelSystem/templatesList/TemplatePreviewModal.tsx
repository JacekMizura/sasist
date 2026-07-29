import { TemplatePreview } from "../../../components/labels/TemplatePreview";
import { TemplatePreviewShellModal } from "../../../components/templates/TemplatePreviewShellModal";
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
    <TemplatePreviewShellModal
      title={template.name}
      subtitle={formatLabelSizeMm(template.widthMm, template.heightMm)}
      onClose={onClose}
    >
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-sm">
        <TemplatePreview
          templateId={template.id}
          template={parseTemplateJson(template.template_json)}
          containerWidthPx={size.width}
          containerHeightPx={size.height}
        />
      </div>
    </TemplatePreviewShellModal>
  );
}
