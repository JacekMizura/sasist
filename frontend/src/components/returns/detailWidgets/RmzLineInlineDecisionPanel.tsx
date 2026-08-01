import { useMemo, useRef, useState, type ReactNode } from "react";
import { resolveDamageMediaUrl } from "../../../utils/resolveDamageMediaUrl";
import {
  encodeRmzDamageTypePayload,
  type RmzDamageReasonRow,
} from "../../../pages/damage/rmzDamageTypes";
import { WMS_REJECT_OTHER_ID, WMS_REJECT_REASON_GROUPS } from "../../../pages/damage/wmsRejectReasons";

/** Flat checklist for panel RMZ (maps to existing damage_type codes). */
export const PANEL_RMZ_DAMAGE_TYPE_OPTIONS: { id: string; label: string }[] = [
  { id: "c_damaged", label: "Produkt uszkodzony" },
  { id: "c_destroyed", label: "Produkt zniszczony" },
  { id: "c_flood_stain", label: "Zalany" },
  { id: "b_soiling", label: "Trwale zabrudzony" },
  { id: "c_incomplete_main", label: "Niekompletny" },
  { id: "c_odor_hygiene", label: "Zapach / higiena" },
  { id: "__other__", label: "Inne" },
];

export const PANEL_RMZ_OTHER_DAMAGE_ID = "__other__";

const FIELD =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200/80 disabled:bg-slate-50 disabled:opacity-60";
const LABEL = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const SECTION = "border-t border-slate-200/70 pt-4 first:border-t-0 first:pt-0";

export type RmzInlineExpandMode = "damage" | "reject";

export function RmzInlineExpandShell({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-[220ms] ease-out ${
        open ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="border-t border-slate-200/80 bg-[var(--surface-subtle,#f8fafc)] px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export function RmzDecisionSummaryBadge({
  decision,
  condition,
  damageTypeLabel,
  rejectReasonLabel,
}: {
  decision: "OK" | "DAMAGED" | "REJECTED" | null | undefined;
  condition?: string | null;
  damageTypeLabel?: string | null;
  rejectReasonLabel?: string | null;
}) {
  if (decision === "OK") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        Przyjęto
      </span>
    );
  }
  if (decision === "DAMAGED") {
    const cls = (condition ?? "").trim().toUpperCase();
    const tip = damageTypeLabel?.trim();
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
        <span className="min-w-0 truncate">
          Uszkodzone
          {cls === "A" || cls === "B" || cls === "C" ? ` · Klasa ${cls}` : ""}
          {tip ? ` · ${tip}` : ""}
        </span>
      </span>
    );
  }
  if (decision === "REJECTED") {
    const tip = rejectReasonLabel?.trim();
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" aria-hidden />
        <span className="min-w-0 truncate">Odrzucone{tip ? ` · ${tip}` : ""}</span>
      </span>
    );
  }
  return null;
}

export function encodePanelRmzDamageTypes(selectedIds: string[], reasonRows?: RmzDamageReasonRow[] | null): string {
  const hasOther = selectedIds.includes(PANEL_RMZ_OTHER_DAMAGE_ID);
  const codes = selectedIds.filter((id) => id !== PANEL_RMZ_OTHER_DAMAGE_ID);
  const encoded = encodeRmzDamageTypePayload(codes, reasonRows);
  if (encoded) return encoded;
  if (hasOther) return "other";
  return "";
}

type DamageFormProps = {
  damageClass: "A" | "B" | "C";
  onDamageClassChange: (v: "A" | "B" | "C") => void;
  damageTypeIds: string[];
  onToggleDamageType: (id: string) => void;
  photoUrls: string[];
  photoUploading: boolean;
  onPickPhotos: (files: FileList | null) => void;
  onRemovePhoto: (index: number) => void;
  note: string;
  onNoteChange: (v: string) => void;
  error: string | null;
  saving: boolean;
  requirePhotos?: boolean;
  maxPhotos: number;
  onCancel: () => void;
  onSave: () => void;
};

