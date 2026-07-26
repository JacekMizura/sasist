import { useEffect, useMemo, useState } from "react";
import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { createDamageReport, getDamageReport, listDamageEntries, listDamageReports } from "../../api/damageReportsApi";
import { generateDamageReportPDF } from "../../pdf/generateDamageReportPDF";
import type { DamageEntry, DamageReport } from "../../types/damageReport";
import { useWarehouse } from "../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "./damageShared";
import { Checkbox, Input, PrimaryButton, SecondaryButton, StatusBadge } from "../../design-system";
import {
  labelDamageDecision,
  labelDamageReportStatus,
  toneDamageDecision,
  toneDamageReportStatus,
} from "../../components/warehouse/magazyn/damageUiLabels";

function fmtPln(v: number): string {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 }).format(v);
}

export default function OfficeDamageReportsPage() {
  const { warehouse: activeWarehouse, showWarehouseSelector } = useWarehouse();
  const warehouseId = activeWarehouse?.id ?? null;
  const [rows, setRows] = useState<DamageEntry[]>([]);
  const [reports, setReports] = useState<DamageReport[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [createdBy, setCreatedBy] = useState("");
  const [loading, setLoading] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (warehouseId == null) return;
    void (async () => {
      setLoading(true);
      try {
        const [reviewed, list] = await Promise.all([
          listDamageEntries(DAMAGE_TENANT_ID, warehouseId, ["REVIEWED"]),
          listDamageReports(DAMAGE_TENANT_ID, warehouseId),
        ]);
        setRows(reviewed);
        setReports(list);
      } finally {
        setLoading(false);
      }
    })();
  }, [warehouseId]);

  const totalSelected = useMemo(
    () => rows.filter((r) => selectedIds.includes(r.id)).reduce((s, r) => s + Number(r.total_value || 0), 0),
    [rows, selectedIds]
  );

  return (
    <PageLayout>
      <PageHeader title="Biuro — Raporty szkód" />

      {showWarehouseSelector ? (
        <p className="mb-3 text-sm text-slate-600">
          Magazyn:{" "}
          <span className="font-semibold text-slate-800">{activeWarehouse?.name ?? "—"}</span>
        </p>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Osoba zgłaszająca</label>
          <Input
            density="comfortable"
            focusTone="brand"
            className="w-full max-w-sm"
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
          />
        </div>
        <PrimaryButton
          type="button"
          onClick={async () => {
            if (warehouseId == null) return;
            if (selectedIds.length === 0) {
              alert("Zaznacz szkody.");
              return;
            }
            await createDamageReport({
              tenant_id: DAMAGE_TENANT_ID,
              warehouse_id: warehouseId,
              created_by: createdBy || undefined,
              entry_ids: selectedIds,
            });
            const [reviewed, list] = await Promise.all([
              listDamageEntries(DAMAGE_TENANT_ID, warehouseId, ["REVIEWED"]),
              listDamageReports(DAMAGE_TENANT_ID, warehouseId),
            ]);
            setRows(reviewed);
            setReports(list);
            setSelectedIds([]);
          }}
        >
          Utwórz protokół
        </PrimaryButton>
      </div>

      <p className="mb-2 text-sm font-semibold text-slate-800">Zweryfikowane szkody</p>
      <p className="mb-2 text-sm text-slate-600">
        Wybrano: <span className="font-semibold text-slate-900">{selectedIds.length}</span>
        {" • "}
        Wartość: <span className="font-semibold text-slate-900">{fmtPln(totalSelected)}</span>
      </p>

      <div className="mb-8 overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left" />
              <th className="px-3 py-2 text-left font-semibold">Produkt</th>
              <th className="px-3 py-2 text-left font-semibold">Lokalizacja</th>
              <th className="px-3 py-2 text-right font-semibold">Ilość</th>
              <th className="px-3 py-2 text-left font-semibold">Decyzja</th>
              <th className="px-3 py-2 text-right font-semibold">Wartość</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={6}>
                  Ładowanie…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={6}>
                  Brak zweryfikowanych szkód.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={selectedIds.includes(r.id)}
                      onChange={(e) =>
                        setSelectedIds((prev) =>
                          e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id)
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2">{r.product_name}</td>
                  <td className="px-3 py-2">{r.location_label ?? r.location_uuid}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.quantity}</td>
                  <td className="px-3 py-2">
                    {r.decision ? (
                      <StatusBadge tone={toneDamageDecision(r.decision)} density="compact">
                        {labelDamageDecision(r.decision)}
                      </StatusBadge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {fmtPln(r.total_value)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mb-2 text-sm font-semibold text-slate-800">Raporty</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold">Nazwa</th>
              <th className="px-3 py-2.5 text-left font-semibold">Data</th>
              <th className="px-3 py-2.5 text-right font-semibold">Liczba pozycji</th>
              <th className="px-3 py-2.5 text-left font-semibold">Status</th>
              <th className="px-3 py-2.5 text-right font-semibold"> </th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={5}>
                  Brak raportów.
                </td>
              </tr>
            ) : (
              reports.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2.5 font-medium text-slate-800">{r.report_number}</td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {new Date(r.created_at).toLocaleString("pl-PL")}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.items?.length ?? 0}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge tone={toneDamageReportStatus(r.status)} density="compact">
                      {labelDamageReportStatus(r.status)}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <SecondaryButton
                      type="button"
                      density="compact"
                      disabled={pdfBusyId === r.id}
                      onClick={async () => {
                        setPdfBusyId(r.id);
                        try {
                          const full =
                            (r.items?.length ?? 0) > 0
                              ? r
                              : await getDamageReport(r.id, DAMAGE_TENANT_ID);
                          await generateDamageReportPDF(full);
                        } finally {
                          setPdfBusyId(null);
                        }
                      }}
                    >
                      Pobierz PDF
                    </SecondaryButton>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageLayout>
  );
}
