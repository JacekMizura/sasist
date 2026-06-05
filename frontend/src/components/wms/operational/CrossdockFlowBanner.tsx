import { Truck } from "lucide-react";
import type { WmsOperationalTaskDetailApi } from "../../../api/wmsOperationalTasksApi";
import { detectCrossdock } from "./operationalWorkflow";

type Props = {
  detail: WmsOperationalTaskDetailApi;
};

export function CrossdockFlowBanner({ detail }: Props) {
  if (!detectCrossdock(detail)) return null;
  return (
    <div className="rounded-2xl border border-sky-300 bg-gradient-to-r from-sky-50 to-indigo-50 p-4 shadow-sm">
      <div className="flex gap-3">
        <Truck className="mt-0.5 shrink-0 text-sky-700" size={22} />
        <div>
          <p className="text-sm font-black text-sky-950">Crossdock — towar czeka na rozlokowanie produktów</p>
          <p className="mt-1 text-xs font-medium text-sky-900">
            Produkt właśnie przyjechał na nośnik inbound. Rozłóż go do nośników docelowych (strefy
            zamówień) bez odkładania na regał.
          </p>
          {detail.picked_from_location ? (
            <p className="mt-2 text-[10px] font-bold uppercase text-indigo-800">
              Źródło: {detail.picked_from_location}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
