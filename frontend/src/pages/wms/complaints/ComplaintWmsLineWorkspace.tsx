import { complaintDefectLabel } from "../../../constants/complaintDefectTags";
import { resolveDamageMediaUrl } from "../../../utils/resolveDamageMediaUrl";
import {
  normalizeComplaintStatus,
  type ComplaintDetail,
  type ComplaintLineDetail,
  type ComplaintStatusCode,
} from "../../../types/complaint";
import { ComplaintWmsPhotoUploader, type PhoneUploadSessionState } from "./ComplaintWmsPhotoUploader";
import { complaintLineDecisionLabel } from "./complaintWmsLineStatus";
import type { LocalPreview } from "./complaintWmsPhotoUtils";

export type ComplaintWmsDecisionAction =
  | "verification"
  | "accepted"
  | "reject"
  | "repair"
  | "exchange"
  | "refund";

type Props = {
  data: ComplaintDetail;
  line: ComplaintLineDetail;
  note: string;
  photoRefs: string[];
  localPreviews: LocalPreview[];
  uploading: boolean;
  uploadMessage: string | null;
  decisionBusy: boolean;
  phoneSession: PhoneUploadSessionState | null;
  onNoteChange: (value: string) => void;
  onUploadFiles: (files: FileList | File[]) => void | Promise<void>;
  onDeletePhoto: (photoRef: string) => void | Promise<void>;
  onPhonePhotos: (lineId: number, freshRefs: string[]) => void;
  onPhoneSessionChange: (session: PhoneUploadSessionState | null) => void;
  onDecision: (action: ComplaintWmsDecisionAction) => void | Promise<void>;
};

function fmtDate(iso?: string | null): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function lineReasonText(line: ComplaintLineDetail): string {
  const tags = Array.isArray(line.defect_ids) ? line.defect_ids.filter(Boolean) : [];
  const parts = tags.map((id) => complaintDefectLabel(id));
  if (line.reason?.trim()) parts.push(line.reason.trim());
  return parts.length ? parts.join(" · ") : "—";
}

function customerNotes(data: ComplaintDetail, line: ComplaintLineDetail): string {
  const chunks = [data.description?.trim(), data.customer_reason?.trim(), line.reason?.trim()].filter(Boolean);
  return chunks.length ? Array.from(new Set(chunks)).join("\n") : "—";
}

function activeDecision(
  line: ComplaintLineDetail,
  complaintStatus: ComplaintStatusCode,
): ComplaintWmsDecisionAction | null {
  const decision = String(line.decision ?? "").trim().toLowerCase();
  if (decision === "repair") return "repair";
  if (decision === "exchange") return "exchange";
  if (decision === "reject") return "reject";
  if (decision === "refund") return "refund";

  const op = String(line.operation_status ?? "").trim().toLowerCase();
  if (op === "warehouse_in") return "verification";
  if (complaintStatus === "ZAAKCEPTOWANA") return "accepted";
  return null;
}

