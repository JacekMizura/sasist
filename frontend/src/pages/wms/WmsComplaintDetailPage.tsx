import axios from "axios";
import { Camera, X } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { getComplaint, uploadComplaintPanelPhotos, wmsUpdateComplaintItems } from "../../api/complaintsApi";
import { wmsPhotoUploadClient } from "../../api/wmsPhotoUploadClient";
import { getPublicBaseUrl } from "../../config/publicUrl";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { complaintDefectLabel } from "../../constants/complaintDefectTags";
import { resolveDamageMediaUrl } from "../../utils/resolveDamageMediaUrl";
import { complaintRowStatusPresentation, type ComplaintDetail, type ComplaintLineDetail } from "../../types/complaint";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";

type LocalPreview = { key: string; url: string };
type PhoneUploadSessionState = {
  lineId: number;
  sessionId: string;
  qrDataUrl: string;
  seenUrls: string[];
};

function normalizeOrderSourceDisplay(raw?: string | null): string {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "—";
  const low = s.toLowerCase();
  const known: Record<string, string> = {
    allegro: "Allegro",
    ebay: "eBay",
    amazon: "Amazon",
    empik: "Empik",
    shoper: "Shoper",
    woocommerce: "WooCommerce",
    prestashop: "PrestaShop",
    bricklink: "Bricklink",
  };
  if (known[low]) return known[low];
  return s;
}

function fmtOrderDate(iso?: string | null): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function linePhotoUrls(line: ComplaintLineDetail): string[] {
  return Array.isArray(line.warehouse_photos) ? line.warehouse_photos.filter(Boolean).map((u) => resolveDamageMediaUrl(u)) : [];
}

