import { useEffect, useMemo, useState } from "react";

import { getShippingMethods, type ShippingMethodDto } from "../../../api/shippingMethodsApi";
import { DAMAGE_TENANT_ID } from "../../../constants/panelTenant";
import type { CustomerAddressDto } from "../../../api/customersApi";
import {
  formatCustomerAddressStreet,
  getCustomerDefaultAddress,
} from "../../../utils/getCustomerDisplayName";
import type { DirectSaleFulfillment, DirectSaleShippingAddress } from "../../../utils/normalizeDirectSales";

type Props = {
  warehouseId: number;
  fulfillment: DirectSaleFulfillment;
  customerAddresses: CustomerAddressDto[];
  customerPhone?: string | null;
  customerEmail?: string | null;
  disabled?: boolean;
  onPatch: (patch: {
    shippingAddress?: DirectSaleShippingAddress | null;
    customerAddressId?: number | null;
    clearCustomerAddress?: boolean;
    shippingMethodId?: string | null;
    clearShippingMethod?: boolean;
    pickupPointCode?: string | null;
    pickupPointLabel?: string | null;
  }) => void;
};

const emptyAddr = (): DirectSaleShippingAddress => ({
  first_name: "",
  last_name: "",
  company_name: null,
  street: "",
  house_number: "",
  apartment_number: null,
  postal_code: "",
  city: "",
  country_code: "PL",
  phone: null,
  email: null,
});

function addrFromCustomer(a: CustomerAddressDto, phone?: string | null, email?: string | null): DirectSaleShippingAddress {
  return {
    first_name: a.first_name ?? "",
    last_name: a.last_name ?? "",
    company_name: a.company_name ?? null,
    street: a.street ?? "",
    house_number: a.house_number ?? "",
    apartment_number: a.apartment_number ?? null,
    postal_code: a.postal_code ?? "",
    city: a.city ?? "",
    country_code: a.country_code ?? "PL",
    phone: phone ?? null,
    email: email ?? null,
  };
}

export function ShippingDetailsPanel({
  warehouseId,
  fulfillment,
  customerAddresses,
  customerPhone,
  customerEmail,
  disabled,
  onPatch,
}: Props) {
  const [methods, setMethods] = useState<ShippingMethodDto[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(false);
  const addr = fulfillment.shipping_address ?? emptyAddr();

  useEffect(() => {
    let cancelled = false;
    setMethodsLoading(true);
    void getShippingMethods({ tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId, active_only: true })
      .then((rows) => {
        if (!cancelled) setMethods(rows);
      })
      .catch(() => {
        if (!cancelled) setMethods([]);
      })
      .finally(() => {
        if (!cancelled) setMethodsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [warehouseId]);

  const selectedAddrId = fulfillment.customer_address_id;
  const defaultAddr = useMemo(() => getCustomerDefaultAddress(customerAddresses), [customerAddresses]);

  const patchAddr = (patch: Partial<DirectSaleShippingAddress>) => {
    onPatch({
      shippingAddress: { ...addr, ...patch },
      clearCustomerAddress: true,
    });
  };

  return (
    <div className="space-y-3 rounded-2xl border border-blue-50 bg-slate-50/60 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900/50">Dane do wysyłki</h3>

      {customerAddresses.length > 0 ? (
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Zapisany adres</label>
          <select
            disabled={disabled}
            value={selectedAddrId ?? ""}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null;
              if (id == null) {
                onPatch({ clearCustomerAddress: true });
                return;
              }
              const row = customerAddresses.find((a) => a.id === id);
              if (!row) return;
              onPatch({
                customerAddressId: id,
                shippingAddress: addrFromCustomer(row, customerPhone, customerEmail),
              });
            }}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
          >
            <option value="">Inny adres (ręcznie)</option>
            {customerAddresses.map((a) => (
              <option key={a.id} value={a.id}>
                {formatCustomerAddressStreet(a)}, {a.postal_code} {a.city}
                {a.is_default || a.id === defaultAddr?.id ? " (domyślny)" : ""}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <input
          disabled={disabled}
          placeholder="Imię"
          value={addr.first_name}
          onChange={(e) => patchAddr({ first_name: e.target.value })}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
        />
        <input
          disabled={disabled}
          placeholder="Nazwisko"
          value={addr.last_name}
          onChange={(e) => patchAddr({ last_name: e.target.value })}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>
      <input
        disabled={disabled}
        placeholder="Firma (opcjonalnie)"
        value={addr.company_name ?? ""}
        onChange={(e) => patchAddr({ company_name: e.target.value || null })}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
      />
      <div className="grid grid-cols-[1fr_5rem_5rem] gap-2">
        <input
          disabled={disabled}
          placeholder="Ulica"
          value={addr.street}
          onChange={(e) => patchAddr({ street: e.target.value })}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
        />
        <input
          disabled={disabled}
          placeholder="Nr"
          value={addr.house_number}
          onChange={(e) => patchAddr({ house_number: e.target.value })}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
        />
        <input
          disabled={disabled}
          placeholder="Lok."
          value={addr.apartment_number ?? ""}
          onChange={(e) => patchAddr({ apartment_number: e.target.value || null })}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>
      <div className="grid grid-cols-[7rem_1fr] gap-2">
        <input
          disabled={disabled}
          placeholder="Kod"
          value={addr.postal_code}
          onChange={(e) => patchAddr({ postal_code: e.target.value })}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
        />
        <input
          disabled={disabled}
          placeholder="Miejscowość"
          value={addr.city}
          onChange={(e) => patchAddr({ city: e.target.value })}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          disabled={disabled}
          placeholder="Telefon"
          value={addr.phone ?? ""}
          onChange={(e) => patchAddr({ phone: e.target.value || null })}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
        />
        <input
          disabled={disabled}
          placeholder="E-mail"
          value={addr.email ?? ""}
          onChange={(e) => patchAddr({ email: e.target.value || null })}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>
      <div className="grid grid-cols-[5rem_1fr] gap-2">
        <input
          disabled={disabled}
          placeholder="Kraj"
          value={addr.country_code}
          onChange={(e) => patchAddr({ country_code: e.target.value || "PL" })}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
        />
        <select
          disabled={disabled || methodsLoading}
          value={fulfillment.shipping_method_id ?? ""}
          onChange={(e) => onPatch({ shippingMethodId: e.target.value || null, clearShippingMethod: !e.target.value })}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          <option value="">{methodsLoading ? "Ładowanie…" : "Wybierz przewoźnika"}</option>
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <input
        disabled={disabled}
        placeholder="Punkt odbioru (opcjonalnie, jeśli wymaga metoda)"
        value={fulfillment.pickup_point_code ?? ""}
        onChange={(e) =>
          onPatch({
            pickupPointCode: e.target.value || null,
            pickupPointLabel: e.target.value || null,
          })
        }
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
      />
    </div>
  );
}
