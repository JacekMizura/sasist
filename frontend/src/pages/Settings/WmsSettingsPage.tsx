import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useBlocker, useSearchParams } from "react-router-dom";
import { useWarehouse } from "../../context/WarehouseContext";
import toast from "react-hot-toast";
import {
  DirectSalesSettingsPanel,
  type DirectSalesSettingsPanelHandle,
} from "../../modules/wmsSettings/directSales/DirectSalesSettingsPanel";
import WmsPackingSettingsPanel, { type WmsPackingSettingsPanelHandle } from "./WmsPackingSettingsPanel";
import WmsReturnsSettingsPanel from "./WmsReturnsSettingsPanel";
import WmsSmartMatchingSettingsPanel from "./WmsSmartMatchingSettingsPanel";
import WmsThreeDMatchingSettingsPanel from "./WmsThreeDMatchingSettingsPanel";
import WmsProductValidationSettingsPanel from "./WmsProductValidationSettingsPanel";
import WmsProductionSettingsPanel from "./WmsProductionSettingsPanel";
import {
  WmsGeneralSettingsPanel,
  type WmsGeneralSettingsPanelHandle,
} from "./WmsGeneralSettingsPanel";
import {
  WmsPickingSettingsSections,
  type WmsPickingSettingsActions,
} from "../../modules/wmsSettings/picking/WmsPickingSettingsPanel";
import { WmsSettingsComingSoon } from "./WmsSettingsComingSoon";
import { WmsSettingsFooter } from "./WmsSettingsFooter";
import {
  ASSORTMENT_INVENTORY_SETTINGS_PATH,
  isWmsSettingsTabId,
  WmsSettingsChrome,
  type WmsSettingsTabId,
  WMS_SETTINGS_TABS,
} from "./WmsSettingsChrome";

function WmsSettingsFutureTabShell({ label }: { label: string }) {
  return <WmsSettingsComingSoon label={label} />;
}

