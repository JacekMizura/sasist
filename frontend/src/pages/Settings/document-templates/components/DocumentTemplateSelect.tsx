import { useEffect, useMemo, useState } from "react";

import {
  fetchPublishedTemplateOptions,
  type PublishedTemplateOptionDto,
} from "../../api/documentTemplatesApi";

type Props = {
  tenantId: number;
  kindCode?: string | null;
  variantCode?: string | null;
  value: number | null;
  onChange: (versionId: number | null, option: PublishedTemplateOptionDto | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
};

export function DocumentTemplateSelect({
  tenantId,
  kindCode,
  variantCode,
  value,
  onChange,
  label = "Szablon dokumentu",
  placeholder = "Wybierz opublikowany szablon…",
  disabled,
}: Props) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<PublishedTemplateOptionDto[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchPublishedTemplateOptions(tenantId, {
      kind_code: kindCode || undefined,
      variant_code: variantCode || undefined,
      search: search.trim() || undefined,
    })
      .then(setOptions)
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [tenantId, kindCode, variantCode, search]);

  const selected = useMemo(
    () => options.find((o) => o.version_id === value) ?? null,
    [options, value],
  );

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <input
        type="search"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        placeholder="Szukaj po nazwie…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        disabled={disabled}
      />
      <select
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        value={value ?? ""}
        onChange={(e) => {
          const vid = e.target.value ? Number(e.target.value) : null;
          const opt = options.find((o) => o.version_id === vid) ?? null;
          onChange(vid, opt);
        }}
        disabled={disabled || loading}
      >
        <option value="">{loading ? "Wczytywanie…" : placeholder}</option>
        {options.map((opt) => (
          <option key={opt.version_id} value={opt.version_id}>
            {opt.label}
            {opt.is_default_binding ? " ★" : ""}
          </option>
        ))}
      </select>
      {selected ? (
        <p className="text-xs text-slate-500">
          {selected.kind_name} · wariant {selected.variant_code} · {selected.status_label}
        </p>
      ) : (
        <p className="text-xs text-slate-400">Brak wyboru — użyty zostanie standardowy binding typu dokumentu.</p>
      )}
    </div>
  );
}
