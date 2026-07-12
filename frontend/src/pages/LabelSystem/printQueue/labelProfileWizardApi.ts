import api from "../../../api/axios";

export type LabelProfilePresetId = "200x40" | "100x50" | "a4" | "custom";

export const LABEL_PROFILE_PRESETS: Array<{
  id: LabelProfilePresetId;
  label: string;
  profileName: string;
  dpi: number;
}> = [
  { id: "200x40", label: "200×40", profileName: "200x40 ZPL", dpi: 203 },
  { id: "100x50", label: "100×50", profileName: "100x50 ZPL", dpi: 203 },
  { id: "a4", label: "A4", profileName: "A4", dpi: 300 },
  { id: "custom", label: "Własny", profileName: "", dpi: 203 },
];

type CreateLabelProfileInput = {
  tenantId: number;
  warehouseId: number | null;
  systemPrinterName: string;
  profileName: string;
  dpi: number;
};

export async function createLabelPrintingProfile(input: CreateLabelProfileInput) {
  const profileRes = await api.post(
    "/printer-profiles",
    {
      name: input.profileName.trim(),
      dpi: input.dpi,
      offset_x_mm: 0,
      offset_y_mm: 0,
      scale: 1,
    },
    { params: { tenant_id: input.tenantId } },
  );

  const profile = profileRes.data as { id: number; name: string };

  const printerRes = await api.post(
    "/printers",
    {
      name: input.profileName.trim(),
      profile_id: profile.id,
      warehouse_id: input.warehouseId ?? undefined,
      connection_type: "agent",
      system_printer_name: input.systemPrinterName.trim(),
      provider: "sasist",
    },
    { params: { tenant_id: input.tenantId } },
  );

  return {
    profile,
    printer: printerRes.data as { id: number },
  };
}
