import { fetchCompanyProfile, type CompanyProfileDto } from "../api/companyProfileApi";
import { DAMAGE_TENANT_ID } from "../constants/panelTenant";

export type { CompanyProfileDto };

/**
 * Single entry point for modules that need tenant branding / legal data (PDF, KSeF, series, exports).
 * Defaults to the panel tenant until multi-tenant context is wired in the UI.
 */
export async function getCompanyProfile(tenantId: number = DAMAGE_TENANT_ID): Promise<CompanyProfileDto> {
  return fetchCompanyProfile(tenantId);
}