function makeLocalPreview(url: string): LocalPreview {
  return { key: `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, url };
}

function normalizePhotoRef(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.startsWith("/uploads/")) return s;
  try {
    const u = new URL(s);
    return `${u.pathname}${u.search ?? ""}`;
  } catch {
    return s;
  }
}

function extractSessionPhotoUrls(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const data = payload as Record<string, unknown>;
  const pools: unknown[] = [
    data.photos,
    data.photo_urls,
    data.urls,
    data.items,
    (data.session as Record<string, unknown> | undefined)?.photos,
    (data.session as Record<string, unknown> | undefined)?.photo_urls,
  ];
  const out: string[] = [];
  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    for (const item of pool) {
      if (typeof item === "string" && item.trim()) out.push(item.trim());
      if (item && typeof item === "object") {
        const raw = (item as Record<string, unknown>).url ?? (item as Record<string, unknown>).photo_url;
        if (typeof raw === "string" && raw.trim()) out.push(raw.trim());
      }
    }
  }
  return Array.from(new Set(out));
}

export default function WmsComplaintDetailPage() {
  const { complaintId } = useParams<{ complaintId: string }>();
  const cid = Number.parseInt(String(complaintId ?? "").trim(), 10);
  const [data, setData] = useState<ComplaintDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [uploadingLineId, setUploadingLineId] = useState<number | null>(null);
  const [uploadMsgByLine, setUploadMsgByLine] = useState<Record<number, string>>({});
  const [previewsByLine, setPreviewsByLine] = useState<Record<number, LocalPreview[]>>({});
  const [photoRefsByLine, setPhotoRefsByLine] = useState<Record<number, string[]>>({});
  const [photoModalLineId, setPhotoModalLineId] = useState<number | null>(null);
  const [phoneUploadSession, setPhoneUploadSession] = useState<PhoneUploadSessionState | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveComplaintConfirmOpen, setSaveComplaintConfirmOpen] = useState(false);
  const [noteByLine, setNoteByLine] = useState<Record<number, string>>({});
  const [focusedNoteLineId, setFocusedNoteLineId] = useState<number | null>(null);

  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const collectorRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const isUploadingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const { registerScanHandler, setActiveDocument, showScannerToast } = useWmsScanner();
  useEffect(() => {
    if (!Number.isFinite(cid) || cid < 1) return;
    setActiveDocument({ kind: "custom", label: `Reklamacja #${cid}` });
    registerScanHandler((code) => {
      showScannerToast(`Skan ${code} — reklamacja (wkrótce).`);
    });
    return () => {
      registerScanHandler(null);
      setActiveDocument(null);
    };
  }, [cid, registerScanHandler, setActiveDocument, showScannerToast]);

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      for (const list of Object.values(previewsByLine)) {
        for (const p of list) URL.revokeObjectURL(p.url);
      }
    };
  }, [previewsByLine]);

  useEffect(() => {
    if (!Number.isFinite(cid) || cid <= 0) {
      setLoading(false);
      setErr("Nieprawidłowe ID reklamacji.");
      setData(null);
      return;
    }
    let cancelled = false;
    let toastClearTimer: ReturnType<typeof window.setTimeout> | undefined;
    setLoading(true);
    setErr(null);
    setToastText(null);
    void (async () => {
      try {
        if (import.meta.env.DEV) {
          console.log("Open complaint (WMS detail load)", {
            complaintIdParam: complaintId,
            parsedComplaintId: cid,
          });
        }
        const res = await getComplaint(cid, DAMAGE_TENANT_ID);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          const is404 = axios.isAxiosError(e) && e.response?.status === 404;
          const msg = is404
            ? "Reklamacja nie istnieje lub została usunięta."
            : "Nie udało się wczytać reklamacji.";
          setErr(msg);
          setData(null);
          if (is404) {
            setToastText(msg);
            toastClearTimer = window.setTimeout(() => {
              if (!cancelled) setToastText(null);
            }, 4500);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (toastClearTimer != null) window.clearTimeout(toastClearTimer);
    };
  }, [cid, complaintId]);

  useEffect(() => {
    const lines = data?.lines ?? [];
    if (!lines.length || !Number.isFinite(cid) || cid <= 0) {
      setNoteByLine({});
      return;
    }
    const loaded: Record<number, string> = {};
    const loadedPhotoRefs: Record<number, string[]> = {};
    for (const line of lines) {
      try {
        loaded[line.id] = localStorage.getItem(`wms.complaint.note.${cid}.${line.id}`) ?? line.note_warehouse ?? "";
      } catch {
        loaded[line.id] = line.note_warehouse ?? "";
      }
      const warehouseLinePhotos = (line.warehouse_photos ?? []).map((u) => normalizePhotoRef(u));
      loadedPhotoRefs[line.id] = warehouseLinePhotos.filter(Boolean);
    }
    setNoteByLine(loaded);
    setPhotoRefsByLine(loadedPhotoRefs);
  }, [cid, data?.id, data?.lines]);

  const status = useMemo(() => complaintRowStatusPresentation(data?.status), [data?.status]);
  const customerName = useMemo(() => {
    const src = data?.order;
    if (!src) return "Brak danych klienta";
    return [src.first_name?.trim(), src.last_name?.trim()].filter(Boolean).join(" ") || "Brak danych klienta";
  }, [data?.order]);
  const sourceLabel = useMemo(
    () => normalizeOrderSourceDisplay(data?.order?.source ?? data?.order_source),
    [data?.order?.source, data?.order_source],
  );
  const complaintDisplayNumber = useMemo(() => `CMP-${String(data?.id ?? 0).padStart(5, "0")}`, [data?.id]);

  const closePhotoModal = useCallback(() => {
    setPhotoModalLineId(null);
    setPhoneUploadSession(null);
    setCameraOpen(false);
    setCameraError(null);
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleUploadLinePhotos = useCallback(
    async (lineId: number, files: FileList | null) => {
      if (!files?.length || data == null) return;
      if (isUploadingRef.current) return;
      const list = Array.from(files).filter((f) => f.size > 0);
      if (list.length === 0) return;

      isUploadingRef.current = true;
      setUploadMsgByLine((prev) => ({ ...prev, [lineId]: "Wysyłanie zdjęć…" }));
      setUploadingLineId(lineId);
      try {
        if (import.meta.env.DEV) console.log("[wms] upload complaint_item_id", lineId);
        const isWmsView = true;
        const photoKind = isWmsView ? "warehouse" : "customer";
        const prevLine = (data.lines ?? []).find((ln) => ln.id === lineId);
        const prevWarehousePhotos = new Set((prevLine?.warehouse_photos ?? []).map((u) => normalizePhotoRef(u)).filter(Boolean));
        const updated = await uploadComplaintPanelPhotos(data.id, DAMAGE_TENANT_ID, undefined, list, photoKind, isWmsView, lineId);
        setData(updated);
        const updatedLine = (updated.lines ?? []).find((ln) => ln.id === lineId);
        const nextWarehousePhotos = (updatedLine?.warehouse_photos ?? []).map((u) => normalizePhotoRef(u)).filter(Boolean);
        const freshRefs = nextWarehousePhotos.filter((u) => !prevWarehousePhotos.has(u));
        if (freshRefs.length > 0) {
          setPhotoRefsByLine((prev) => ({
            ...prev,
            [lineId]: Array.from(new Set([...(prev[lineId] ?? []), ...freshRefs])),
          }));
          setPreviewsByLine((prev) => ({
            ...prev,
            [lineId]: [...(prev[lineId] ?? []), ...freshRefs.map((u) => makeLocalPreview(resolveDamageMediaUrl(u)))],
          }));
        }
        setUploadMsgByLine((prev) => ({ ...prev, [lineId]: `Dodano ${list.length} zdjęć` }));
      } catch {
        setUploadMsgByLine((prev) => ({ ...prev, [lineId]: "Błąd wysyłania zdjęć" }));
      } finally {
        setUploadingLineId(null);
        isUploadingRef.current = false;
      }
    },
    [data],
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
    if (photoModalLineId == null || data == null) return;
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
    const file = new File([blob], `cmp-${photoModalLineId}-${Date.now()}.jpg`, { type: "image/jpeg" });
    const dt = new DataTransfer();
    dt.items.add(file);
    await handleUploadLinePhotos(photoModalLineId, dt.files);
  }, [photoModalLineId, data, handleUploadLinePhotos]);

  const openPhoneUploadSession = useCallback(async (lineId: number) => {
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
      if (!sessionId) {
        setUploadMsgByLine((prev) => ({ ...prev, [lineId]: "Nie udało się utworzyć sesji telefonu." }));
        return;
      }
      const publicBase = getPublicBaseUrl();
      const fallbackBase = `${window.location.protocol}//${window.location.hostname}:5173`;
      const baseForQr = (publicBase || fallbackBase).replace(/\/+$/, "");
      const qrTarget = `${baseForQr}/wms-upload/${encodeURIComponent(sessionId)}`;
      const qrDataUrl = await QRCode.toDataURL(qrTarget, { width: 260, margin: 1 });
      const seen = photoRefsByLine[lineId] ?? [];
      setPhoneUploadSession({ lineId, sessionId, qrDataUrl, seenUrls: seen });
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        setUploadMsgByLine((prev) => ({ ...prev, [lineId]: "Upload telefonu niedostępny." }));
      } else {
        setUploadMsgByLine((prev) => ({ ...prev, [lineId]: "Nie udało się uruchomić uploadu telefonu." }));
      }
    }
  }, [photoRefsByLine]);

  useEffect(() => {
    if (!phoneUploadSession) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await wmsPhotoUploadClient.get(
          `/wms/photo-upload/session/${encodeURIComponent(phoneUploadSession.sessionId)}`,
          { params: { tenant_id: DAMAGE_TENANT_ID } },
        );
        if (cancelled) return;
        const refs = extractSessionPhotoUrls(res.data).map((u) => normalizePhotoRef(u)).filter(Boolean);
        const seen = new Set(phoneUploadSession.seenUrls);
        const fresh = refs.filter((u) => !seen.has(u));
        if (fresh.length > 0) {
          setPhotoRefsByLine((prev) => ({
            ...prev,
            [phoneUploadSession.lineId]: Array.from(
              new Set([...(prev[phoneUploadSession.lineId] ?? []), ...fresh]),
            ),
          }));
          setPreviewsByLine((prev) => ({
            ...prev,
            [phoneUploadSession.lineId]: [
              ...(prev[phoneUploadSession.lineId] ?? []),
              ...fresh.map((u) => makeLocalPreview(resolveDamageMediaUrl(u))),
            ],
          }));
          setPhoneUploadSession((prev) =>
            prev ? { ...prev, seenUrls: Array.from(new Set([...prev.seenUrls, ...fresh])) } : prev,
          );
          setUploadMsgByLine((prev) => ({ ...prev, [phoneUploadSession.lineId]: `Dodano ${fresh.length} zdjęć z telefonu` }));
        }
      } catch {
        // Keep polling silently like RMZ flow.
      }
    };
    const id = window.setInterval(() => {
      void tick();
    }, 2000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [phoneUploadSession]);

  const saveComplaint = useCallback(async () => {
    if (data == null) return;
    setSaveComplaintConfirmOpen(false);
    setSaveBusy(true);
    try {
      const items = (data.lines ?? []).map((line) => {
        const value = noteByLine[line.id] ?? "";
        localStorage.setItem(`wms.complaint.note.${cid}.${line.id}`, value);
        return {
          item_id: String(line.id),
          note_warehouse: value || null,
          photos: photoRefsByLine[line.id] ?? [],
        };
      });
      const updated = await wmsUpdateComplaintItems(data.id, DAMAGE_TENANT_ID, undefined, items);
      setData(updated);
      setToastText("Zapisano");
      window.setTimeout(() => setToastText(null), 1800);
      setUploadMsgByLine({});
    } finally {
      setSaveBusy(false);
    }
  }, [cid, data, noteByLine, photoRefsByLine]);

  if (loading) return <p className="text-sm text-gray-600">Ładowanie…</p>;

  if (err || data == null) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-700">{err ?? "Brak danych."}</p>
        {toastText ? (
          <div className="fixed bottom-6 left-1/2 z-[200] max-w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-medium text-rose-900 shadow-lg">
            {toastText}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex w-full flex-col gap-4 rounded-xl border-2 border-slate-200/90 bg-white p-4 shadow-md sm:flex-row sm:items-center sm:gap-0">
        <div className="flex shrink-0 flex-col text-left">
          <div className="text-2xl font-bold tabular-nums text-slate-900">#{data.order?.number ?? data.order_id ?? "—"}</div>
          <div className="text-sm text-gray-500 tabular-nums">{fmtOrderDate(data.order?.created_at ?? null)}</div>
          <div className="text-sm font-semibold text-slate-700">{complaintDisplayNumber}</div>
        </div>
        <div className="ml-0 flex min-w-0 flex-col space-y-1.5 text-left sm:ml-6">
          <div className="text-lg font-semibold text-slate-900">{customerName}</div>
          <div className="text-base text-gray-500">{sourceLabel}</div>
          <div className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-sm font-semibold ${status.badgeClass}`}>
            {status.label}
          </div>
        </div>
        <div className="ml-0 flex min-w-0 flex-col space-y-1.5 text-left text-base font-medium sm:ml-10">
          <span className="tabular-nums text-slate-800">{data.customer_phone?.trim() || "—"}</span>
          <span className="break-all text-slate-700">{data.customer_email?.trim() || "—"}</span>
        </div>
        <div className="flex items-center sm:ml-auto">
          <button
            type="button"
            disabled={saveBusy}
            onClick={() => setSaveComplaintConfirmOpen(true)}
            className="h-12 w-full rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {saveBusy ? "Zapisywanie…" : "Zapisz reklamację"}
          </button>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Pozycje reklamacji</h2>
        {(data.lines ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white/80 px-3 py-3 text-left text-sm text-slate-600">
            Brak pozycji w reklamacji.
          </p>
        ) : (
          <div className="grid w-full auto-rows-fr grid-cols-1 gap-5 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(data.lines ?? []).map((line) => {
              const tags = Array.isArray(line.defect_ids) ? line.defect_ids.filter(Boolean) : [];
              const lineServerPhotos = linePhotoUrls(line);
              const lineLocalPhotos = previewsByLine[line.id] ?? [];
              return (
                <article
                  key={line.id}
                  className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="relative flex h-[180px] w-full shrink-0 items-center justify-center rounded-t-lg bg-white">
                    {line.product_image_url ? (
                      <img
                        src={resolveDamageMediaUrl(line.product_image_url)}
                        alt=""
                        className="max-h-full max-w-full bg-white p-2 object-contain"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-400">—</div>
                    )}
                    <span className="absolute right-2 top-2 z-10 rounded-full bg-slate-900/85 px-2.5 py-1 text-xs font-bold text-white">
                      ILOŚĆ: {line.quantity}
                    </span>
                  </div>

                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <div className="flex shrink-0 flex-col gap-3 p-4">
                      <div className="line-clamp-2 min-h-[40px] break-words text-base font-bold text-slate-900">
                        {line.product_name?.trim() || `Produkt #${line.product_id ?? line.id}`}
                      </div>
                      <div className="text-base font-black tracking-wide text-slate-900">EAN: {line.product_ean?.trim() || "—"}</div>
                      <div className="text-base text-slate-600">
                        SKU: <span className="font-semibold text-slate-800">{line.sku?.trim() || "—"}</span>
                      </div>
                    </div>

                    <div className="mt-0 flex flex-wrap gap-2 px-4 pb-2">
                      {tags.map((tagId) => (
                        <span
                          key={`${line.id}-tag-${tagId}`}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-800"
                        >
                          {complaintDefectLabel(tagId)}
                        </span>
                      ))}
                      {line.reason?.trim() ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-800">
                          {line.reason.trim()}
                        </span>
                      ) : null}
                      {tags.length === 0 && !line.reason?.trim() ? (
                        <span className="text-xs text-slate-500">Brak oznaczonych powodów</span>
                      ) : null}
                    </div>

                    <div className="mt-auto flex shrink-0 flex-col gap-3 p-4 pt-2">
                      <input
                        ref={(el) => {
                          fileRefs.current[line.id] = el;
                        }}
                        type="file"
                        accept="image/*"
                        multiple
                        capture="environment"
                        className="sr-only"
                        onChange={(e) => {
                          void handleUploadLinePhotos(line.id, e.target.files);
                          e.target.value = "";
                        }}
                      />
                      <button
                        type="button"
                        disabled={uploadingLineId === line.id}
                        onClick={() => setPhotoModalLineId(line.id)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Camera className="h-3.5 w-3.5" aria-hidden />
                        Dodaj zdjęcie
                      </button>
                      {uploadMsgByLine[line.id] ? (
                        <p className="mt-1 text-xs text-slate-500">{uploadMsgByLine[line.id]}</p>
                      ) : null}

                    {(lineServerPhotos.length > 0 || lineLocalPhotos.length > 0) && (
                      <div className="mt-1 grid grid-cols-3 gap-2">
                        {lineServerPhotos.map((url, i) => (
                          <a
                            key={`${line.id}-srv-${url}-${i}`}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="relative aspect-square overflow-hidden rounded-lg border border-slate-200"
                          >
                            <img src={url} alt="" className="h-full w-full object-cover" />
                          </a>
                        ))}
                        {lineLocalPhotos.map((p) => (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => window.open(p.url, "_blank", "noopener,noreferrer")}
                            className="relative aspect-square overflow-hidden rounded-lg border border-slate-200"
                          >
                            <img src={p.url} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}

                      <div className="mt-1">
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Notatka magazynowa
                        </label>
                        <textarea
                          value={noteByLine[line.id] ?? ""}
                          onFocus={() => setFocusedNoteLineId(line.id)}
                          onBlur={() => setFocusedNoteLineId((prev) => (prev === line.id ? null : prev))}
                          onChange={(e) => {
                            const next = e.target.value;
                            setNoteByLine((prev) => ({ ...prev, [line.id]: next }));
                            try {
                              localStorage.setItem(`wms.complaint.note.${cid}.${line.id}`, next);
                            } catch {
                              setErr("Nie udało się zapisać notatki.");
                            }
                          }}
                          rows={focusedNoteLineId === line.id ? 4 : 2}
                          placeholder="Dodaj krótką notatkę z oględzin."
                          className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                        />
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {photoModalLineId != null && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
          onClick={closePhotoModal}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Dodawanie zdjęcia"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Dodaj zdjęcie</h3>
              <button type="button" onClick={closePhotoModal} className="rounded-xl p-1.5 text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-950">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                className="flex min-h-[56px] w-full items-center justify-center rounded-xl bg-slate-900 px-3 py-3 text-sm font-bold text-white shadow-md hover:bg-slate-800"
                onClick={() => void startCamera()}
              >
                📷 Kamera (desktop/laptop)
              </button>
              <button
                type="button"
                className="flex min-h-[56px] w-full items-center justify-center rounded-xl bg-indigo-700 px-3 py-3 text-sm font-bold text-white shadow-md hover:bg-indigo-600"
                onClick={() => void openPhoneUploadSession(photoModalLineId)}
              >
                📱 Telefon (QR)
              </button>
              <label className="flex min-h-[56px] w-full cursor-pointer items-center justify-center rounded-xl bg-[#41546a] px-3 py-3 text-sm font-bold text-white shadow-md hover:bg-[#36444d]">
                📦 Kolektor / urządzenie mobilne
                <input
                  ref={(el) => {
                    collectorRefs.current[photoModalLineId] = el;
                  }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    void handleUploadLinePhotos(photoModalLineId, e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            {cameraOpen ? (
              <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-inner">
                <video ref={videoRef} autoPlay playsInline muted className="h-48 w-full rounded-lg bg-black object-contain" />
                <button
                  type="button"
                  className="block min-h-[44px] w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-extrabold text-white hover:bg-emerald-600"
                  onClick={() => void captureFromCamera()}
                >
                  Zrób zdjęcie
                </button>
              </div>
            ) : null}
            {cameraError ? <p className="mt-2 text-sm text-rose-700">{cameraError}</p> : null}

            {phoneUploadSession && phoneUploadSession.lineId === photoModalLineId ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm text-slate-700">Zeskanuj QR i zrób zdjęcie na telefonie. Nowe zdjęcia pojawią się automatycznie.</p>
                <div className="mt-3 flex justify-center">
                  <img src={phoneUploadSession.qrDataUrl} alt="QR do uploadu zdjęcia" className="h-64 w-64 rounded border border-slate-200 bg-white p-2" />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {saveComplaintConfirmOpen ? (
        <div
          className="fixed inset-0 z-[125] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => !saveBusy && setSaveComplaintConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wms-save-complaint-confirm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3 id="wms-save-complaint-confirm" className="text-base font-semibold text-slate-900">
                Zapisać reklamację?
              </h3>
              <button
                type="button"
                className="shrink-0 rounded-xl p-1.5 text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-950 disabled:opacity-50"
                aria-label="Zamknij"
                disabled={saveBusy}
                onClick={() => setSaveComplaintConfirmOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-slate-700">Zostaną zapisane notatki i zdjęcia magazynowe dla wszystkich pozycji.</p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={saveBusy}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                onClick={() => setSaveComplaintConfirmOpen(false)}
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={saveBusy}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={() => void saveComplaint()}
              >
                {saveBusy ? "Zapisywanie…" : "Tak, zapisz"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toastText ? (
        <div className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-lg">
          {toastText}
        </div>
      ) : null}
    </div>
  );
}
