/**
 * Popover to configure send_email STATUS_ACTION before enabling (or to edit template).
 */
import { useEffect, useRef, useState } from "react";

import type { AutomationEntityType } from "../../../api/automationsApi";
import { InternalUserPicker } from "../../messaging/InternalUserPicker";
import { MessageTemplatePicker } from "../../messaging/MessageTemplatePicker";

type Props = {
  open: boolean;
  mode: "customer" | "internal";
  tenantId: number;
  warehouseId?: number | null;
  entityType: AutomationEntityType;
  templateId: number | "";
  userId: number | "";
  busy?: boolean;
  onClose: () => void;
  onSave: (next: { templateId: number; userId?: number }) => void;
  onDisable?: () => void;
  showDisable?: boolean;
};

export function StatusEmailActionPopover({
  open,
  mode,
  tenantId,
  warehouseId = null,
  entityType,
  templateId: initialTemplate,
  userId: initialUser,
  busy = false,
  onClose,
  onSave,
  onDisable,
  showDisable = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [templateId, setTemplateId] = useState<number | "">(initialTemplate);
  const [userId, setUserId] = useState<number | "">(initialUser);

  useEffect(() => {
    if (!open) return;
    setTemplateId(initialTemplate);
    setUserId(initialUser);
  }, [open, initialTemplate, initialUser]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const canSave =
    templateId !== "" &&
    Number(templateId) > 0 &&
    (mode === "customer" || (userId !== "" && Number(userId) > 0));

  return (
    <div
      ref={ref}
      className="absolute left-1/2 top-full z-30 mt-1 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
      role="dialog"
      aria-label="Konfiguracja e-mail"
    >
      {mode === "internal" ? (
        <label className="block text-[11px] font-medium text-slate-600">
          Odbiorca
          <div className="mt-0.5">
            <InternalUserPicker
              value={userId}
              disabled={busy}
              inputClassName="block w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm"
              onChange={setUserId}
            />
          </div>
        </label>
      ) : null}
      <label className={`block text-[11px] font-medium text-slate-600 ${mode === "internal" ? "mt-2" : ""}`}>
        Szablon
        <div className="mt-0.5">
          <MessageTemplatePicker
            tenantId={tenantId}
            warehouseId={warehouseId}
            entityType={entityType}
            value={templateId}
            disabled={busy}
            inputClassName="block w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm"
            onChange={setTemplateId}
          />
        </div>
      </label>
      <div className="mt-3 flex items-center justify-between gap-2">
        {showDisable && onDisable ? (
          <button
            type="button"
            className="text-xs font-medium text-slate-500 hover:text-red-600"
            disabled={busy}
            onClick={onDisable}
          >
            Wyłącz
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            disabled={busy}
            onClick={onClose}
          >
            Anuluj
          </button>
          <button
            type="button"
            className="rounded bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            disabled={busy || !canSave}
            onClick={() => {
              if (!canSave) return;
              onSave({
                templateId: Number(templateId),
                ...(mode === "internal" ? { userId: Number(userId) } : {}),
              });
            }}
          >
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
}
