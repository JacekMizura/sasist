import { useState } from "react";
import { useCartsRefresh } from "../context/CartsRefreshContext";
import CartList from "./CartsComponents/CartList";
import CartEditor from "./CartsComponents/CartEditor";
import BulkCartList from "./CartsComponents/BulkCartList";
import BulkCartEditor from "./CartsComponents/BulkCartEditor";
import ZonesTab from "./CartsComponents/ZonesTab";
import RacksTab from "./CartsComponents/RacksTab";

export default function Carts() {
  const ctx = useCartsRefresh();
  const cartsRefreshTrigger = ctx?.cartsRefreshTrigger ?? 0;
  const [activeTab, setActiveTab] = useState("multi"); // multi, bulk, racks, zones
  const [view, setView] = useState<"list" | "editor">("list");
  const [selectedCartId, setSelectedCartId] = useState<number | null>(null);
  const [listRefreshTrigger, setListRefreshTrigger] = useState(0);
  const refreshTrigger = listRefreshTrigger + cartsRefreshTrigger;

  const handleEdit = (id: number) => {
    setSelectedCartId(id);
    setView("editor");
  };

  const handleClose = () => {
    setSelectedCartId(null);
    setView("list");
    setListRefreshTrigger((t) => t + 1);
  };

  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <div className="max-w-[1700px] mx-auto">
        
        {/* TABS - Nawigacja między modułami */}
        <div className="flex gap-4 border-b border-slate-200 mb-8">
          {[
            { id: "bulk", label: "Wózki" },
            { id: "multi", label: "Wózki z koszykami" },
            { id: "racks", label: "Regały" },
            { id: "zones", label: "Strefy" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { 
                setActiveTab(tab.id); 
                setView("list"); 
              }}
              className={`
                px-6 
                py-3 
                text-[11px] 
                font-black 
                uppercase 
                tracking-widest 
                transition-all 
                ${activeTab === tab.id 
                  ? "border-b-2 border-blue-600 text-blue-600" 
                  : "text-slate-400 hover:text-slate-600"
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* GŁÓWNY KONTENER ZAREZERWOWANY: 
            min-h-[600px] zapobiega podnoszeniu się dołu strony (stopki/tła) 
            podczas przełączania zakładek.
        */}
        <div className="min-h-[600px] w-full relative">
          
          {/* MODUŁ: WÓZKI Z KOSZYKAMI (MULTI) */}
          {activeTab === "multi" && (
            <div className="animate-in fade-in duration-300">
              {view === "list" ? (
                <CartList 
                  key="multi-list-component"
                  refreshTrigger={refreshTrigger}
                  onAddNew={() => { 
                    setSelectedCartId(null); 
                    setView("editor"); 
                  }} 
                  onEdit={handleEdit} 
                />
              ) : (
                <CartEditor 
                  cartId={selectedCartId} 
                  onClose={handleClose} 
                />
              )}
            </div>
          )}

          {/* MODUŁ: WÓZKI ZWYKŁE (BULK) */}
          {activeTab === "bulk" && (
            <div className="animate-in fade-in duration-300">
              {view === "list" ? (
                <BulkCartList 
                  key="bulk-list-component"
                  refreshTrigger={refreshTrigger}
                  onAddNew={() => { 
                    setSelectedCartId(null); 
                    setView("editor"); 
                  }} 
                  onEdit={handleEdit} 
                />
              ) : (
                <BulkCartEditor 
                  cartId={selectedCartId} 
                  onClose={handleClose} 
                />
              )}
            </div>
          )}

          {/* MODUŁ: STREFY GABARYTOWE */}
          {activeTab === "zones" && (
            <div className="animate-in fade-in duration-300">
              <ZonesTab />
            </div>
          )}

          {/* MODUŁ: REGAŁY KOMPLETACYJNE */}
          {activeTab === "racks" && (
            <div className="animate-in fade-in duration-300">
              <RacksTab />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}