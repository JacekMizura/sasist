import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Pencil, Search } from "lucide-react";
import toast from "react-hot-toast";

import {
  fetchDocumentTemplateCatalog,
  fetchDocumentTemplatesList,
  type DocumentTemplateFamilyDto,
  type DocumentTemplateListItemDto,
} from "../../../api/documentTemplatesApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import {
  DEFAULT_TENANT_ID,
  DOC_TEMPLATE_SOURCE_LABELS,
  DOC_TEMPLATE_STATUS_LABELS,
  LIST_BASE,
} from "./constants";

function fmtDt(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusBadgeClass(status: string) {
  if (status === "published") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (status === "draft") return "bg-amber-50 text-amber-900 ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

export function DocumentTemplatesListPage() {
  const [families, setFamilies] = useState<DocumentTemplateFamilyDto[]>([]);
  const [items, setItems] = useState<DocumentTemplateListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [variantFilter, setVariantFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const kinds = useMemo(() => {
    if (familyFilter) return families.find((f) => f.code === familyFilter)?.kinds ?? [];
    return families.flatMap((f) => f.kinds);
  }, [families, familyFilter]);

  async function reload() {
    setLoading(true);
    try {
      const [catalog, rows] = await Promise.all([
        fetchDocumentTemplateCatalog(),
        fetchDocumentTemplatesList(DEFAULT_TENANT_ID, {
          family_code: familyFilter || undefined,
          kind_code: kindFilter || undefined,
          variant_code: variantFilter || undefined,
          status: statusFilter || undefined,
          source: sourceFilter || undefined,
        }),
      ]);
      setFamilies(catalog);
      setItems(rows);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, "Nie udało się wczytać listy."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [familyFilter, kindFilter, variantFilter, statusFilter, sourceFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.kind?.name_pl ?? "").toLowerCase().includes(q) ||
        (row.binding_summary ?? "").toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-6">
          <label className="md:col-span-2 text-xs font-medium text-slate-600">
            Szukaj
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
                placeholder="Nazwa, typ, powiązanie…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </label>
          <FilterSelect label="Rodzina" value={familyFilter} onChange={(v) => { setFamilyFilter(v); setKindFilter(""); }}>
            <option value="">Wszystkie</option>
            {families.map((f) => (
              <option key={f.code} value={f.code}>{f.icon} {f.name_pl}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="Typ" value={kindFilter} onChange={setKindFilter}>
            <option value="">Wszystkie</option>
            {kinds.map((k) => (
              <option key={k.code} value={k.code}>{k.name_pl}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="Wariant" value={variantFilter} onChange={setVariantFilter}>
            <option value="">Wszystkie</option>
            <option value="standard">standard</option>
            <option value="food">food</option>
            <option value="pharma">pharma</option>
            <option value="export">export</option>
          </FilterSelect>
          <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter}>
            <option value="">Wszystkie</option>
            <option value="draft">Robocza</option>
            <option value="published">Opublikowana</option>
            <option value="archived">Archiwum</option>
          </FilterSelect>
          <FilterSelect label="Źródło" value={sourceFilter} onChange={setSourceFilter}>
            <option value="">Wszystkie</option>
            {Object.entries(DOC_TEMPLATE_SOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </FilterSelect>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Nazwa</th>
                <th className="px-4 py-3">Rodzina</th>
                <th className="px-4 py-3">Typ</th>
                <th className="px-4 py-3">Wariant</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Źródło</th>
                <th className="px-4 py-3">Powiązanie</th>
                <th className="px-4 py-3">Ostatnia publikacja</th>
                <th className="px-4 py-3">Autor</th>
                <th className="px-4 py-3 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-500">Wczytywanie…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-500">Brak szablonów spełniających kryteria.</td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.name}</div>
                      <div className="text-xs text-slate-500">{row.template_role_label}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.family?.name_pl ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.kind?.name_pl ?? row.template_role_label}</td>
                    <td className="px-4 py-3 text-slate-600">{row.variants.join(", ") || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(row.display_status)}`}>
                        {DOC_TEMPLATE_STATUS_LABELS[row.display_status] ?? row.display_status_label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.source_label}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate" title={row.binding_summary ?? undefined}>
                      {row.binding_summary ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDt(row.last_published_at)}</td>
                    <td className="px-4 py-3 text-slate-600">{row.author_name}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`${LIST_BASE}/${row.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edytuj
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <select
        className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
