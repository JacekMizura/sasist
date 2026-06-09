import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { InventoryDocumentRead } from "@/api/inventoryCountApi";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { erpInventoryCountPaths } from "../../inventoryCountPaths";
import { inventoryTypeLabel } from "../../inventoryCountUiLabels";
import { isInventoryDraftDeletable } from "../../inventoryDraftDelete";
import InventoryStatusBadge from "./InventoryStatusBadge";
import {
  erpDocLink,
  erpPageShell,
  erpTable,
  erpTableScroll,
  erpTableWrap,
  erpTbody,
  erpTd,
  erpTdActions,
  erpTh,
  erpThActions,
  erpThead,
  erpTr,
} from "./theme";

type Props = {
  documents: InventoryDocumentRead[];
  loading?: boolean;
  deleteBusyId?: number | null;
  onDeleteDraft?: (doc: InventoryDocumentRead) => void | Promise<void>;
};

/** Documents list — mockup-aligned table (presentation only). */
export default function InventoryDocumentsView({
  documents,
  loading,
  deleteBusyId = null,
  onDeleteDraft,
}: Props) {
  const [confirmDoc, setConfirmDoc] = useState<InventoryDocumentRead | null>(null);
  const showActions = Boolean(onDeleteDraft) && documents.some(isInventoryDraftDeletable);

  const sorted = useMemo(
    () => [...documents].sort((a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime()),
    [documents],
  );

  const handleConfirmDelete = async () => {
    if (!confirmDoc || !onDeleteDraft) return;
    await onDeleteDraft(confirmDoc);
    setConfirmDoc(null);
  };

  return (
    <div className={erpPageShell}>
      {confirmDoc ? (
        <ConfirmModal
          title="Usunąć wersję roboczą?"
          message={
            <>
              <p>
                Dokument <span className="font-semibold text-slate-900">{confirmDoc.number}</span> zostanie trwale
                usunięty.
              </p>
              <p className="mt-2 text-slate-600">
                Ustawienia kreatora, zakres i notatki zostaną utracone. Tej operacji nie można cofnąć.
              </p>
            </>
          }
          confirmLabel="Usuń wersję roboczą"
          confirmTone="danger"
          pending={deleteBusyId === confirmDoc.id}
          onCancel={() => {
            if (deleteBusyId !== confirmDoc.id) setConfirmDoc(null);
          }}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : documents.length === 0 ? (
        <div className={`${erpTableWrap} py-10 text-center text-sm text-slate-600`}>
          <p>Brak dokumentów inwentaryzacji.</p>
          <p className="mt-2 text-xs text-slate-500">Utwórz inwentaryzację w zakładce „Nowa inwentaryzacja”.</p>
        </div>
      ) : (
        <div className={erpTableWrap}>
          <div className={erpTableScroll}>
            <table className={erpTable}>
              <thead className={erpThead}>
                <tr>
                  {showActions ? <th className={erpThActions}>Akcje</th> : null}
                  <th className={erpTh}>Numer</th>
                  <th className={erpTh}>Typ</th>
                  <th className={erpTh}>Status</th>
                  <th className={`${erpTh} text-right`}>Pokrycie</th>
                  <th className={`${erpTh} text-right`}>Różnice</th>
                </tr>
              </thead>
              <tbody className={erpTbody}>
                {sorted.map((doc) => {
                  const deletable = isInventoryDraftDeletable(doc);
                  return (
                    <tr key={doc.id} className={`${erpTr} group`}>
                      {showActions ? (
                        <td className={erpTdActions}>
                          {deletable ? (
                            <button
                              type="button"
                              disabled={deleteBusyId === doc.id}
                              onClick={() => setConfirmDoc(doc)}
                              className="rounded-md p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                              title="Usuń wersję roboczą"
                              aria-label="Usuń wersję roboczą"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </td>
                      ) : null}
                      <td className={erpTd}>
                        <Link to={erpInventoryCountPaths.document(doc.id)} className={erpDocLink}>
                          {doc.number}
                        </Link>
                      </td>
                      <td className={`${erpTd} text-slate-700`}>{inventoryTypeLabel(doc.inventory_type)}</td>
                      <td className={erpTd}>
                        <InventoryStatusBadge status={doc.status} />
                      </td>
                      <td className={`${erpTd} text-right font-medium`}>{doc.coverage_percent}%</td>
                      <td className={`${erpTd} text-right font-medium`}>{doc.difference_lines}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
