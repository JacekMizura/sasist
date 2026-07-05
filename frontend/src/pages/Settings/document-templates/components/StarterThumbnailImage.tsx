import { useEffect, useState } from "react";

import { fetchStarterThumbnailBlob } from "@/api/documentTemplatesApi";
import { DEFAULT_TENANT_ID } from "../constants";

type Props = {
  starterId: number;
  alt: string;
  className?: string;
};

export function StarterThumbnailImage({ starterId, alt, className }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    fetchStarterThumbnailBlob(DEFAULT_TENANT_ID, starterId)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => setSrc(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [starterId]);

  if (!src) {
    return <div className={`animate-pulse bg-slate-200 ${className ?? ""}`} aria-hidden />;
  }

  return <img src={src} alt={alt} className={className} loading="lazy" />;
}
