import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { InventoryDocumentRead } from "@/api/inventoryCountApi";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  moduleListDataCardClass,
  moduleListPageShellClass,
  moduleListTableInteriorClass,
} from "@/components/listPage/moduleListLayoutTokens";
import {
  OperationalActionButton,
  OperationalActionColumn,
  panelListDenseActionsOnlyCellClass,
  panelListDenseActionsOnlyHeaderClass,
  panelListDenseRowClass,
  panelListDenseTableClass,
  panelListDenseTableScrollWrapClass,
  panelListDenseTdBase,
  panelListDenseThBase,
  panelListDenseTheadClass,
} from "@/components/operational";
import { erpInventoryCountPaths } from "../../inventoryCountPaths";
import { inventoryTypeLabel } from "../../inventoryCountUiLabels";
import { isInventoryDraftDeletable } from "../../inventoryDraftDelete";
import InventoryStatusBadge from "./InventoryStatusBadge";

type Props = {
  documents: InventoryDocumentRead[];
  loading?: boolean;
  deleteBusyId?: number | null;
  onDeleteDraft?: (doc: InventoryDocumentRead) => void | Promise<void>;
};

/** Documents list — standard ERP dense table (shell in {@link InventoryLayout}). */
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
    <div className={moduleListPageShellClass}>
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
        <div className="py-10 text-center text-sm text-slate-600">
          <p>Brak dokumentów inwentaryzacji.</p>
          <p className="mt-2 text-xs text-slate-500">Utwórz inwentaryzację w zakładce „Nowa inwentaryzacja”.</p>
        </div>
      ) : (
        <div className={moduleListDataCardClass}>
          <div className={moduleListTableInteriorClass}>
            <div className={panelListDenseTableScrollWrapClass}>
              <table className={panelListDenseTableClass}>
                <thead className={panelListDenseTheadClass}>
                  <tr>
                    {showActions ? (
                      <th className={panelListDenseActionsOnlyHeaderClass}>Akcje</th>
                    ) : null}
                    <th className={`${panelListDenseThBase} text-left`}>Numer</th>
                    <th className={`${panelListDenseThBase} text-left`}>Typ</th>
                    <th className={`${panelListDenseThBase} text-left`}>Status</th>
                    <th className={`${panelListDenseThBase} text-right`}>Pokrycie</th>
                    <th className={`${panelListDenseThBase} text-right`}>Różnice</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((doc) => {
                    const deletable = isInventoryDraftDeletable(doc);
                    return (
                      <tr key={doc.id} className={panelListDenseRowClass}>
                        {showActions ? (
                          <td className={panelListDenseActionsOnlyCellClass}>
                            {deletable ? (
                              <OperationalActionColumn
                                aria-label="Akcje dokumentu"
                                slots={[
                                  <OperationalActionButton
                                    key="delete"
                                    variant="danger"
                                    disabled={deleteBusyId === doc.id}
                                    onClick={() => setConfirmDoc(doc)}
                                    title="Usuń wersję roboczą"
                                    aria-label="Usuń wersję roboczą"
                                  >
                                    <Trash2 strokeWidth={2} aria-hidden />
                                  </OperationalActionButton>,
                                ]}
                              />
                            ) : null}
                          </td>
                        ) : null}
                        <td className={`${panelListDenseTdBase} font-semibold text-slate-900`}>
                          <Link
                            to={erpInventoryCountPaths.document(doc.id)}
                            className="text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
                          >
                            {doc.number}
                          </Link>
                        </td>
                        <td className={`${panelListDenseTdBase} text-slate-700`}>
                          {inventoryTypeLabel(doc.inventory_type)}
                        </td>
                        <td className={panelListDenseTdBase}>
                          <InventoryStatusBadge status={doc.status} />
                        </td>
                        <td className={`${panelListDenseTdBase} text-right tabular-nums text-slate-800`}>
                          {doc.coverage_percent}%
                        </td>
                        <td className={`${panelListDenseTdBase} text-right tabular-nums text-slate-800`}>
                          {doc.difference_lines}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
