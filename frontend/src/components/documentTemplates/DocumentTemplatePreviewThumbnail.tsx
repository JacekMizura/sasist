import { useEffect, useState } from "react";
import { FileText } from "lucide-react";

import { fetchTemplateVersionThumbnailBlob } from "@/api/documentTemplatesApi";

type Props = {
  tenantId: number;
  versionId: number;
  alt: string;
  className?: string;
};

export function DocumentTemplatePreviewThumbnail({ tenantId, versionId, alt, className }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    fetchTemplateVersionThumbnailBlob(tenantId, versionId)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => setSrc(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tenantId, versionId]);

  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 text-slate-400 ${className ?? ""}`}
        aria-hidden
      >
        <FileText className="h-8 w-8 opacity-40" strokeWidth={1.5} />
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} loading="lazy" />;
}
