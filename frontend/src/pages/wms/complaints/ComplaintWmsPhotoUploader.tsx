import axios from "axios";
import { Trash2, Upload } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";

import { wmsPhotoUploadClient } from "../../../api/wmsPhotoUploadClient";
import { getPublicBaseUrl } from "../../../config/publicUrl";
import { resolveDamageMediaUrl } from "../../../utils/resolveDamageMediaUrl";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import {
  extractSessionPhotoUrls,
  isProbablyImageFile,
  type LocalPreview,
  normalizePhotoRef,
} from "./complaintWmsPhotoUtils";

export type PhoneUploadSessionState = {
  lineId: number;
  sessionId: string;
  qrDataUrl: string;
  seenUrls: string[];
};

type Props = {
  lineId: number;
  photoRefs: string[];
  localPreviews: LocalPreview[];
  uploading: boolean;
  uploadMessage: string | null;
  disabled?: boolean;
  onUploadFiles: (files: FileList | File[]) => void | Promise<void>;
  onDeletePhoto: (photoRef: string) => void | Promise<void>;
  onPhonePhotos: (lineId: number, freshRefs: string[]) => void;
  phoneSession: PhoneUploadSessionState | null;
  onPhoneSessionChange: (session: PhoneUploadSessionState | null) => void;
};

const MAX_PHOTOS = 50;

