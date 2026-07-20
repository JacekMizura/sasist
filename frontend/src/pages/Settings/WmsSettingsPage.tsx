import { useCallback, useEffect, useRef, useState } from "react";
import { useWarehouse } from "../../context/WarehouseContext";
import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { TabsContainer } from "../../components/layout/TabsContainer";
import { tabsNavItemClassName } from "../../components/layout/TabsNav";
import toast from "react-hot-toast";
import { useBlocker } from "react-router-dom";
import {
  DirectSalesSettingsPanel,
  type DirectSalesSettingsPanelHandle,
} from "../../modules/wmsSettings/directSales/DirectSalesSettingsPanel";
import WmsPackingSettingsPanel, { type WmsPackingSettingsPanelHandle } from "./WmsPackingSettingsPanel";
import WmsReturnsSettingsPanel from "./WmsReturnsSettingsPanel";
import WmsInventoryManagementSettingsPanel from "./WmsInventoryManagementSettingsPanel";
import WmsSmartMatchingSettingsPanel from "./WmsSmartMatchingSettingsPanel";
import WmsThreeDMatchingSettingsPanel from "./WmsThreeDMatchingSettingsPanel";
import WmsProductValidationSettingsPanel from "./WmsProductValidationSettingsPanel";
import WmsProductionSettingsPanel from "./WmsProductionSettingsPanel";
import {
  WmsPickingSettingsSections,
  type WmsPickingSettingsActions,
} from "../../modules/wmsSettings/picking/WmsPickingSettingsPanel";
import { WmsSettingsComingSoon } from "./WmsSettingsComingSoon";
import { WmsSettingsFooter } from "./WmsSettingsFooter";

const WMS_SETTINGS_TABS = [
  { id: "common", label: "Stany magazynowe" },
  { id: "packing", label: "Pakowanie" },
  { id: "picking", label: "Zbieranie" },
  { id: "direct_sales", label: "Sprzedaż bezpośrednia" },
  { id: "complaints", label: "Reklamacje" },
  { id: "returns", label: "Zwroty" },
  { id: "crossdocking", label: "Crossdocking" },
  { id: "receiving", label: "Przyjęcia" },
  { id: "production", label: "Produkcja" },
  { id: "putaway", label: "Rozlokowania" },
  { id: "transfers", label: "Przesunięcia" },
  { id: "smart_matching", label: "Smart Matching" },
  { id: "three_d_matching", label: "Dopasowanie przestrzenne" },
] as const;

type WmsSettingsTabId = (typeof WMS_SETTINGS_TABS)[number]["id"];

function WmsSettingsFutureTabShell({ label }: { label: string; tabId?: string }) {
  return <WmsSettingsComingSoon label={label} />;
}

export default function WmsSettingsPage() {
  const { warehouse } = useWarehouse();
  const warehouseIdTop = warehouse?.id ?? null;

  const [activeTab, setActiveTab] = useState<WmsSettingsTabId>("common");

  const packingRef = useRef<WmsPackingSettingsPanelHandle>(null);
  const directSalesRef = useRef<DirectSalesSettingsPanelHandle>(null);
  const pickingActionsRef = useRef<WmsPickingSettingsActions | null>(null);

  const [packingDirty, setPackingDirty] = useState(false);
  const [directSalesDirty, setDirectSalesDirty] = useState(false);
  const [pickingDirty, setPickingDirty] = useState(false);
  const [globalSaving, setGlobalSaving] = useState(false);

  const isDirty = packingDirty || directSalesDirty || pickingDirty;

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!packingDirty && !directSalesDirty && !pickingDirty) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [packingDirty, directSalesDirty, pickingDirty]);

  const blocker = useBlocker(isDirty);

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
      if (packingDirty && packingRef.current) await packingRef.current.saveAll();
      if (directSalesDirty && directSalesRef.current) await directSalesRef.current.saveAll();
      if (pickingDirty && pickingActionsRef.current) await pickingActionsRef.current.saveAll();
      toast.success("Zapisano ustawienia WMS.");
    } catch {
      toast.error("Nie udało się zapisać ustawień — popraw błędy w formularzu i spróbuj ponownie.");
    } finally {
      setGlobalSaving(false);
    }
  }, [packingDirty, directSalesDirty, pickingDirty]);

  const handleGlobalDiscard = useCallback(async () => {
    try {
      if (packingDirty && packingRef.current) await packingRef.current.discardUnsaved();
      if (directSalesDirty && directSalesRef.current) await directSalesRef.current.discardUnsaved();
      if (pickingDirty && pickingActionsRef.current) await pickingActionsRef.current.discardUnsaved();
    } catch {
      toast.error("Nie udało się przywrócić zapisanych ustawień.");
    }
  }, [packingDirty, directSalesDirty, pickingDirty]);

  const handleSave = handleGlobalSave;
  const handleReset = handleGlobalDiscard;

  const activeLabel = WMS_SETTINGS_TABS.find((t) => t.id === activeTab)?.label ?? "";

  return (
    <PageLayout omitCard className="min-w-0 overflow-visible">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <PageHeader title="Ustawienia WMS" />

        <div className="mt-4 space-y-6">
          <TabsContainer className="w-full [-webkit-overflow-scrolling:touch]">
            <nav
              className="flex w-full flex-nowrap gap-6 overflow-x-auto border-b border-slate-200 sm:justify-start"
              aria-label="Sekcje ustawień WMS"
              role="tablist"
            >
              {WMS_SETTINGS_TABS.map((tab) => {
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`wms-settings-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`wms-settings-panel-${tab.id}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => {
                      setActiveTab(tab.id);
                    }}
                    className={`shrink-0 whitespace-nowrap pb-3 ${tabsNavItemClassName(selected)} ${selected ? "border-b-2 border-blue-600 font-medium text-blue-600" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </TabsContainer>

          <div
            id={`wms-settings-panel-${activeTab}`}
            className={["w-full min-h-[200px] min-w-0 overflow-visible", isDirty ? "pb-2" : ""].filter(Boolean).join(" ")}
            role="tabpanel"
            aria-labelledby={`wms-settings-tab-${activeTab}`}
          >
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
            <div className={activeTab === "common" ? "block" : "hidden"} aria-hidden={activeTab !== "common"}>
              <WmsInventoryManagementSettingsPanel warehouseId={warehouseIdTop} />
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
            {activeTab !== "picking" &&
            activeTab !== "packing" &&
            activeTab !== "direct_sales" &&
            activeTab !== "returns" &&
            activeTab !== "common" &&
            activeTab !== "smart_matching" &&
            activeTab !== "three_d_matching" &&
            activeTab !== "receiving" &&
            activeTab !== "production" ? (
              <div className="w-full">
                <WmsSettingsFutureTabShell label={activeLabel} tabId={activeTab} />
              </div>
            ) : null}
          </div>
        </div>
        <WmsSettingsFooter
          className="-mx-4 sm:-mx-5"
          visible={isDirty}
          saving={globalSaving}
          onCancel={() => void handleReset()}
          onSave={() => void handleSave()}
        />
      </div>
    </PageLayout>
  );
}