export default function WmsSettingsPage() {
  const { warehouse } = useWarehouse();
  const warehouseIdTop = warehouse?.id ?? null;
  const [searchParams] = useSearchParams();

  const rawTab = searchParams.get("tab");
  const legacyInventoryRedirect = rawTab === "common";

  const activeTab: WmsSettingsTabId =
    isWmsSettingsTabId(rawTab) && rawTab !== "workstations" ? rawTab : "packing";

  const generalRef = useRef<WmsGeneralSettingsPanelHandle>(null);
  const packingRef = useRef<WmsPackingSettingsPanelHandle>(null);
  const directSalesRef = useRef<DirectSalesSettingsPanelHandle>(null);
  const pickingActionsRef = useRef<WmsPickingSettingsActions | null>(null);

  const [generalDirty, setGeneralDirty] = useState(false);
  const [packingDirty, setPackingDirty] = useState(false);
  const [directSalesDirty, setDirectSalesDirty] = useState(false);
  const [pickingDirty, setPickingDirty] = useState(false);
  const [globalSaving, setGlobalSaving] = useState(false);

  const isDirty = generalDirty || packingDirty || directSalesDirty || pickingDirty;

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!generalDirty && !packingDirty && !directSalesDirty && !pickingDirty) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [generalDirty, packingDirty, directSalesDirty, pickingDirty]);

  const blocker = useBlocker(isDirty && !legacyInventoryRedirect);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const leave = window.confirm(
      "Masz niezapisane zmiany w ustawieniach WMS. Opuszczenie strony odrzuci niezapisane dane. Kontynuować?",
    );
    if (leave) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  const handleGlobalSave = useCallback(async () => {
    setGlobalSaving(true);
    try {
      if (generalDirty && generalRef.current) await generalRef.current.saveAll();
      if (packingDirty && packingRef.current) await packingRef.current.saveAll();
      if (directSalesDirty && directSalesRef.current) await directSalesRef.current.saveAll();
      if (pickingDirty && pickingActionsRef.current) await pickingActionsRef.current.saveAll();
      toast.success("Zapisano ustawienia WMS.");
    } catch {
      toast.error("Nie udało się zapisać ustawień — popraw błędy w formularzu i spróbuj ponownie.");
    } finally {
      setGlobalSaving(false);
    }
  }, [generalDirty, packingDirty, directSalesDirty, pickingDirty]);

  const handleGlobalDiscard = useCallback(async () => {
    try {
      if (generalDirty && generalRef.current) await generalRef.current.discardUnsaved();
      if (packingDirty && packingRef.current) await packingRef.current.discardUnsaved();
      if (directSalesDirty && directSalesRef.current) await directSalesRef.current.discardUnsaved();
      if (pickingDirty && pickingActionsRef.current) await pickingActionsRef.current.discardUnsaved();
    } catch {
      toast.error("Nie udało się przywrócić zapisanych ustawień.");
    }
  }, [generalDirty, packingDirty, directSalesDirty, pickingDirty]);

  /** Legacy bookmark: Stany magazynowe moved to Asortyment → Ustawienia. */
  if (legacyInventoryRedirect) {
    return <Navigate to={ASSORTMENT_INVENTORY_SETTINGS_PATH} replace />;
  }

  const activeLabel = WMS_SETTINGS_TABS.find((t) => t.id === activeTab)?.label ?? "";

  return (
    <WmsSettingsChrome>
      <div
        id={`wms-settings-panel-${activeTab}`}
        className={["w-full min-h-[200px] min-w-0 overflow-visible", isDirty ? "pb-2" : ""].filter(Boolean).join(" ")}
        role="tabpanel"
        aria-labelledby={`wms-settings-tab-${activeTab}`}
      >
        <div className={activeTab === "general" ? "block" : "hidden"} aria-hidden={activeTab !== "general"}>
          <WmsGeneralSettingsPanel
            ref={generalRef}
            onDirtyChange={setGeneralDirty}
            sectionNavObserve={activeTab === "general"}
          />
        </div>
        <div className={activeTab === "picking" ? "block" : "hidden"} aria-hidden={activeTab !== "picking"}>
          <WmsPickingSettingsSections
            registerActions={(api) => {
              pickingActionsRef.current = api;
            }}
            onDirtyChange={setPickingDirty}
            sectionNavObserve={activeTab === "picking"}
          />
        </div>
        <div className={activeTab === "packing" ? "block" : "hidden"} aria-hidden={activeTab !== "packing"}>
          <WmsPackingSettingsPanel
            ref={packingRef}
            warehouseId={warehouseIdTop}
            onDirtyChange={setPackingDirty}
            sectionNavObserve={activeTab === "packing"}
          />
        </div>
        <div className={activeTab === "direct_sales" ? "block" : "hidden"} aria-hidden={activeTab !== "direct_sales"}>
          <DirectSalesSettingsPanel
            ref={directSalesRef}
            warehouseId={warehouseIdTop}
            onDirtyChange={setDirectSalesDirty}
            sectionNavObserve={activeTab === "direct_sales"}
          />
        </div>
        <div className={activeTab === "returns" ? "block" : "hidden"} aria-hidden={activeTab !== "returns"}>
          <WmsReturnsSettingsPanel warehouseId={warehouseIdTop} />
        </div>
        <div className={activeTab === "smart_matching" ? "block" : "hidden"} aria-hidden={activeTab !== "smart_matching"}>
          <WmsSmartMatchingSettingsPanel warehouseId={warehouseIdTop} sectionNavObserve={activeTab === "smart_matching"} />
        </div>
        <div className={activeTab === "three_d_matching" ? "block" : "hidden"} aria-hidden={activeTab !== "three_d_matching"}>
          <WmsThreeDMatchingSettingsPanel warehouseId={warehouseIdTop} sectionNavObserve={activeTab === "three_d_matching"} />
        </div>
        <div className={activeTab === "receiving" ? "block" : "hidden"} aria-hidden={activeTab !== "receiving"}>
          <WmsProductValidationSettingsPanel warehouseId={warehouseIdTop} />
        </div>
        <div className={activeTab === "production" ? "block" : "hidden"} aria-hidden={activeTab !== "production"}>
          <WmsProductionSettingsPanel warehouseId={warehouseIdTop} />
        </div>
        {activeTab !== "general" &&
        activeTab !== "picking" &&
        activeTab !== "packing" &&
        activeTab !== "direct_sales" &&
        activeTab !== "returns" &&
        activeTab !== "smart_matching" &&
        activeTab !== "three_d_matching" &&
        activeTab !== "receiving" &&
        activeTab !== "production" ? (
          <div className="w-full">
            <WmsSettingsFutureTabShell label={activeLabel} />
          </div>
        ) : null}
      </div>
      <WmsSettingsFooter
        className="-mx-6"
        visible={isDirty}
        saving={globalSaving}
        onCancel={() => void handleGlobalDiscard()}
        onSave={() => void handleGlobalSave()}
      />
    </WmsSettingsChrome>
  );
}
