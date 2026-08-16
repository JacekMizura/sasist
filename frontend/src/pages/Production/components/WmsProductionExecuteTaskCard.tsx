import { useState } from "react";
import { Check } from "lucide-react";

import type { FinishedGoodsIdentityBody } from "@/api/productionApi";
import type {
  ProductionTerminalDisplaySettings,
  ProductionTraceabilitySettings,
} from "@/api/wmsProductionSettingsApi";
import type { UnifiedExecutionLine } from "@/modules/production/productionExecutionTypes";
import { WmsProductTaskCard } from "@/components/wms/WmsProductTaskCard";
import { WMS_TERMINAL_LABEL } from "@/components/wms/execution/wmsLayoutTokens";
import { PrimaryButton } from "@/design-system";
import { formatProductionQuantity } from "../productionUi";
import {
  buildProductIdentityMetaLine,
  formatTerminalQuantity,
  resolveWmsProductionProductIdentity,
} from "../display/productionTerminalDisplay";
import { RegisterProductionModal } from "./RegisterProductionModal";

type Props = {
  index: number;
  line: UnifiedExecutionLine;
  display: ProductionTerminalDisplaySettings;
  traceability: ProductionTraceabilitySettings;
  expanded: boolean;
  done: boolean;
  busy: boolean;
  onToggle: () => void;
  onRegister: (qty: number, identity: FinishedGoodsIdentityBody) => void | Promise<void>;
};

function fmtQty(n: number): string {
  return formatProductionQuantity(n);
}

export function WmsProductionExecuteTaskCard({
  index,
  line,
  display,
  traceability,
  expanded,
  done,
  busy,
  onToggle,
  onRegister,
}: Props) {
  const remaining = Math.max(0, line.plannedQuantity - line.completedQuantity);
  const [modalOpen, setModalOpen] = useState(false);
  const traceOn = traceability.mode === "CONFIGURED";

  const identity = resolveWmsProductionProductIdentity(display, {
    name: line.productName,
    sku: line.productSku,
    ean: line.productEan,
    catalogNumber: line.productCatalogNumber,
    barcode: line.productBarcode,
    imageUrl: line.productImageUrl,
    unit: line.productUnit,
  });
  const metaLine = buildProductIdentityMetaLine(display, {
    sku: line.productSku,
    ean: line.productEan,
    catalogNumber: line.productCatalogNumber,
    barcode: line.productBarcode,
  });

  const summary = (
    <>
      {formatTerminalQuantity(line.completedQuantity, {
        unit: line.productUnit,
        showUnit: display.show_unit,
      })}
      {" / "}
      {formatTerminalQuantity(line.plannedQuantity, {
        unit: line.productUnit,
        showUnit: display.show_unit,
      })}
      {metaLine ? ` · ${metaLine.split(" · ")[0]}` : ""}
    </>
  );

  const metaBody = (
    <>
      {metaLine ? <p className="mt-1 font-mono text-sm text-slate-500">{metaLine}</p> : null}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div>
          <p className={WMS_TERMINAL_LABEL}>Plan</p>
          <p className="mt-1 text-xl font-black tabular-nums text-slate-900">{fmtQty(line.plannedQuantity)}</p>
        </div>
        <div>
          <p className={WMS_TERMINAL_LABEL}>Wyprodukowano</p>
          <p className="mt-1 text-xl font-black tabular-nums text-slate-900">{fmtQty(line.completedQuantity)}</p>
        </div>
        <div>
          <p className={WMS_TERMINAL_LABEL}>Pozostało</p>
          <p className="mt-1 text-xl font-black tabular-nums text-amber-900">{fmtQty(remaining)}</p>
        </div>
      </div>
    </>
  );

  const actionFooter =
    !done && expanded ? (
      <div className="mt-4 border-t border-slate-100 pt-4">
        <PrimaryButton
          type="button"
          disabled={busy || remaining <= 0}
          data-wms-card-no-nav=""
          className="w-full"
          onClick={() => setModalOpen(true)}
        >
          Zarejestruj produkcję
        </PrimaryButton>
      </div>
    ) : done ? (
      <p className="mt-4 inline-flex items-center gap-2 border-t border-slate-100 pt-4 text-sm font-bold text-emerald-700">
        <Check className="h-4 w-4" aria-hidden />
        Wyprodukowano {fmtQty(line.plannedQuantity)}
      </p>
    ) : null;

  return (
    <>
      <WmsProductTaskCard
        index={index}
        imageUrl={identity.imageUrl}
        showImage={identity.showImage}
        title={line.productName}
        showTitle={identity.showName}
        summary={summary}
        body={metaBody}
        footer={actionFooter}
        expanded={expanded}
        done={done}
        busy={busy}
        accent={done ? "emerald" : "amber"}
        onToggle={onToggle}
      />
      <RegisterProductionModal
        open={modalOpen}
        display={display}
        productName={line.productName}
        productSku={line.productSku}
        productEan={line.productEan}
        productCatalogNumber={line.productCatalogNumber}
        productBarcode={line.productBarcode}
        plannedQty={line.plannedQuantity}
        producedQty={line.completedQuantity}
        remainingQty={remaining}
        productUnit={line.productUnit}
        busy={busy}
        requireBatch={traceOn && Boolean(traceability.require_batch)}
        requireSerial={traceOn && Boolean(traceability.require_serial)}
        requireExpiry={traceOn && Boolean(traceability.require_expiry)}
        onClose={() => setModalOpen(false)}
        onConfirm={async (qty, identityBody) => {
          await onRegister(qty, identityBody);
          setModalOpen(false);
        }}
      />
    </>
  );
}
