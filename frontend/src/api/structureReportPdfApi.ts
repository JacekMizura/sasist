import api from "./axios";

/**
 * Generuje PDF raportu struktury (backend: HTML + Puppeteer).
 */
export async function downloadStructureReportPdf(
  warehouseId: number,
  layoutId: number,
  tenantId = 1
): Promise<void> {
  const res = await api.post<Blob>(
    "/reports/warehouse-structure/pdf",
    {
      warehouse_id: warehouseId,
      layout_id: layoutId,
      tenant_id: tenantId,
    },
    {
      responseType: "blob",
    }
  );
  const blob = res.data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `raport-struktury-magazynu-${warehouseId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadProductLocationReportPdf(
  warehouseId: number,
  layoutId: number,
  tenantId = 1
): Promise<void> {
  const res = await api.post<Blob>(
    "/reports/product-locations/pdf",
    {
      warehouse_id: warehouseId,
      layout_id: layoutId,
      tenant_id: tenantId,
    },
    {
      responseType: "blob",
    }
  );
  const blob = res.data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `raport-lokalizacji-produktow-${warehouseId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