export function ComplaintWmsPhotoUploader({
  lineId,
  photoRefs,
  localPreviews,
  uploading,
  uploadMessage,
  disabled = false,
  onUploadFiles,
  onDeletePhoto,
  onPhonePhotos,
  phoneSession,
  onPhoneSessionChange,
}: Props) {
  const diskInputRef = useRef<HTMLInputElement | null>(null);
  const collectorInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const atLimit = photoRefs.length >= MAX_PHOTOS;
  const busy = uploading || disabled;

  const stopCamera = useCallback(() => {
    setCameraOpen(false);
    setCameraError(null);
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    stopCamera();
    onPhoneSessionChange(null);
  }, [lineId, onPhoneSessionChange, stopCamera]);

  const ingestFiles = useCallback(
    (raw: FileList | File[] | null | undefined) => {
      if (!raw?.length || busy || atLimit) return;
      const list = Array.from(raw).filter((f) => f.size > 0 && isProbablyImageFile(f));
      if (list.length === 0) return;
      void onUploadFiles(list);
    },
    [atLimit, busy, onUploadFiles],
  );

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Kamera niedostępna w tej przeglądarce.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraOpen(true);
      window.requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch {
      setCameraError("Nie udało się uruchomić kamery.");
    }
  }, []);

  const captureFromCamera = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError("Brak obrazu z kamery.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setCameraError("Nie udało się zapisać kadru.");
      return;
    }
    const file = new File([blob], `cmp-${lineId}-${Date.now()}.jpg`, { type: "image/jpeg" });
    ingestFiles([file]);
  }, [ingestFiles, lineId]);

  const openPhoneUploadSession = useCallback(async () => {
    try {
      const createRes = await wmsPhotoUploadClient.post(
        "/wms/photo-upload/session",
        {},
        { params: { tenant_id: DAMAGE_TENANT_ID } },
      );
      const sessionIdRaw = (createRes.data?.session_id ?? createRes.data?.id ?? createRes.data?.sessionId) as
        | string
        | undefined;
      const sessionId = sessionIdRaw != null ? String(sessionIdRaw).trim() : "";
      if (!sessionId) return;
      const publicBase = getPublicBaseUrl();
      const fallbackBase = `${window.location.protocol}//${window.location.hostname}:5173`;
      const baseForQr = (publicBase || fallbackBase).replace(/\/+$/, "");
      const qrTarget = `${baseForQr}/wms-upload/${encodeURIComponent(sessionId)}`;
      const qrDataUrl = await QRCode.toDataURL(qrTarget, { width: 260, margin: 1 });
      onPhoneSessionChange({ lineId, sessionId, qrDataUrl, seenUrls: [...photoRefs] });
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        setCameraError("Upload telefonu niedostępny.");
      } else {
        setCameraError("Nie udało się uruchomić uploadu telefonu.");
      }
    }
  }, [lineId, onPhoneSessionChange, photoRefs]);

  useEffect(() => {
    if (!phoneSession || phoneSession.lineId !== lineId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await wmsPhotoUploadClient.get(
          `/wms/photo-upload/session/${encodeURIComponent(phoneSession.sessionId)}`,
          { params: { tenant_id: DAMAGE_TENANT_ID } },
        );
        if (cancelled) return;
        const refs = extractSessionPhotoUrls(res.data).map((u) => normalizePhotoRef(u)).filter(Boolean);
        const seen = new Set(phoneSession.seenUrls);
        const fresh = refs.filter((u) => !seen.has(u));
        if (fresh.length > 0) {
          onPhonePhotos(lineId, fresh);
          onPhoneSessionChange({
            ...phoneSession,
            seenUrls: Array.from(new Set([...phoneSession.seenUrls, ...fresh])),
          });
        }
      } catch {
        // polling like RMZ
      }
    };
    const id = window.setInterval(() => void tick(), 2000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [lineId, onPhonePhotos, onPhoneSessionChange, phoneSession]);

  const displayPhotos = photoRefs.map((ref) => ({
    key: ref,
    url: resolveDamageMediaUrl(ref),
    ref,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Zdjęcia magazynowe</h4>
        <span className="text-xs tabular-nums text-slate-500">
          {photoRefs.length}/{MAX_PHOTOS}
        </span>
      </div>

      <div
        className={`rounded-xl border-2 border-dashed p-4 transition ${
          dragOver ? "border-blue-400 bg-blue-50/40" : "border-slate-200 bg-white"
        } ${busy || atLimit ? "opacity-60" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy && !atLimit) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          ingestFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <Upload className="h-6 w-6 text-slate-400" aria-hidden />
          <p className="text-sm font-medium text-slate-700">Przeciągnij zdjęcia tutaj</p>
          <p className="text-xs text-slate-500">Możesz dodać wiele plików naraz</p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            disabled={busy || atLimit}
            className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => diskInputRef.current?.click()}
          >
            📁 Wybierz z dysku
          </button>
          <button
            type="button"
            disabled={busy || atLimit}
            className="min-h-[44px] rounded-xl bg-slate-900 px-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void startCamera()}
          >
            📷 Kamera
          </button>
          <button
            type="button"
            disabled={busy || atLimit}
            className="min-h-[44px] rounded-xl bg-indigo-700 px-2 text-xs font-bold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void openPhoneUploadSession()}
          >
            📱 Telefon (QR)
          </button>
          <button
            type="button"
            disabled={busy || atLimit}
            className="min-h-[44px] rounded-xl bg-[#41546a] px-2 text-xs font-bold text-white hover:bg-[#36444d] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => collectorInputRef.current?.click()}
          >
            📦 Kolektor
          </button>
        </div>

        <input
          ref={diskInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={busy || atLimit}
          onChange={(e) => {
            ingestFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={collectorInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          disabled={busy || atLimit}
          onChange={(e) => {
            ingestFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {cameraOpen ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <video ref={videoRef} autoPlay playsInline muted className="h-48 w-full rounded-lg bg-black object-contain" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-[44px] flex-1 rounded-xl bg-emerald-700 px-4 text-sm font-extrabold text-white hover:bg-emerald-600"
              onClick={() => void captureFromCamera()}
            >
              Zrób zdjęcie
            </button>
            <button
              type="button"
              className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              onClick={stopCamera}
            >
              Zamknij
            </button>
          </div>
        </div>
      ) : null}

      {phoneSession && phoneSession.lineId === lineId ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-sm text-slate-700">
            Zeskanuj QR i zrób zdjęcie na telefonie. Nowe zdjęcia pojawią się automatycznie.
          </p>
          <div className="mt-3 flex justify-center">
            <img
              src={phoneSession.qrDataUrl}
              alt="QR do uploadu zdjęcia"
              className="h-56 w-56 rounded border border-slate-200 bg-white p-2"
            />
          </div>
        </div>
      ) : null}

      {cameraError ? <p className="text-sm text-rose-700">{cameraError}</p> : null}
      {uploadMessage ? <p className="text-xs text-slate-500">{uploadMessage}</p> : null}

      {(displayPhotos.length > 0 || localPreviews.length > 0) && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {displayPhotos.map((p) => (
            <div key={p.key} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-white">
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                disabled={busy}
                title="Usuń zdjęcie"
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-white opacity-95 shadow hover:bg-rose-500 disabled:opacity-50"
                onClick={() => void onDeletePhoto(p.ref)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {localPreviews.map((p) => (
            <button
              key={p.key}
              type="button"
              className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-white"
              onClick={() => window.open(p.url, "_blank", "noopener,noreferrer")}
            >
              <img src={p.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
