import { ShippingMethodLogo } from "../../../components/shipping/ShippingMethodLogo";
import type { CartonDto } from "../../../api/cartonsApi";

export function ShippingMethodBadgeRow({
  methods,
}: {
  methods: CartonDto["shipping_methods"];
}) {
  if (!methods.length) return <span className="text-xs text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1">
      {methods.map((m) => (
        <span
          key={m.id}
          title={`${m.name} (${m.code})`}
          className="inline-flex max-w-full items-center gap-1.5 text-[11px] font-medium text-slate-800"
        >
          <ShippingMethodLogo logoUrl={m.logo_url} methodName={m.name} size="xs" />
          <span className="min-w-0 max-w-[120px] truncate">{m.name}</span>
        </span>
      ))}
    </div>
  );
}
