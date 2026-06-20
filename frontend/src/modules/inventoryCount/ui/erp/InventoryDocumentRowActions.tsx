import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Copy, Download, Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";

import type { InventoryDocumentRead } from "@/api/inventoryCountApi";
import { listSellasistToolbarSquareBtn } from "@/components/listPage/listSellasistTokens";
import { erpInventoryCountPaths } from "../../inventoryCountPaths";
import { isInventoryDraftDeletable } from "../../inventoryDraftDelete";

const MENU_Z = 10050;
const MENU_MIN_WIDTH = 176;

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const deletable = isInventoryDraftDeletable(doc);
  const editable = doc.status === "draft" || doc.status === "planned";

  const updateMenuPos = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.right - MENU_MIN_WIDTH, window.innerWidth - MENU_MIN_WIDTH - 8));
    let top = rect.bottom + 4;
    const estimatedHeight = 240;
    if (top + estimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - estimatedHeight - 4);
    }
    setMenuPos({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(updateMenuPos);
    window.addEventListener("scroll", updateMenuPos, true);
    window.addEventListener("resize", updateMenuPos);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", updateMenuPos, true);
      window.removeEventListener("resize", updateMenuPos);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
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

  const menu =
    open && typeof document !== "undefined" ? (
      <div
        ref={menuRef}
        role="menu"
        className="overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-200/60"
        style={
          menuPos
            ? { position: "fixed", top: menuPos.top, left: menuPos.left, minWidth: MENU_MIN_WIDTH, zIndex: MENU_Z }
            : { position: "fixed", visibility: "hidden", zIndex: MENU_Z }
        }
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
    ) : null;

  return (
    <>
      <div className="flex justify-center" ref={rootRef}>
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Akcje dokumentu ${doc.number}`}
          onClick={() => setOpen((v) => !v)}
          className={listSellasistToolbarSquareBtn}
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
      {menu ? createPortal(menu, document.body) : null}
    </>
  );
}
