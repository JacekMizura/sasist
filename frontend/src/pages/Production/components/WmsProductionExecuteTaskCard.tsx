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

  const identityBits: string[] = [];
  if (display.show_sku && line.productSku) identityBits.push(line.productSku);
  if (display.show_ean && line.productEan) identityBits.push(line.productEan);
  if (display.show_catalog_number && line.productCatalogNumber) {
    identityBits.push(line.productCatalogNumber);
  }

  const summary = (
    <>
      {fmtQty(line.completedQuantity)} / {fmtQty(line.plannedQuantity)}
      {identityBits[0] ? ` · ${identityBits[0]}` : ""}
    </>
  );

  const metaBody = (
    <>
      {identityBits.length > 0 ? (
        <p className="mt-1 font-mono text-sm text-slate-500">{identityBits.join(" · ")}</p>
      ) : null}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div>
          <p className={WMS_TERMINAL_LABEL}>Plan</p>
          <p className="mt-1 text-xl font-black tabular-nums text-slate-900">
            {fmtQty(line.plannedQuantity)}
          </p>
        </div>
        <div>
          <p className={WMS_TERMINAL_LABEL}>Wyprodukowano</p>
          <p className="mt-1 text-xl font-black tabular-nums text-slate-900">
            {fmtQty(line.completedQuantity)}
          </p>
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
        imageUrl={line.productImageUrl}
        title={line.productName}
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
        productName={line.productName}
        plannedQty={line.plannedQuantity}
        producedQty={line.completedQuantity}
        remainingQty={remaining}
        busy={busy}
        requireBatch={traceOn && Boolean(traceability.require_batch)}
        requireSerial={traceOn && Boolean(traceability.require_serial)}
        requireExpiry={traceOn && Boolean(traceability.require_expiry)}
        onClose={() => setModalOpen(false)}
        onConfirm={async (qty, identity) => {
          await onRegister(qty, identity);
          setModalOpen(false);
        }}
      />
    </>
  );
}
