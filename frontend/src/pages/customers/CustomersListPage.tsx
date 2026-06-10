import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, Columns3, Download, Pencil, Table2, Trash2 } from "lucide-react";
import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { PanelBulkStatusConfirmModal } from "../../components/orders/panelList/PanelBulkStatusConfirmModal";
import { deleteCustomer, listCustomers, postCustomersBulkDelete, type CustomerListRow } from "../../api/customersApi";
import { CustomerListFiltersPanel } from "../../components/customers/customerList/CustomerListFiltersPanel";
import {
  DEFAULT_APPLIED_CUSTOMER_LIST_FILTERS,
  triStateToBool,
  type AppliedCustomerListFilters,
} from "../../components/customers/customerList/customerListFilterTypes";
import { UI_STRINGS } from "../../constants/uiStrings";
import { countryLabel } from "../../constants/countryCodes";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { summarizeEntityBulkDeleteToast } from "../../types/entityBulkDelete";
import { getCustomerDisplayName } from "../../utils/getCustomerDisplayName";
import {
  listSellasistToolbarSquareBtn,
  listSellasistToolbarToggleBtn,
} from "../../components/listPage/listSellasistTokens";
import ExportModal from "../../components/exports/ExportModal";
import {
  OperationalActionButton,
  OperationalActionColumn,
  operationalActionsColumnCellClass,
  operationalActionsColumnHeaderClass,
  operationalCheckboxColumnCellClass,
  operationalCheckboxColumnHeaderClass,
  panelListDenseCheckboxInputClass,
  panelListDenseRowClass,
  panelListDenseRowSelectedClass,
  panelListDenseTableClass,
  panelListDenseTableScrollWrapClass,
  panelListDenseTdBase,
  panelListDenseThBase,
  panelListDenseTheadClass,
} from "../../components/operational";

