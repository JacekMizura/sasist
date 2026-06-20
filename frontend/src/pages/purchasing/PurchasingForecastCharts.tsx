import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { PurchasingForecastPayload } from "../../api/purchasingForecastApi";
import { PurchasingAnalysisSection } from "../../modules/purchasing/ui";

type BarRow = { name: string; qty: number; product_id: number };

type Props = {
  data: PurchasingForecastPayload;
  rangeDays: 30 | 90 | 365;
  barData: BarRow[];
  fmtShortDate: (iso: string) => string;
  onSelectProduct: (id: number) => void;
};

/** Wykresy prognozy — osobny chunk (recharts), ładowany po wejściu na zakładkę. */
export default function PurchasingForecastCharts({
  data,
  rangeDays,
  barData,
  fmtShortDate,
  onSelectProduct,
}: Props) {
  const s = data.summary;

  return (
    <>
      <PurchasingAnalysisSection
        title="Wolumen sprzedaży (szt. / mies.)"
        subtitle={`Ekstrapolacja: (suma szt. w oknie ${rangeDays} dni ÷ ${rangeDays}) × 30 = ${s.total_monthly_sales.toLocaleString("pl-PL")}. Wartość magazynu (szac. koszt): ${s.total_stock_value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      >
        <div className="h-[220px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.charts.sales_trend ?? []} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={48} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={48} />
              <Tooltip
                formatter={(value: number, name: string) => [
                  typeof value === "number" ? value.toLocaleString("pl-PL") : value,
                  name === "qty" ? "Ilość" : "Przychód",
                ]}
                labelFormatter={(l: string) => `Data: ${fmtShortDate(l)}`}
              />
              <Line yAxisId="left" type="monotone" dataKey="qty" name="qty" stroke="#0f766e" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="revenue" name="revenue" stroke="#7c3aed" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </PurchasingAnalysisSection>

      <PurchasingAnalysisSection title="Top rotacja (30 dni)" subtitle="Kliknij słupek, aby wczytać produkt w inspektorze.">
        <div className="h-[240px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={148}
                tick={{ fontSize: 11 }}
                tickFormatter={(value: string) => (value.length > 18 ? `${value.slice(0, 16)}…` : value)}
              />
              <Tooltip
                formatter={(v: number) => [v.toLocaleString("pl-PL"), "Szt. (30 dni)"]}
                labelFormatter={(label) => {
                  const row = barData.find((d) => d.name === label);
                  return row ? `#${row.product_id} ${label}` : String(label);
                }}
              />
              <Bar
                dataKey="qty"
                fill="#334155"
                radius={[0, 4, 4, 0]}
                onClick={(state) => {
                  const row = state?.payload as { product_id?: number } | undefined;
                  if (row?.product_id) onSelectProduct(row.product_id);
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </PurchasingAnalysisSection>
    </>
  );
}
