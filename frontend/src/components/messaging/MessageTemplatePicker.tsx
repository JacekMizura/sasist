/**
 * Shared MessageTemplate picker for StatusActionsPanel + Automation Editor.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  listMessageTemplates,
  type MessageTemplateDto,
} from "../../api/messageTemplatesApi";
import { TEMPLATES_MESSAGES_BASE } from "../../pages/Templates/templatesPaths";

type Props = {
  tenantId: number;
  warehouseId?: number | null;
  entityType?: string;
  value: number | "";
  onChange: (templateId: number | "") => void;
  disabled?: boolean;
  inputClassName?: string;
};

export function MessageTemplatePicker({
  tenantId,
  warehouseId = null,
  entityType,
  value,
  onChange,
  disabled,
  inputClassName,
}: Props) {
  const [templates, setTemplates] = useState<MessageTemplateDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listMessageTemplates({
      tenantId,
      entityType,
      warehouseId,
      activeOnly: true,
      channel: "email",
    })
      .then((rows) => {
        if (!cancelled) setTemplates(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setTemplates([]);
          setError("Nie udało się wczytać szablonów");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, warehouseId, entityType]);

  if (loading) {
    return <p className="text-xs text-slate-500">Ładowanie szablonów…</p>;
  }

  if (error) {
    return <p className="text-xs text-red-600">{error}</p>;
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        <p className="font-medium">Brak szablonów wiadomości e-mail.</p>
        <Link to={TEMPLATES_MESSAGES_BASE} className="mt-1 inline-block font-medium underline">
          Zarządzaj szablonami
        </Link>
      </div>
    );
  }

  return (
    <select
      className={inputClassName ?? "mt-1 block min-w-[12rem] rounded border border-slate-200 px-2 py-1.5 text-sm"}
      disabled={disabled}
      value={value === "" ? "" : String(value)}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? "" : Number(v));
      }}
    >
      <option value="">— wybierz szablon —</option>
      {templates.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
