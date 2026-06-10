import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PurchaseTrendPoint } from "../../../api/customerPurchaseHistoryApi";
import { formatMoneyPl } from "../../../utils/formatOrderMoney";
import { DocumentsTableCard } from "../../documents/documentsDashboardPrimitives";

type Granularity = "day" | "week" | "month";

const GRAN_LABELS: Record<Granularity, string> = {
  day: "Dzień",
  week: "Tydzień",
  month: "Miesiąc",
};

export function CustomerPurchaseHistoryTrendChart({
  points,
  granularity,
  loading,
  onGranularityChange,
}: {
  points: PurchaseTrendPoint[];
  granularity: Granularity;
  loading: boolean;
  onGranularityChange: (g: Granularity) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-800">Trend zakupów</h2>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(["day", "week", "month"] as Granularity[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onGranularityChange(g)}
              className={[
                "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                granularity === g ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50",
              ].join(" ")}
            >
              {GRAN_LABELS[g]}
            </button>
          ))}
        </div>
      </div>
      <DocumentsTableCard className="p-4">
        {loading ? (
          <p className="py-16 text-center text-sm text-slate-500">Ładowanie wykresu…</p>
        ) : points.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">Brak danych do wykresu.</p>
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickFormatter={(v) => `${Number(v).toLocaleString("pl-PL")}`}
                  width={72}
                />
                <Tooltip
                  formatter={(value: number) => [formatMoneyPl(value), "Wartość brutto"]}
                  labelFormatter={(label) => `Okres: ${label}`}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="gross"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#2563eb" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </DocumentsTableCard>
    </section>
  );
}
