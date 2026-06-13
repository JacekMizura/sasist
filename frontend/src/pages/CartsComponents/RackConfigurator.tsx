import { useMemo, useState } from "react";

import api from "../../api/axios";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  cartsBtnApply,
  cartsFieldLabelClass,
  cartsSectionClass,
  cartsSectionTitleClass,
} from "../../modules/carts/cartsModuleTokens";
import ConsolidationRackGrid from "../wms/consolidation/ConsolidationRackGrid";
import ConsolidationRackSegmentPanel, {
  type SegmentPanelData,
} from "../wms/consolidation/ConsolidationRackSegmentPanel";
import { buildLevelsFromGrid } from "../wms/consolidation/rackLayoutUtils";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";

type RackConfiguratorProps = {
  onRackAdded: () => void;
};

export default function RackConfigurator({ onRackAdded }: RackConfiguratorProps) {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? 1;

  const [rackName, setRackName] = useState("RK-01");
  const [rowCount, setRowCount] = useState(4);
  const [colCount, setColCount] = useState(4);
  const [layoutGenerated, setLayoutGenerated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPanel, setPreviewPanel] = useState<SegmentPanelData | null>(null);

  const previewLevels = useMemo(
    () => (layoutGenerated ? buildLevelsFromGrid(rowCount, colCount) : []),
    [layoutGenerated, rowCount, colCount],
  );

  const handleGenerate = () => {
    if (!rackName.trim()) {
      setError("Podaj nazwę regału.");
      return;
    }
    setError(null);
    setLayoutGenerated(true);
  };

  const handleSave = async () => {
    if (!rackName.trim()) {
      setError("Podaj nazwę regału.");
      return;
    }
    if (!layoutGenerated) {
      setError("Najpierw wygeneruj układ.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/racks/", {
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId,
        name: rackName.trim(),
        levels: buildLevelsFromGrid(rowCount, colCount),
      });
      setRackName("RK-01");
      setRowCount(4);
      setColCount(4);
      setLayoutGenerated(false);
      setPreviewPanel(null);
      onRackAdded();
    } catch (err: unknown) {
      console.error("Rack create error:", err);
      setError("Nie udało się dodać regału.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className={cartsSectionClass}>
        <h3 className={cartsSectionTitleClass}>Nowy regał kompletacyjny</h3>
        <p className="mt-1 text-[13px] text-slate-600">
          Zdefiniuj fizyczny układ: kolumny (A, B, C…) × rzędy (1, 2, 3…). Etykiety półek jak na hali:{" "}
          <span className="font-mono font-semibold">RK-01/A2</span>.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className={cartsFieldLabelClass}>Nazwa regału</label>
            <input
              type="text"
              value={rackName}
              onChange={(e) => setRackName(e.target.value)}
              placeholder="RK-01"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className={cartsFieldLabelClass}>Liczba rzędów</label>
            <input
              type="number"
              min={1}
              max={20}
              value={rowCount}
              onChange={(e) => {
                setLayoutGenerated(false);
                setRowCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)));
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm no-number-spinner"
            />
          </div>
          <div>
            <label className={cartsFieldLabelClass}>Liczba kolumn</label>
            <input
              type="number"
              min={1}
              max={26}
              value={colCount}
              onChange={(e) => {
                setLayoutGenerated(false);
                setColCount(Math.max(1, Math.min(26, Number(e.target.value) || 1)));
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm no-number-spinner"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!rackName.trim()}
            className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-50"
          >
            Generuj układ
          </button>
          {layoutGenerated ? (
            <button type="button" disabled={submitting} onClick={() => void handleSave()} className={cartsBtnApply}>
              {submitting ? "Zapisywanie…" : "Zapisz regał"}
            </button>
          ) : null}
        </div>

        {error ? <p className="mt-2 text-[13px] text-red-600">{error}</p> : null}

        {layoutGenerated && previewLevels.length > 0 ? (
          <div className="mt-6 rounded-xl border border-violet-100 bg-violet-50/30 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wide text-violet-900">Podgląd siatki</h4>
            <p className="mt-1 text-xs text-violet-800">
              {rowCount} rzędów × {colCount} kolumn = {rowCount * colCount} półek
            </p>
            <div className="mt-4">
              <ConsolidationRackGrid
                rackName={rackName.trim()}
                levels={previewLevels.map((lv) => ({
                  level_index: lv.level_index,
                  name: lv.name,
                  is_segmented: lv.is_segmented,
                  segments: lv.segments.map((s) => ({ ...s, order_id: null })),
                }))}
                compact
                onSegmentClick={(cell) =>
                  setPreviewPanel({
                    rackName: name.trim() || "RK-01",
                    shelfLabel: cell.shelfLabel,
                    slotLabel: cell.slotLabel,
                    columnName: cell.columnName,
                    rowNumber: cell.rowNumber,
                    statusLabel: "Wolny (podgląd przed zapisem)",
                    orderId: null,
                    orderNumber: null,
                    readOnly: true,
                  })
                }
              />
            </div>
          </div>
        ) : null}
      </div>

      <ConsolidationRackSegmentPanel segment={previewPanel} onClose={() => setPreviewPanel(null)} />
    </>
  );
}
