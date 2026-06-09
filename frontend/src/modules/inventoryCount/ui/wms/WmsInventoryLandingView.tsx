import { ClipboardList, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

import type { WmsActiveInventoryDocumentRead } from "@/api/inventoryCountApi";
import {
  inventoryDocumentStatusLabel,
  inventoryMovementPolicyLabel,
  inventoryTypeLabel,
} from "@/modules/inventoryCount/inventoryCountUiLabels";
import { erpInventoryCountPaths } from "@/modules/inventoryCount/inventoryCountPaths";
import { WMS_INV } from "./theme";

type Props = {
  docs: WmsActiveInventoryDocumentRead[];
  loading: boolean;
  err: string | null;
  canCreateDocument: boolean;
  onOpenDocument: (doc: WmsActiveInventoryDocumentRead) => void;
  formatActivity: (iso: string | null | undefined) => string;
};

/** Document selection — presentation only. */
export default function WmsInventoryLandingView({
  docs,
  loading,
  err,
  canCreateDocument,
  onOpenDocument,
  formatActivity,
}: Props) {
  return (
    <div className={`${WMS_INV.shellWide} mt-8`}>
      <div className={`${WMS_INV.textLabel} mb-1`}>Inwentaryzacja</div>
      <h1 className={`${WMS_INV.textSub} mb-8`}>
        Wybierz aktywny dokument, aby rozpocząć liczenie w magazynie.
      </h1>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
        </p>
      ) : null}
      {err ? <p className="text-sm text-rose-600">{err}</p> : null}

      {!loading && docs.length === 0 ? (
        <div className={`${WMS_INV.card} border-dashed px-6 py-12 text-center`}>
          <ClipboardList className="mx-auto h-10 w-10 text-slate-300" strokeWidth={1.5} />
          <p className="mt-3 text-base font-bold text-slate-700">Brak aktywnych inwentaryzacji</p>
          <p className="mt-2 text-sm text-slate-500">
            W magazynie nie ma dokumentów w trakcie liczenia ani oczekujących zatwierdzenia.
          </p>
          {canCreateDocument ? (
            <Link to={erpInventoryCountPaths.wizard} className={`${WMS_INV.btnCta} mt-6 inline-block`}>
              Utwórz dokument
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-4">
        {docs.map((doc) => {
          const canCount = doc.can_count;
          const movement = doc.movement_policy ?? doc.lock_mode;
          const progressLabel = `${doc.coverage_percent}%`;
          const ctaLabel = !canCount
            ? "Do zatwierdzenia"
            : doc.counted_lines > 0
              ? "Kontynuuj liczenie"
              : "Rozpocznij liczenie";

          return (
            <div
              key={doc.id}
              className={`group ${WMS_INV.card} flex cursor-pointer flex-col justify-between p-6 transition-all hover:border-slate-300 hover:shadow-md md:flex-row md:items-center`}
              onClick={() => canCount && onOpenDocument(doc)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCount) onOpenDocument(doc);
              }}
              role="button"
              tabIndex={canCount ? 0 : -1}
            >
              <div className="flex-1">
                <h2 className="mb-1 text-lg font-bold text-slate-800 transition-colors group-hover:text-[#5a45d0]">
                  {doc.number}
                </h2>
                {doc.title?.trim() ? (
                  <p className="mb-2 truncate text-sm font-medium text-slate-600">{doc.title.trim()}</p>
                ) : null}
                <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 md:mb-0">
                  <span className="font-medium text-slate-600">
                    {inventoryTypeLabel(doc.inventory_type)} · {inventoryDocumentStatusLabel(doc.status)}
                  </span>
                  <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:block" />
                  <span>Ostatnia aktywność: {formatActivity(doc.last_activity_at ?? doc.updated_at)}</span>
                </div>
              </div>

              <div className="grid flex-1 grid-cols-2 gap-6 border-t border-slate-100 pt-4 text-xs text-slate-600 sm:grid-cols-3 md:border-l md:border-t-0 md:pl-8 md:pt-0">
                <div>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Zakres</div>
                  <div className="font-medium text-slate-700">{doc.scope_summary || "—"}</div>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Postęp</div>
                  <div className="font-medium text-slate-700">{progressLabel}</div>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Operatory / Konflikty
                  </div>
                  <div className="font-medium text-slate-700">
                    {doc.operator_count} / {doc.conflict_count}
                  </div>
                </div>
                <div className="col-span-2 text-[11px] text-slate-500 sm:col-span-3">
                  Ruchy: {inventoryMovementPolicyLabel(movement)}
                </div>
              </div>

              <div className="mt-6 md:ml-8 md:mt-0">
                <button
                  type="button"
                  disabled={!canCount}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canCount) onOpenDocument(doc);
                  }}
                  className={WMS_INV.btnCta}
                >
                  {ctaLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
