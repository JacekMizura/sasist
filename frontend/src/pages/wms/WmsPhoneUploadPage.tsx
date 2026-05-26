import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { wmsPhotoUploadClient } from "../../api/wmsPhotoUploadClient";

async function acquireCameraStream(): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    console.error("[WmsPhoneUpload] getUserMedia unavailable or not secure context");
    return null;
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
  } catch (e) {
    console.error("[WmsPhoneUpload] getUserMedia error:", e);
    const name =
      e && typeof e === "object" && "name" in e ? String((e as DOMException).name) : "";
    if (name === "OverconstrainedError") {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      } catch (e2) {
        console.error("[WmsPhoneUpload] getUserMedia fallback error:", e2);
        return null;
      }
    }
    return null;
  }
}

export default function WmsPhoneUploadPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [needsManualStart, setNeedsManualStart] = useState(false);
  const [starting, setStarting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const uploadingRef = useRef(false);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) v.srcObject = null;
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async (): Promise<boolean> => {
    setStarting(true);
    stopTracks();

    const stream = await acquireCameraStream();
    if (!stream) {
      setStarting(false);
      return false;
    }

    streamRef.current = stream;
    const v = videoRef.current;
    if (v) {
      v.srcObject = stream;
      await v.play().catch(() => undefined);
    }
    setCameraReady(true);
    setNeedsManualStart(false);
    setStarting(false);
    return true;
  }, [stopTracks]);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    void (async () => {
      const stream = await acquireCameraStream();
      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!stream) {
        setNeedsManualStart(true);
        setCameraReady(false);
        return;
      }
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => undefined);
      }
      setCameraReady(true);
      setNeedsManualStart(false);
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const v = videoRef.current;
      if (v) v.srcObject = null;
    };
  }, [sessionId]);

  const triggerFlash = useCallback(() => {
    setFlashOn(true);
    window.setTimeout(() => setFlashOn(false), 90);
  }, []);

  const captureAndUpload = useCallback(async () => {
    if (!sessionId || uploadingRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth < 2) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9);
    });
    if (!blob) return;

    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(30);
      }
    } catch {
      /* ignore */
    }

    triggerFlash();

    uploadingRef.current = true;
    setUploading(true);
    try {
      const file = new File([blob], `phone-${Date.now()}.jpg`, { type: "image/jpeg" });
      const form = new FormData();
      form.append("session_id", sessionId);
      form.append("file", file);
      await wmsPhotoUploadClient.post("/wms/photo-upload/", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    } catch (err) {
      console.error("[WmsPhoneUpload] upload error:", err);
      try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate([40, 40, 80]);
        }
      } catch {
        /* ignore */
      }
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }, [sessionId, triggerFlash]);

  if (!sessionId) {
    return <div className="h-screen w-screen bg-black" aria-hidden />;
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />

      <div
        className={`pointer-events-none absolute inset-0 bg-white transition-opacity duration-75 ${
          flashOn ? "opacity-70" : "opacity-0"
        }`}
        aria-hidden
      />

      {needsManualStart && !cameraReady ? (
        <button
          type="button"
          disabled={starting}
          onClick={() => void startCamera().then((ok) => ok || setNeedsManualStart(true))}
          className="absolute left-1/2 top-1/2 z-10 min-h-[56px] w-[min(88vw,320px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white/95 px-8 text-lg font-bold uppercase tracking-wide text-black shadow-lg active:bg-white/80 disabled:opacity-60"
        >
          {starting ? "…" : "Uruchom aparat"}
        </button>
      ) : null}

      {cameraReady ? (
        <div
          className="absolute bottom-0 left-0 right-0 z-10 flex justify-center"
          style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
        >
          <button
            type="button"
            disabled={uploading}
            onClick={() => void captureAndUpload()}
            className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-[5px] border-white/90 bg-white/25 shadow-[0_4px_24px_rgba(0,0,0,0.45)] backdrop-blur-sm active:scale-95 disabled:opacity-50"
            aria-label="Zrób zdjęcie"
          >
            <span className="text-[2rem] leading-none text-white drop-shadow-md">●</span>
          </button>
        </div>
      ) : null}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
