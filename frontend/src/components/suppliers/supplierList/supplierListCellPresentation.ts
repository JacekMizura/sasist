import type { SupplierRead } from "../../../api/inboundSuppliersApi";

export function supplierListCellOrDash(value: string | null | undefined): string {
  const t = value?.trim();
  return t || "—";
}

export type SupplierNameLines = {
  title: string;
  companyLine: string | null;
  nipLine: string | null;
};

export function supplierNameLines(row: SupplierRead): SupplierNameLines {
  const company = row.company_name?.trim() || null;
  const nip = row.tax_id?.trim() || null;
  return {
    title: row.name?.trim() || "—",
    companyLine: company,
    nipLine: nip ? `NIP: ${nip}` : null,
  };
}
