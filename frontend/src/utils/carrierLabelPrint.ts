import type { WarehouseCarrierRead } from "../api/wmsCarrierApi";

/** Otwiera okno z prostą etykietą nośnika i wywołuje druk. */
export function openCarrierLabelPrint(carrier: Pick<WarehouseCarrierRead, "code" | "barcode" | "is_mixed" | "current_location_code" | "sku_count" | "total_qty">) {
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) return;
  const mix = carrier.is_mixed ? `<span class="mix">MIX</span>` : "";
  const loc = String(carrier.current_location_code || "—").replace(/</g, "");
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${carrier.code}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 16px; }
    .box { border: 2px solid #d97706; border-radius: 12px; padding: 16px; background: #fffbeb; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    .mono { font-family: ui-monospace, monospace; }
    .mix { display:inline-block;margin-left:8px;padding:2px 8px;border-radius:6px;background:#fde68a;border:1px solid #d97706;font-size:12px;font-weight:800;}
    dl { margin: 12px 0 0; font-size: 14px; }
    dt { color: #92400e; font-size: 11px; text-transform: uppercase; margin-top: 8px; }
    dd { margin: 0; font-weight: 600; }
  </style></head><body>
  <div class="box">
    <h1 class="mono">${carrier.code}</h1>
    <div class="mono" style="font-size:18px">${carrier.barcode}</div>
    ${mix}
    <dl>
      <dt>Lokalizacja</dt><dd>${loc}</dd>
      <dt>Liczba SKU</dt><dd>${carrier.sku_count}</dd>
      <dt>Suma szt.</dt><dd>${carrier.total_qty}</dd>
    </dl>
  </div>
  <script>window.onload=function(){window.print();}</script>
  </body></html>`);
  w.document.close();
}
