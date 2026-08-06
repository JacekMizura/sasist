import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../../api/axios";
import type { ProductFamily } from "../../../api/productFamiliesApi";
import { pimHintClass, pimPanelClass } from "../../Assortment/pimUi";

type Props = {
  tenantId: number;
  family: ProductFamily;
};

type RelatedSnapshot = {
  categoryLabel: string | null;
  manufacturerLabel: string | null;
  labelTemplateLabel: string | null;
};

/**
 * Read-only related links from base product (category, manufacturer, label).
 */
export function FamilyRelatedCard({ tenantId, family }: Props) {
  const [snap, setSnap] = useState<RelatedSnapshot>({
    categoryLabel: null,
    manufacturerLabel: null,
    labelTemplateLabel: null,
  });

  useEffect(() => {
    const baseId = family.base_product_id;
    if (baseId == null) {
      setSnap({ categoryLabel: null, manufacturerLabel: null, labelTemplateLabel: null });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.get(`/products/${baseId}/`, { params: { tenant_id: tenantId } });
        const p = res.data as Record<string, unknown>;
        if (cancelled) return;
        const catPath = Array.isArray(p.primary_category_path)
          ? (p.primary_category_path as string[]).join(" › ")
          : typeof p.primary_category_name === "string"
            ? p.primary_category_name
            : p.primary_category_id != null
              ? `Kategoria #${p.primary_category_id}`
              : null;
        const mfr =
          typeof p.manufacturer === "string" && p.manufacturer.trim()
            ? p.manufacturer.trim()
            : p.manufacturer_id != null
              ? `Producent #${p.manufacturer_id}`
              : null;
        const label =
          typeof p.label_template_name === "string" && p.label_template_name.trim()
            ? p.label_template_name.trim()
            : p.label_template_id != null
              ? `Szablon #${p.label_template_id}`
              : null;
        setSnap({
          categoryLabel: catPath,
          manufacturerLabel: mfr,
          labelTemplateLabel: label,
        });
      } catch {
        if (!cancelled) {
          setSnap({ categoryLabel: null, manufacturerLabel: null, labelTemplateLabel: null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, family.base_product_id]);

  const rows: { label: string; value: string; href?: string }[] = [
    {
      label: "Kategoria główna",
      value: snap.categoryLabel || "—",
      href: "/categories",
    },
    {
      label: "Producent",
      value: snap.manufacturerLabel || "—",
    },
    {
      label: "Tabela rozmiarów",
      value: "Wkrótce",
    },
    {
      label: "Szablon etykiety",
      value: snap.labelTemplateLabel || "—",
    },
  ];

  return (
    <section className={pimPanelClass}>
      <h2 className="text-sm font-semibold text-slate-900">Powiązania</h2>
      <p className={pimHintClass}>
        Informacje z produktu bazowego
        {family.base_product_name ? ` („${family.base_product_name}”)` : ""}.
      </p>
      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg border border-slate-100 px-3 py-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{r.label}</dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-900">
              {r.href && r.value !== "—" ? (
                <Link to={r.href} className="text-blue-700 hover:underline">
                  {r.value}
                </Link>
              ) : (
                r.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
