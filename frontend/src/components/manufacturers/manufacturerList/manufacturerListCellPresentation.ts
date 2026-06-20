import type { ManufacturerRead } from "../../../api/manufacturersApi";

export function manufacturerListCellOrDash(value: string | null | undefined): string {
  const t = value?.trim();
  return t || "—";
}

export type ManufacturerNameLines = {
  title: string;
  companyLine: string | null;
  nipLine: string | null;
};

export function manufacturerNameLines(row: ManufacturerRead): ManufacturerNameLines {
  const company = row.company_name?.trim() || null;
  const nip = row.tax_id?.trim() || null;
  return {
    title: row.name?.trim() || "—",
    companyLine: company,
    nipLine: nip ? `NIP: ${nip}` : null,
  };
}