export function RmzInlineDamageForm({
  damageClass,
  onDamageClassChange,
  damageTypeIds,
  onToggleDamageType,
  photoUrls,
  photoUploading,
  onPickPhotos,
  onRemovePhoto,
  note,
  onNoteChange,
  error,
  saving,
  requirePhotos,
  maxPhotos,
  onCancel,
  onSave,
}: DamageFormProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const selected = useMemo(() => new Set(damageTypeIds), [damageTypeIds]);

  return (
    <div className="space-y-4">
      <div className={SECTION}>
        <p className={LABEL}>Klasa produktu</p>
        <div className="mt-2 flex flex-wrap gap-4" role="radiogroup" aria-label="Klasa produktu">
          {(["A", "B", "C"] as const).map((cls) => (
            <label key={cls} className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="radio"
                name="rmz-damage-class"
                checked={damageClass === cls}
                disabled={saving}
                onChange={() => onDamageClassChange(cls)}
                className="h-4 w-4 border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              {cls}
            </label>
          ))}
        </div>
      </div>

      <div className={SECTION}>
        <p className={LABEL}>Typ uszkodzenia</p>
        <p className="mt-0.5 text-[11px] text-slate-400">Wielokrotny wybór</p>
        <div className="mt-2 space-y-2">
          {PANEL_RMZ_DAMAGE_TYPE_OPTIONS.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-2.5 text-[13px] text-slate-800"
            >
              <input
                type="checkbox"
                checked={selected.has(o.id)}
                disabled={saving}
                onChange={() => onToggleDamageType(o.id)}
                className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      <div className={SECTION}>
        <p className={LABEL}>
          Zdjęcia{requirePhotos ? <span className="normal-case text-rose-600"> · wymagane</span> : null}
        </p>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={saving || photoUploading}
          onChange={(e) => {
            void onPickPhotos(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={saving || photoUploading || photoUrls.length >= maxPhotos}
          onClick={() => photoInputRef.current?.click()}
          className="mt-2 inline-flex h-[34px] items-center rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          {photoUploading ? "Wgrywanie…" : "Dodaj zdjęcia"}
        </button>
        {photoUrls.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {photoUrls.map((u, i) => (
              <div key={`${u}-${i}`} className="relative inline-block">
                <img
                  src={resolveDamageMediaUrl(u)}
                  alt=""
                  className="h-14 w-14 rounded-md object-cover"
                />
                <button
                  type="button"
                  disabled={saving}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow hover:bg-rose-500 disabled:opacity-50"
                  title="Usuń"
                  onClick={() => onRemovePhoto(i)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className={SECTION}>
        <label className="block">
          <span className={LABEL}>Notatka</span>
          <textarea
            value={note}
            disabled={saving}
            onChange={(e) => onNoteChange(e.target.value)}
            rows={3}
            className={FIELD}
            placeholder="Opcjonalnie"
          />
        </label>
      </div>

      {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="inline-flex h-[34px] items-center rounded-lg border border-slate-200 bg-white px-3.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Anuluj
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="inline-flex h-[34px] items-center rounded-lg bg-slate-900 px-3.5 text-[12px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Zapisywanie…" : "Zapisz"}
        </button>
      </div>
    </div>
  );
}

type RejectFormProps = {
  categoryLabel: string;
  onCategoryChange: (label: string) => void;
  reasonId: string;
  onReasonChange: (id: string) => void;
  otherText: string;
  onOtherTextChange: (v: string) => void;
  note: string;
  onNoteChange: (v: string) => void;
  error: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
};

export function RmzInlineRejectForm({
  categoryLabel,
  onCategoryChange,
  reasonId,
  onReasonChange,
  otherText,
  onOtherTextChange,
  note,
  onNoteChange,
  error,
  saving,
  onCancel,
  onSave,
}: RejectFormProps) {
  const group = useMemo(
    () => WMS_REJECT_REASON_GROUPS.find((g) => g.label === categoryLabel) ?? null,
    [categoryLabel],
  );

  return (
    <div className="space-y-4">
      <div className={SECTION}>
        <label className="block">
          <span className={LABEL}>
            Powód <span className="normal-case text-rose-600">· wymagane</span>
          </span>
          <select
            value={categoryLabel}
            disabled={saving}
            onChange={(e) => {
              onCategoryChange(e.target.value);
              onReasonChange("");
            }}
            className={FIELD}
          >
            <option value="">— wybierz kategorię —</option>
            {WMS_REJECT_REASON_GROUPS.map((g) => (
              <option key={g.label} value={g.label}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        {group ? (
          <div className="mt-3 space-y-2" role="radiogroup" aria-label="Powód odrzucenia">
            {group.reasons.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-2.5 text-[13px] text-slate-800"
              >
                <input
                  type="radio"
                  name="rmz-reject-reason"
                  checked={reasonId === r.id}
                  disabled={saving}
                  onChange={() => onReasonChange(r.id)}
                  className="h-4 w-4 border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                {r.label}
              </label>
            ))}
          </div>
        ) : null}

        {reasonId === WMS_REJECT_OTHER_ID ? (
          <label className="mt-3 block">
            <span className={LABEL}>
              Uzasadnienie <span className="normal-case text-rose-600">· wymagane</span>
            </span>
            <textarea
              value={otherText}
              disabled={saving}
              onChange={(e) => onOtherTextChange(e.target.value)}
              rows={3}
              className={FIELD}
            />
          </label>
        ) : null}
      </div>

      {reasonId && reasonId !== WMS_REJECT_OTHER_ID ? (
        <div className={SECTION}>
          <label className="block">
            <span className={LABEL}>Notatka</span>
            <textarea
              value={note}
              disabled={saving}
              onChange={(e) => onNoteChange(e.target.value)}
              rows={3}
              className={FIELD}
              placeholder="Opcjonalnie"
            />
          </label>
        </div>
      ) : null}

      {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="inline-flex h-[34px] items-center rounded-lg border border-slate-200 bg-white px-3.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Anuluj
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="inline-flex h-[34px] items-center rounded-lg bg-slate-900 px-3.5 text-[12px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Zapisywanie…" : "Zapisz"}
        </button>
      </div>
    </div>
  );
}
