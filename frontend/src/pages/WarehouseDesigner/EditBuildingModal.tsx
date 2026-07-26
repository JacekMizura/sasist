import { useState, useEffect, useMemo } from "react";
import { log } from "../../utils/logger";
import type { LayoutState } from "../../types/warehouse";
import { metersToCells } from "../../components/warehouse/warehouseUtils";
import {
  Dialog,
  Input,
  PrimaryButton,
  SecondaryButton,
  typography,
} from "../../design-system";
import { AppOverlayPortal } from "../../components/overlay";

export type EditBuildingModalProps = {
  onClose: () => void;
  onSave: (building_width_m: number, building_depth_m: number, building_height_m: number) => void;
  layout: LayoutState;
};

export function EditBuildingModal({ onClose, onSave, layout }: EditBuildingModalProps) {
  const depthFromLayout = layout.building_depth_m ?? layout.building_height_m;
  const [widthM, setWidthM] = useState(() => layout.building_width_m ?? layout.grid_cols / 10);
  const [depthM, setDepthM] = useState(() => depthFromLayout ?? layout.grid_rows / 10);
  const [heightM, setHeightM] = useState(() => layout.building_height_m ?? 0);
  const [showShrinkWarning, setShowShrinkWarning] = useState(false);
  const [pendingSave, setPendingSave] = useState<{ w: number; d: number; h: number } | null>(null);

  useEffect(() => {
    const depthVal = layout.building_depth_m ?? layout.building_height_m;
    setWidthM(layout.building_width_m ?? layout.grid_cols / 10);
    setDepthM(depthVal ?? layout.grid_rows / 10);
    setHeightM(layout.building_height_m ?? 0);
  }, [layout.building_width_m, layout.building_depth_m, layout.building_height_m, layout.grid_cols, layout.grid_rows]);

  const areaM2 = useMemo(() => {
    const w = Number(widthM);
    const d = Number(depthM);
    return w > 0 && d > 0 ? Math.round(w * d) : 0;
  }, [widthM, depthM]);

  const volumeM3 = useMemo(() => {
    const w = Number(widthM);
    const d = Number(depthM);
    const h = Number(heightM);
    return w > 0 && d > 0 && h > 0 ? Math.round(w * d * h) : 0;
  }, [widthM, depthM, heightM]);

  const racksOutsideCount = useMemo(() => {
    const w = Number(widthM);
    const d = Number(depthM);
    if (w <= 0 || d <= 0) return 0;
    const maxCols = metersToCells(w);
    const maxRows = metersToCells(d);
    return layout.racks.filter(
      (r) => r.x + r.width > maxCols || r.y + r.height > maxRows
    ).length;
  }, [widthM, depthM, layout.racks]);

  const handleSave = () => {
    const w = Number(widthM);
    const d = Number(depthM);
    const h = Math.max(0, Number(heightM));
    if (w <= 0 || d <= 0) return;
    log("Saving building", {
      width: w,
      depth: d,
      height: h,
      building_width_m: w,
      building_depth_m: d,
      building_height_m: h,
    });
    if (racksOutsideCount > 0) {
      setPendingSave({ w, d, h });
      setShowShrinkWarning(true);
      return;
    }
    onSave(w, d, h);
    onClose();
  };

  const handleSaveAnyway = () => {
    if (pendingSave) {
      onSave(pendingSave.w, pendingSave.d, pendingSave.h);
      setPendingSave(null);
      setShowShrinkWarning(false);
      onClose();
    }
  };

  const handleCancelWarning = () => {
    setShowShrinkWarning(false);
    setPendingSave(null);
  };

  if (showShrinkWarning && racksOutsideCount > 0) {
    return (
      <AppOverlayPortal>
        <Dialog
          open
          onClose={handleCancelWarning}
          title="Uwaga"
          size="sm"
          rootClassName="!z-[280]"
          footer={
            <>
              <SecondaryButton type="button" onClick={handleCancelWarning}>
                Anuluj
              </SecondaryButton>
              <PrimaryButton type="button" intent="warning" onClick={handleSaveAnyway}>
                Zapisz mimo to
              </PrimaryButton>
            </>
          }
        >
          <p className={typography.body}>
            {racksOutsideCount} {racksOutsideCount === 1 ? "regał będzie" : "regały będą"} poza granicą budynku.
          </p>
        </Dialog>
      </AppOverlayPortal>
    );
  }

  return (
    <AppOverlayPortal>
      <Dialog
        open
        onClose={onClose}
        title="Ustaw wymiary budynku"
        size="sm"
        rootClassName="!z-[280]"
        footer={
          <>
            <SecondaryButton type="button" onClick={onClose}>
              Anuluj
            </SecondaryButton>
            <PrimaryButton
              type="button"
              onClick={handleSave}
              disabled={Number(widthM) <= 0 || Number(depthM) <= 0}
            >
              Zapisz
            </PrimaryButton>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className={`mb-1 block ${typography.bodyStrong}`}>Szerokość (m)</label>
            <Input
              type="number"
              min={1}
              step={1}
              density="comfortable"
              value={widthM}
              onChange={(e) => setWidthM(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className={`mb-1 block ${typography.bodyStrong}`}>Głębokość (m)</label>
            <Input
              type="number"
              min={1}
              step={1}
              density="comfortable"
              value={depthM}
              onChange={(e) => setDepthM(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className={`mb-1 block ${typography.bodyStrong}`}>Wysokość (m)</label>
            <Input
              type="number"
              min={0}
              step={1}
              density="comfortable"
              value={heightM}
              onChange={(e) => setHeightM(Number(e.target.value) || 0)}
              placeholder="Opcjonalnie"
            />
          </div>
          {areaM2 > 0 && <p className={typography.body}>Powierzchnia: {areaM2} m²</p>}
          {volumeM3 > 0 && <p className={typography.body}>Kubatura: {volumeM3} m³</p>}
          <p className={typography.caption}>Siatka i regały będą ograniczone do tego obszaru.</p>
        </div>
      </Dialog>
    </AppOverlayPortal>
  );
}
