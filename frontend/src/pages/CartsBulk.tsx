import { useState } from "react";
import { useCartsRefresh } from "../context/CartsRefreshContext";
import { catalogEntityCardShellClass } from "../components/catalog/CatalogEntityPageShell";
import BulkCartList from "./CartsComponents/BulkCartList";
import BulkCartEditor from "./CartsComponents/BulkCartEditor";

export default function CartsBulk() {
  const ctx = useCartsRefresh();
  const cartsRefreshTrigger = ctx?.cartsRefreshTrigger ?? 0;
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

  if (view === "editor") {
    return (
      <div className="-mx-4 -mt-4 sm:-mx-5 sm:-mt-5">
        <div className={`${catalogEntityCardShellClass} overflow-hidden`}>
          <BulkCartEditor cartId={selectedCartId} onClose={handleClose} />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300">
      <BulkCartList
        key="bulk-list-component"
        refreshTrigger={refreshTrigger}
        onAddNew={() => {
          setSelectedCartId(null);
          setView("editor");
        }}
        onEdit={handleEdit}
      />
    </div>
  );
}