function DecisionButton({
  label,
  tone,
  active,
  disabled,
  onClick,
}: {
  label: string;
  tone: "slate" | "emerald" | "amber" | "rose" | "blue" | "indigo";
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const base =
    tone === "slate"
      ? "bg-slate-700 hover:bg-slate-600"
      : tone === "emerald"
        ? "bg-emerald-600 hover:bg-emerald-500"
        : tone === "amber"
          ? "bg-amber-600 hover:bg-amber-500"
          : tone === "rose"
            ? "bg-rose-600 hover:bg-rose-500"
            : tone === "blue"
              ? "bg-blue-600 hover:bg-blue-500"
              : "bg-indigo-600 hover:bg-indigo-500";

  if (active) {
    return (
      <button
        type="button"
        disabled
        className={`h-14 w-full cursor-default rounded-xl border-2 text-base font-extrabold tracking-wide opacity-100 ${
          tone === "emerald"
            ? "border-emerald-500 bg-emerald-100 text-emerald-900"
            : tone === "amber"
              ? "border-amber-500 bg-amber-100 text-amber-950"
              : tone === "rose"
                ? "border-rose-500 bg-rose-100 text-rose-900"
                : tone === "blue"
                  ? "border-blue-500 bg-blue-100 text-blue-900"
                  : tone === "indigo"
                    ? "border-indigo-500 bg-indigo-100 text-indigo-900"
                    : "border-slate-500 bg-slate-100 text-slate-900"
        }`}
      >
        ✓ {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      className={`h-12 w-full rounded-xl text-base font-extrabold tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-60 ${base}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function ComplaintWmsLineWorkspace({
  data,
  line,
  note,
  photoRefs,
  localPreviews,
  uploading,
  uploadMessage,
  decisionBusy,
  phoneSession,
  onNoteChange,
  onUploadFiles,
  onDeletePhoto,
  onPhonePhotos,
  onPhoneSessionChange,
  onDecision,
}: Props) {
  const imgSrc = line.product_image_url ? resolveDamageMediaUrl(line.product_image_url) : "";
  const complaintStatus = normalizeComplaintStatus(data.status);
  const current = activeDecision(line, complaintStatus);
  const decisionLabel = complaintLineDecisionLabel(line.decision);
  const customerPhotos = (line.customer_photos ?? []).filter(Boolean);

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4">
      <div className="relative flex w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex shrink-0 gap-3 px-4 py-3">
          <div className="relative flex h-[180px] w-[180px] shrink-0 items-center justify-center bg-white lg:h-[200px] lg:w-[200px]">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt=""
                className="max-h-[180px] max-w-[180px] object-contain lg:max-h-[200px] lg:max-w-[200px]"
              />
            ) : (
              <span className="text-sm text-slate-400">Brak zdjęcia</span>
            )}
            {line.quantity > 1 ? (
              <span className="absolute left-1 top-1 z-10 rounded-full bg-slate-900/85 px-2.5 py-1 text-xs font-bold text-white">
                x{line.quantity}
              </span>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold leading-snug text-slate-900 lg:text-lg">
              {line.product_name?.trim() || `Produkt #${line.product_id ?? line.id}`}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              EAN: <span className="font-medium tabular-nums">{line.product_ean?.trim() || "—"}</span>
              <span className="mx-1.5 text-slate-300" aria-hidden>
                •
              </span>
              SKU: <span className="font-semibold">{line.sku?.trim() || "—"}</span>
            </p>
            <p className="mt-2 text-sm text-slate-700">
              Ilość: <span className="font-bold tabular-nums">{line.quantity}</span>
            </p>
            <p className="mt-2 text-sm text-slate-700">
              Status pozycji: <span className="font-semibold">{decisionLabel}</span>
            </p>
          </div>
        </div>

        <div className="grid gap-3 border-t border-slate-100 px-4 py-3 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Przyczyna reklamacji</p>
            <p className="mt-1 text-sm text-slate-800">{lineReasonText(line)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Data zgłoszenia</p>
            <p className="mt-1 text-sm font-medium tabular-nums text-slate-800">{fmtDate(data.created_at)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Notatki klienta</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{customerNotes(data, line)}</p>
          </div>
        </div>

        <div className="border-t border-slate-100 px-4 py-3">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Notatki magazynowe
          </label>
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={3}
            placeholder="Dodaj krótką notatkę z oględzin."
            className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
          />
        </div>

        {customerPhotos.length > 0 ? (
          <div className="border-t border-slate-100 px-4 py-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Zdjęcia klienta</p>
            <div className="flex flex-wrap gap-2">
              {customerPhotos.map((url, i) => (
                <a
                  key={`${url}-${i}`}
                  href={resolveDamageMediaUrl(url)}
                  target="_blank"
                  rel="noreferrer"
                  className="h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-white"
                >
                  <img src={resolveDamageMediaUrl(url)} alt="" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className="border-t border-slate-100 px-4 py-3">
          <ComplaintWmsPhotoUploader
            lineId={line.id}
            photoRefs={photoRefs}
            localPreviews={localPreviews}
            uploading={uploading}
            uploadMessage={uploadMessage}
            onUploadFiles={onUploadFiles}
            onDeletePhoto={onDeletePhoto}
            onPhonePhotos={onPhonePhotos}
            phoneSession={phoneSession}
            onPhoneSessionChange={onPhoneSessionChange}
          />
        </div>

        <div className="space-y-2 border-t border-slate-100 px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Decyzja magazynowa</p>
          <DecisionButton
            label="PRZYJĘTA DO WERYFIKACJI"
            tone="slate"
            active={current === "verification"}
            disabled={decisionBusy}
            onClick={() => void onDecision("verification")}
          />
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
            <DecisionButton
              label="NAPRAWA"
              tone="amber"
              active={current === "repair"}
              disabled={decisionBusy}
              onClick={() => void onDecision("repair")}
            />
            <DecisionButton
              label="WYMIANA"
              tone="blue"
              active={current === "exchange"}
              disabled={decisionBusy}
              onClick={() => void onDecision("exchange")}
            />
            <DecisionButton
              label="ODRZUCONA"
              tone="rose"
              active={current === "reject"}
              disabled={decisionBusy}
              onClick={() => void onDecision("reject")}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <DecisionButton
              label="ZWROT ŚRODKÓW"
              tone="indigo"
              active={current === "refund"}
              disabled={decisionBusy}
              onClick={() => void onDecision("refund")}
            />
            <DecisionButton
              label="UZNANA"
              tone="emerald"
              active={current === "accepted"}
              disabled={decisionBusy}
              onClick={() => void onDecision("accepted")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
