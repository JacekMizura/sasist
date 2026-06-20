import { useEffect, useRef, useState } from "react";
import { Copy, Download, Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import type { InventoryDocumentRead } from "@/api/inventoryCountApi";
import { listSellasistToolbarSquareBtn } from "@/components/listPage/listSellasistTokens";
import { erpInventoryCountPaths } from "../../inventoryCountPaths";
import { isInventoryDraftDeletable } from "../../inventoryDraftDelete";

type Props = {
  doc: InventoryDocumentRead;
  deleteBusy?: boolean;
  onDelete?: (doc: InventoryDocumentRead) => void;
  onDuplicate?: (doc: InventoryDocumentRead) => void;
  onExport?: (doc: InventoryDocumentRead) => void;
};

export function InventoryDocumentRowActions({
  doc,
  deleteBusy,
  onDelete,
  onDuplicate,
  onExport,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const deletable = isInventoryDraftDeletable(doc);
  const editable = doc.status === "draft" || doc.status === "planned";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative flex justify-center" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Akcje dokumentu ${doc.number}`}
        onClick={() => setOpen((v) => !v)}
        className={listSellasistToolbarSquareBtn}
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-[80] mt-1 min-w-[11rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/60"
        >
          <Link
            role="menuitem"
            to={erpInventoryCountPaths.document(doc.id)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
            onClick={() => setOpen(false)}
          >
            <Eye className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            Otwórz
          </Link>
          <Link
            role="menuitem"
            to={editable ? erpInventoryCountPaths.wizardDoc(doc.id) : erpInventoryCountPaths.document(doc.id)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
            onClick={() => setOpen(false)}
          >
            <Pencil className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            Edytuj
          </Link>
          {onDuplicate ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
              onClick={() => {
                onDuplicate(doc);
                setOpen(false);
              }}
            >
              <Copy className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              Duplikuj
            </button>
          ) : null}
          {onExport ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
              onClick={() => {
                onExport(doc);
                setOpen(false);
              }}
            >
              <Download className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              Eksportuj
            </button>
          ) : null}
          {deletable && onDelete ? (
            <button
              type="button"
              role="menuitem"
              disabled={deleteBusy}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              onClick={() => {
                onDelete(doc);
                setOpen(false);
              }}
            >
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
              Usuń
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
