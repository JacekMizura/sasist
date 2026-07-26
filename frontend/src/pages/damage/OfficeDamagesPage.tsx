import { useEffect, useMemo, useState } from "react";
import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { listDamageEntries, reviewDamageEntry } from "../../api/damageReportsApi";
import { resolveDamageMediaUrl } from "../../utils/resolveDamageMediaUrl";
import type { DamageDecision, DamageEntry, DamageType } from "../../types/damageReport";
import { useWarehouse } from "../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "./damageShared";
import { AppOverlayPortal } from "../../components/overlay";
import {
  Input,
  PrimaryButton,
  Select,
  StatusBadge,
  Textarea,
} from "../../design-system";
import {
  DAMAGE_DECISION_OPTIONS,
  DAMAGE_TYPE_OPTIONS,
  labelDamageDecision,
  labelDamageEntryStatus,
  toneDamageDecision,
  toneDamageEntryStatus,
} from "../../components/warehouse/magazyn/damageUiLabels";

export default function OfficeDamagesPage() {
  const { warehouse: activeWarehouse, warehouses, showWarehouseSelector } = useWarehouse();
  const warehouseId = activeWarehouse?.id ?? null;
  const [rows, setRows] = useState<DamageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<DamageEntry | null>(null);
  const [damageType, setDamageType] = useState<DamageType>("mechanical");
  const [description, setDescription] = useState("");
  const [decision, setDecision] = useState<DamageDecision>("REPAIR");
  const [reviewedBy, setReviewedBy] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "NEW" | "REVIEWED">("all");

  useEffect(() => {
    if (warehouseId == null) return;
    void (async () => {
      setLoading(true);
      try {
        const data = await listDamageEntries(DAMAGE_TENANT_ID, warehouseId, ["NEW", "REVIEWED"]);
        setRows(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [warehouseId]);

  const warehouseName = useMemo(
    () => activeWarehouse?.name ?? warehouses.find((w) => w.id === warehouseId)?.name ?? "—",
    [activeWarehouse?.name, warehouses, warehouseId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${r.product_name} ${r.sku ?? ""} ${r.location_label ?? ""} ${r.location_uuid}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, statusFilter]);

  return (
    <PageLayout>
      <PageHeader title="Biuro — Szkody" />
      {showWarehouseSelector ? (
        <p className="mb-3 text-sm text-slate-600">
          Magazyn: <span className="font-semibold text-slate-800">{warehouseName}</span>
        </p>
      ) : null}

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_11rem]">
        <Input
          density="comfortable"
          focusTone="brand"
          className="w-full"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Szukaj produktu…"
        />
        <Select
          density="comfortable"
          focusTone="brand"
          className="w-full"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "NEW" | "REVIEWED")}
        >
          <option value="all">Wszystkie</option>
          <option value="NEW">Nowe</option>
          <option value="REVIEWED">Zweryfikowane</option>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Produkt</th>
              <th className="px-3 py-2 text-right font-semibold">Ilość</th>
              <th className="px-3 py-2 text-left font-semibold">Lokalizacja</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-3 py-2 text-left font-semibold">Decyzja</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={5}>
                  Ładowanie…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={5}>
                  Brak wpisów.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => {
                    setSelected(r);
                    setDamageType((r.damage_type ?? "mechanical") as DamageType);
                    setDescription(r.description ?? "");
                    setDecision((r.decision ?? "REPAIR") as DamageDecision);
                  }}
                >
                  <td className="px-3 py-2">{r.product_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.quantity}</td>
                  <td className="px-3 py-2">{r.location_label ?? r.location_uuid}</td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={toneDamageEntryStatus(r.status)} density="compact">
                      {labelDamageEntryStatus(r.status)}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-2">
                    {r.decision ? (
                      <StatusBadge tone={toneDamageDecision(r.decision)} density="compact">
                        {labelDamageDecision(r.decision)}
                      </StatusBadge>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <AppOverlayPortal>
          <div className="fixed inset-0 z-[90] bg-black/30" onClick={() => setSelected(null)}>
            <aside
              className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{selected.product_name}</h3>
                  <p className="text-xs text-slate-500">
                    {selected.sku || "—"} • {selected.location_label ?? selected.location_uuid} •{" "}
                    {warehouseName}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
                  onClick={() => setSelected(null)}
                >
                  Zamknij
                </button>
              </div>

              <div className="mb-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {(selected.photo_urls?.length ? selected.photo_urls : [selected.photo_url])
                  .filter(Boolean)
                  .map((url, i) => (
                    <img
                      key={i}
                      src={resolveDamageMediaUrl(url)}
                      alt={i === 0 ? "Zdjęcie szkody" : `Zdjęcie szkody ${i + 1}`}
                      className="max-h-72 w-full rounded-md bg-white object-contain"
                    />
                  ))}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Typ szkody</label>
                  <Select
                    density="comfortable"
                    focusTone="brand"
                    className="w-full"
                    value={damageType}
                    onChange={(e) => setDamageType(e.target.value as DamageType)}
                  >
                    {DAMAGE_TYPE_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Opis</label>
                  <Textarea
                    density="comfortable"
                    focusTone="brand"
                    className="w-full"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Decyzja</label>
                  <Select
                    density="comfortable"
                    focusTone="brand"
                    className="w-full"
                    value={decision}
                    onChange={(e) => setDecision(e.target.value as DamageDecision)}
                  >
                    {DAMAGE_DECISION_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Zweryfikował</label>
                  <Input
                    density="comfortable"
                    focusTone="brand"
                    className="w-full"
                    value={reviewedBy}
                    onChange={(e) => setReviewedBy(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <PrimaryButton
                    type="button"
                    onClick={async () => {
                      const reviewed = await reviewDamageEntry(selected.id, DAMAGE_TENANT_ID, {
                        damage_type: damageType,
                        description: description || undefined,
                        decision,
                        reviewed_by: reviewedBy || undefined,
                      });
                      setRows((prev) => prev.map((x) => (x.id === reviewed.id ? reviewed : x)));
                      setSelected(reviewed);
                    }}
                  >
                    Zweryfikuj
                  </PrimaryButton>
                </div>
              </div>
            </aside>
          </div>
        </AppOverlayPortal>
      )}
    </PageLayout>
  );
}
