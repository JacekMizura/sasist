import type { WarehouseCarrierRead } from "../api/wmsCarrierApi";
import { formatCarrierCode } from "./formatCarrierCode";

/** Otwiera okno z prostą etykietą nośnika i wywołuje druk. */
export function openCarrierLabelPrint(
  carrier: Pick<WarehouseCarrierRead, "code" | "barcode" | "name" | "is_mixed" | "current_location_code" | "sku_count" | "total_qty">,
) {
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) return;
  const raw = (carrier.barcode || carrier.code || "").trim();
  const code = formatCarrierCode(raw);
  const name = (carrier.name || "").trim();
  const title = name || code;
  const mix = carrier.is_mixed ? `<span class="mix">MIX</span>` : "";
  const loc = String(carrier.current_location_code || "—").replace(/</g, "");
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 16px; }
    .box { border: 2px solid #334155; border-radius: 12px; padding: 16px; }
    h1 { margin: 0 0 4px; font-size: 22px; font-weight: 800; }
    .code { font-family: ui-monospace, monospace; font-size: 14px; color: #64748b; margin: 0 0 8px; }
    .mix { display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#ede9fe;color:#5b21b6;font-size:11px;font-weight:800;}
    dl { margin: 12px 0 0; font-size: 14px; }
    dt { color: #64748b; font-size: 11px; text-transform: uppercase; margin-top: 8px; }
    dd { margin: 0; font-weight: 700; }
  </style></head><body>
  <div class="box">
    <h1>${title}</h1>
    ${name ? `<p class="code">${code}</p>` : ""}
    ${mix}
    <dl>
      <dt>Lokalizacja</dt><dd>${loc}</dd>
      <dt>SKU / szt.</dt><dd>${carrier.sku_count} / ${carrier.total_qty}</dd>
    </dl>
  </div>
  <script>window.onload=function(){window.print();}</script>
  </body></html>`);
  w.document.close();
}