export default function CustomersListPage() {
  const navigate = useNavigate();
  const tenantId = DAMAGE_TENANT_ID;
  const [rows, setRows] = useState<CustomerListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    try {
      return localStorage.getItem("customers.list.filtersExpanded") === "1";
    } catch {
      return false;
    }
  });
  const [comfortableTableView, setComfortableTableView] = useState(false);
  const [draftFilters, setDraftFilters] = useState<AppliedCustomerListFilters>(DEFAULT_APPLIED_CUSTOMER_LIST_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AppliedCustomerListFilters>(DEFAULT_APPLIED_CUSTOMER_LIST_FILTERS);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<null | { kind: "bulk" } | { kind: "single"; id: number }>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const headerSelectAllRef = useRef<HTMLInputElement>(null);
  const openFilterFieldsRef = useRef<(() => void) | null>(null);

  const appliedFiltersKey = useMemo(() => JSON.stringify(appliedFilters), [appliedFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const af = appliedFilters;
      setRows(
        await listCustomers({
          tenant_id: tenantId,
          search: af.search.trim() || undefined,
          country_code: af.countryCode.trim() || undefined,
          has_orders: triStateToBool(af.hasOrders),
          has_email: triStateToBool(af.hasEmail),
          has_phone: triStateToBool(af.hasPhone),
          created_from: af.dateFrom.trim() || undefined,
          created_to: af.dateTo.trim() || undefined,
        }),
      );
    } catch {
      setErr("Nie udało się wczytać klientów.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, appliedFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelected(new Set());
  }, [appliedFiltersKey]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const visibleIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id));

  useLayoutEffect(() => {
    const el = headerSelectAllRef.current;
    if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [someVisibleSelected, allVisibleSelected]);

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => n.delete(id));
      } else {
        visibleIds.forEach((id) => n.add(id));
      }
      return n;
    });
  };

  const selectedIds = useMemo(() => Array.from(selected).sort((a, b) => a - b), [selected]);

  const toggleFiltersExpanded = () => {
    setFiltersExpanded((prev) => {
      const n = !prev;
      try {
        localStorage.setItem("customers.list.filtersExpanded", n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
  };

  const clearFilters = () => {
    setDraftFilters(DEFAULT_APPLIED_CUSTOMER_LIST_FILTERS);
    setAppliedFilters(DEFAULT_APPLIED_CUSTOMER_LIST_FILTERS);
  };

  const runDelete = async () => {
    if (deleteConfirm == null) return;
    setDeleteBusy(true);
    setErr(null);
    try {
      if (deleteConfirm.kind === "bulk") {
        const ids = selectedIds.filter((id) => visibleIds.includes(id));
        if (ids.length === 0) {
          setDeleteConfirm(null);
          return;
        }
        const res = await postCustomersBulkDelete({ tenant_id: tenantId, ids });
        if (res.errors?.length) {
          setErr(res.errors.join(" "));
        } else {
          setDeleteConfirm(null);
          setSelected(new Set());
          await load();
          setToast(summarizeEntityBulkDeleteToast(res));
        }
      } else {
        const res = await deleteCustomer(deleteConfirm.id, tenantId);
        if (res.errors?.length) {
          setErr(res.errors.join(" "));
        } else {
          setDeleteConfirm(null);
          setSelected((prev) => {
            const n = new Set(prev);
            n.delete(deleteConfirm.id);
            return n;
          });
          await load();
          setToast(summarizeEntityBulkDeleteToast(res));
        }
      }
    } catch {
      setErr("Nie udało się usunąć klienta.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const dataTdComfort = comfortableTableView ? "!py-3" : "";

  return (
    <>
      <PageLayout fullBleed>
          <PageHeader
            title={`Lista klientów${loading ? "" : ` (${rows.length} wyników)`}`}
            breadcrumbs={[
              { label: UI_STRINGS.navigation.customersList, to: "/customers" },
              { label: "Lista" },
            ]}
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={toggleFiltersExpanded}
                  className={listSellasistToolbarToggleBtn}
                  aria-expanded={filtersExpanded}
                >
                  {filtersExpanded ? "Ukryj filtry" : "Pokaż filtry"}
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  onClick={() => openFilterFieldsRef.current?.()}
                  className={listSellasistToolbarSquareBtn}
                  title="Widoczne pola filtrów"
                  aria-label="Widoczne pola filtrów"
                >
                  <Columns3 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setComfortableTableView((v) => !v)}
                  className={`${listSellasistToolbarSquareBtn} ${comfortableTableView ? "border-slate-400 bg-slate-50" : ""}`}
                  title={comfortableTableView ? "Widok zwarty" : "Widok wygodniejszy"}
                  aria-label={comfortableTableView ? "Widok zwarty" : "Widok wygodniejszy"}
                  aria-pressed={comfortableTableView}
                >
                  <Table2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setExportOpen(true)}
                  className={listSellasistToolbarSquareBtn}
                  title="Eksport CSV"
                  aria-label="Eksport CSV"
                >
                  <Download className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                </button>
              </div>
            }
          />

          {err && !loading && rows.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{err}</div>
          )}

          <CustomerListFiltersPanel
            expanded={filtersExpanded}
            onToggleExpanded={toggleFiltersExpanded}
            draft={draftFilters}
            onChangeDraft={(patch) => setDraftFilters((d) => ({ ...d, ...patch }))}
            onApply={applyFilters}
            onClear={clearFilters}
            filterLayout="embedded"
            openFilterFieldsRef={openFilterFieldsRef}
          />

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 py-1">
              <span className="text-sm font-semibold text-slate-900">Zaznaczono: {selectedIds.length}</span>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteConfirm({ kind: "bulk" })}
                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Usuń zaznaczone
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setSelected(new Set())}
                className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Odznacz wszystko
              </button>
            </div>
          )}

          {loading ? (
            <div className="space-y-2 py-8" aria-busy="true" aria-label="Ładowanie listy klientów">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-slate-100" />
              ))}
            </div>
          ) : err ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-8 text-center">
              <p className="text-sm font-medium text-amber-900">{err}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-4 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100"
              >
                Spróbuj ponownie
              </button>
            </div>
          ) : (
            <div className="min-w-0 overflow-hidden">
              <div className={panelListDenseTableScrollWrapClass}>
                <table className={panelListDenseTableClass}>
                  <thead className={panelListDenseTheadClass}>
                    <tr>
                      <th className={operationalCheckboxColumnHeaderClass}>
                        <input
                          ref={headerSelectAllRef}
                          type="checkbox"
                          checked={allVisibleSelected}
                          disabled={deleteBusy || rows.length === 0}
                          onChange={toggleAllVisible}
                          className={panelListDenseCheckboxInputClass}
                          aria-label="Zaznacz wszystkich widocznych klientów"
                        />
                      </th>
                      <th className={operationalActionsColumnHeaderClass}>Akcje</th>
                      <th className={`${panelListDenseThBase} text-left`}>Imię i nazwisko / firma</th>
                      <th className={`${panelListDenseThBase} text-left`}>E-mail</th>
                      <th className={`${panelListDenseThBase} text-left`}>Telefon</th>
                      <th className={`${panelListDenseThBase} text-left`}>NIP</th>
                      <th className={`${panelListDenseThBase} text-left`}>Kraj</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className={`${panelListDenseTdBase} py-10 text-center text-slate-600`}>
                          <p className="text-sm">Brak klientów.</p>
                          <Link
                            to="/customers/new"
                            className="mt-4 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                          >
                            {UI_STRINGS.navigation.addCustomer}
                          </Link>
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => (
                        <tr
                          key={r.id}
                          className={`${panelListDenseRowClass} ${selected.has(r.id) ? panelListDenseRowSelectedClass : ""}`}
                          onClick={() => navigate(`/customers/${r.id}`)}
                        >
                          <td
                            className={`${operationalCheckboxColumnCellClass} text-center`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(r.id)}
                              disabled={deleteBusy}
                              onChange={() => toggleOne(r.id)}
                              className={panelListDenseCheckboxInputClass}
                              aria-label={`Zaznacz klienta ${getCustomerDisplayName(r)}`}
                            />
                          </td>
                          <td className={operationalActionsColumnCellClass} onClick={(e) => e.stopPropagation()}>
                            <OperationalActionColumn
                              aria-label="Akcje klienta"
                              slots={[
                                <OperationalActionButton
                                  key="edit"
                                  title="Edytuj klienta"
                                  aria-label="Edytuj klienta"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/customers/${r.id}`);
                                  }}
                                >
                                  <Pencil className="text-slate-600" strokeWidth={2} aria-hidden />
                                </OperationalActionButton>,
                                <OperationalActionButton
                                  key="del"
                                  variant="danger"
                                  disabled={deleteBusy}
                                  title="Usuń lub zarchiwizuj klienta"
                                  aria-label="Usuń klienta"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirm({ kind: "single", id: r.id });
                                  }}
                                >
                                  <Trash2 strokeWidth={2} aria-hidden />
                                </OperationalActionButton>,
                              ]}
                            />
                          </td>
                          <td className={`${panelListDenseTdBase} font-medium text-slate-900 ${dataTdComfort}`}>
                            {getCustomerDisplayName(r)}
                          </td>
                          <td className={`${panelListDenseTdBase} text-slate-700 ${dataTdComfort}`}>{r.email?.trim() || "—"}</td>
                          <td className={`${panelListDenseTdBase} text-slate-700 ${dataTdComfort}`}>{r.phone?.trim() || "—"}</td>
                          <td className={`${panelListDenseTdBase} text-slate-700 ${dataTdComfort}`}>{r.nip?.trim() || "—"}</td>
                          <td className={`${panelListDenseTdBase} text-slate-700 ${dataTdComfort}`}>
                            {countryLabel(r.country_code)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
      </PageLayout>

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tenantId={tenantId}
        entityType="customers"
        selectedIds={selectedIds.length > 0 ? selectedIds : []}
        fallbackIds={visibleIds}
      />

      <PanelBulkStatusConfirmModal
        open={deleteConfirm != null}
        variant="danger"
        title={deleteConfirm?.kind === "bulk" ? "Usuń zaznaczonych klientów" : "Usuń klienta"}
        message="Czy na pewno usunąć?"
        subMessage="Powiązane rekordy zostaną zarchiwizowane."
        confirmLabel="Usuń"
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setDeleteConfirm(null);
        }}
        onConfirm={() => void runDelete()}
      />

      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[90] max-w-lg -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-950 shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
