import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Building2, ImageIcon, Landmark, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import toast from "react-hot-toast";

import {
  deleteCompanyLogo,
  fetchCompanyProfile,
  postCompanyLogo,
  putCompanyProfile,
  type CompanyProfileDto,
  type CompanyProfileUpdatePayload,
} from "../../api/companyProfileApi";
import { resolvePublicUploadUrl } from "../../components/admin/AvatarUploadField";
import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { isSuperRole } from "../../auth/isSuperRole";
import { useAuth } from "../../context/AuthContext";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import {
  fetchFulfillmentConfiguration,
  FULFILLMENT_ASSIGNMENT_MODE_OPTIONS,
  patchFulfillmentConfiguration,
  type FulfillmentAssignmentMode,
} from "../../api/fulfillmentConfigurationApi";
import {
  ASSIGNMENT_ROLE_LABELS,
  warehouseService,
  type TenantDto,
  type TenantWarehouseAssignment,
  type Warehouse,
} from "../../services/warehouseService";

const TENANT_ID = DAMAGE_TENANT_ID;
const LOGO_MAX_BYTES = 6 * 1024 * 1024;

const TABS = [
  { id: "firma", label: "Dane firmy" },
  { id: "magazyny", label: "Magazyny" },
  { id: "tenanty", label: "Firmy i przypisania" },
  { id: "branding", label: "Branding" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const inp =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100";
const lab = "block text-xs font-semibold uppercase tracking-wide text-slate-500";
const card =
  "rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6";
const cardTitle = "text-base font-bold tracking-tight text-slate-900";

type FormState = {
  company_name: string;
  street: string;
  building_number: string;
  apartment_number: string;
  postal_code: string;
  city: string;
  country: string;
  nip: string;
  regon: string;
  address_extra_line: string;
  bank_name: string;
  iban: string;
  bic_swift: string;
  document_email: string;
  company_phone: string;
  website_url: string;
};

function dtoToForm(d: CompanyProfileDto): FormState {
  const s = (v: string | null | undefined) => (v ?? "").trim();
  return {
    company_name: s(d.company_name),
    street: s(d.street),
    building_number: s(d.building_number),
    apartment_number: s(d.apartment_number),
    postal_code: s(d.postal_code),
    city: s(d.city),
    country: s(d.country),
    nip: s(d.nip),
    regon: s(d.regon),
    address_extra_line: s(d.address_extra_line),
    bank_name: s(d.bank_name),
    iban: s(d.iban),
    bic_swift: s(d.bic_swift),
    document_email: s(d.document_email),
    company_phone: s(d.company_phone),
    website_url: s(d.website_url),
  };
}

function trimOrNull(v: string): string | null {
  const t = v.trim();
  return t.length ? t : null;
}

function formToPayload(f: FormState): CompanyProfileUpdatePayload {
  return {
    company_name: trimOrNull(f.company_name),
    street: trimOrNull(f.street),
    building_number: trimOrNull(f.building_number),
    apartment_number: trimOrNull(f.apartment_number),
    postal_code: trimOrNull(f.postal_code),
    city: trimOrNull(f.city),
    country: trimOrNull(f.country),
    nip: trimOrNull(f.nip),
    regon: trimOrNull(f.regon),
    address_extra_line: trimOrNull(f.address_extra_line),
    bank_name: trimOrNull(f.bank_name),
    iban: trimOrNull(f.iban),
    bic_swift: trimOrNull(f.bic_swift),
    document_email: trimOrNull(f.document_email),
    company_phone: trimOrNull(f.company_phone),
    website_url: trimOrNull(f.website_url),
  };
}

function isAllowedLogoFile(f: File): boolean {
  const t = f.type.toLowerCase();
  return t === "image/png" || t === "image/jpeg" || t === "image/svg+xml";
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className ?? ""}`}>
      <span className={lab}>{label}</span>
      {children}
    </label>
  );
}

function fmtDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function warehouseTypeLabel(t: string | null | undefined): string {
  if (!t) return "—";
  if (t === "own") return "Własny";
  if (t === "fulfilment" || t === "fulfillment") return "Fulfillment";
  return t;
}

function roleLabel(role: string): string {
  return ASSIGNMENT_ROLE_LABELS[role] ?? role;
}

export default function CompanySettingsPage() {
  const { user, loading: authLoading, hasPermission, sessionReady } = useAuth();
  const canEdit =
    hasPermission("settings.users") || hasPermission("settings.company") || isSuperRole(user?.role ?? "");
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("zakladka");
  const activeTab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "firma";
  const setTab = (id: TabId) => {
    setSearchParams(id === "firma" ? {} : { zakladka: id }, { replace: true });
  };

  const logoInputId = useId();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [profile, setProfile] = useState<CompanyProfileDto | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [baseline, setBaseline] = useState<FormState | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [tenants, setTenants] = useState<TenantDto[]>([]);
  const [assignments, setAssignments] = useState<TenantWarehouseAssignment[]>([]);
  const [structLoading, setStructLoading] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [newTenantName, setNewTenantName] = useState("");
  const [assignTenantId, setAssignTenantId] = useState<number | null>(null);
  const [assignWarehouseId, setAssignWarehouseId] = useState<number | null>(null);
  const [assignRole, setAssignRole] = useState<string>("operator");
  const [assignIsDefault, setAssignIsDefault] = useState(false);
  const [editWh, setEditWh] = useState<Warehouse | null>(null);
  const [editWhName, setEditWhName] = useState("");
  const [editWhAssignmentId, setEditWhAssignmentId] = useState<number | null>(null);
  const [editParticipatesNetwork, setEditParticipatesNetwork] = useState(true);
  const [editFulfillmentEligible, setEditFulfillmentEligible] = useState(true);
  const [editFulfillmentPriority, setEditFulfillmentPriority] = useState(100);
  const [editWhSaving, setEditWhSaving] = useState(false);

  const [fulfillmentMode, setFulfillmentMode] = useState<FulfillmentAssignmentMode>("DEFAULT_WAREHOUSE");
  const [fulfillmentModeBaseline, setFulfillmentModeBaseline] =
    useState<FulfillmentAssignmentMode>("DEFAULT_WAREHOUSE");
  const [consolidationWarehouseId, setConsolidationWarehouseId] = useState<number | "">("");
  const [consolidationWarehouseBaseline, setConsolidationWarehouseBaseline] = useState<number | "">("");
  const [fulfillmentCfgLoading, setFulfillmentCfgLoading] = useState(false);
  const [fulfillmentCfgSaving, setFulfillmentCfgSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const d = await fetchCompanyProfile(TENANT_ID);
      setProfile(d);
      const f = dtoToForm(d);
      setForm(f);
      setBaseline(f);
    } catch {
      setErr("Nie udało się wczytać profilu firmy.");
      setProfile(null);
      setForm(null);
      setBaseline(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStructure = useCallback(async () => {
    setStructLoading(true);
    setFulfillmentCfgLoading(true);
    try {
      const [wRes, tRes, aRes, fcRes] = await Promise.all([
        warehouseService.getAllWarehouses(),
        warehouseService.listTenants(),
        warehouseService.getAssignments(),
        fetchFulfillmentConfiguration(TENANT_ID).catch(() => null),
      ]);
      setWarehouses(Array.isArray(wRes.data) ? wRes.data : []);
      setTenants(Array.isArray(tRes.data) ? tRes.data : []);
      setAssignments(Array.isArray(aRes.data) ? aRes.data : []);
      if (fcRes?.fulfillment_assignment_mode) {
        setFulfillmentMode(fcRes.fulfillment_assignment_mode);
        setFulfillmentModeBaseline(fcRes.fulfillment_assignment_mode);
      }
      const cw = fcRes?.consolidation_warehouse_id ?? null;
      setConsolidationWarehouseId(cw != null && cw > 0 ? cw : "");
      setConsolidationWarehouseBaseline(cw != null && cw > 0 ? cw : "");
    } catch {
      toast.error("Nie udało się wczytać magazynów lub firm.");
    } finally {
      setStructLoading(false);
      setFulfillmentCfgLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canEdit) {
      setLoading(false);
      return;
    }
    if (!sessionReady) return;
    void loadProfile();
  }, [canEdit, loadProfile, sessionReady]);

  useEffect(() => {
    if (!canEdit || !sessionReady) return;
    if (activeTab === "magazyny" || activeTab === "tenanty") void loadStructure();
  }, [activeTab, canEdit, loadStructure, sessionReady]);

  const dirty = useMemo(() => {
    if (!form || !baseline) return false;
    return JSON.stringify(form) !== JSON.stringify(baseline);
  }, [form, baseline]);

  const applyDto = useCallback((d: CompanyProfileDto) => {
    setProfile(d);
    const f = dtoToForm(d);
    setForm(f);
    setBaseline(f);
  }, []);

  const save = async () => {
    if (!form || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const next = await putCompanyProfile(TENANT_ID, formToPayload(form));
      applyDto(next);
      toast.success("Zapisano profil firmy.");
    } catch {
      setErr("Nie udało się zapisać zmian.");
      toast.error("Błąd zapisu profilu firmy.");
    } finally {
      setSaving(false);
    }
  };

  const onLogoFiles = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f || logoBusy) return;
    if (!isAllowedLogoFile(f)) {
      toast.error("Dozwolone formaty: PNG, JPG, SVG.");
      return;
    }
    if (f.size > LOGO_MAX_BYTES) {
      toast.error("Plik jest za duży (max 6 MB).");
      return;
    }
    setLogoBusy(true);
    setErr(null);
    try {
      const next = await postCompanyLogo(TENANT_ID, f);
      applyDto(next);
      toast.success("Logo zostało zaktualizowane.");
    } catch {
      setErr("Nie udało się wgrać logo.");
      toast.error("Błąd wgrywania logo.");
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = async () => {
    if (logoBusy || !profile?.logo_url) return;
    if (!window.confirm("Usunąć logo firmy z profilu?")) return;
    setLogoBusy(true);
    setErr(null);
    try {
      const next = await deleteCompanyLogo(TENANT_ID);
      applyDto(next);
      toast.success("Usunięto logo.");
    } catch {
      setErr("Nie udało się usunąć logo.");
      toast.error("Błąd usuwania logo.");
    } finally {
      setLogoBusy(false);
    }
  };

  const tenantById = (id: number) => tenants.find((t) => t.id === id)?.name ?? `ID ${id}`;
  const warehouseById = (id: number) => warehouses.find((w) => w.id === id)?.name ?? `ID ${id}`;

  const assignmentForTenantWarehouse = (warehouseId: number) =>
    assignments.find((a) => a.tenant_id === TENANT_ID && a.warehouse_id === warehouseId) ?? null;

  const openWarehouseEdit = (w: Warehouse) => {
    const assignment = assignmentForTenantWarehouse(w.id);
    setEditWh(w);
    setEditWhName(w.name);
    setEditWhAssignmentId(assignment?.id ?? null);
    setEditParticipatesNetwork(assignment?.participates_in_network_stock ?? true);
    setEditFulfillmentEligible(assignment?.fulfillment_eligible ?? true);
    setEditFulfillmentPriority(assignment?.fulfillment_priority ?? 100);
  };

  const closeWarehouseEdit = () => {
    if (editWhSaving) return;
    setEditWh(null);
    setEditWhName("");
    setEditWhAssignmentId(null);
    setEditParticipatesNetwork(true);
    setEditFulfillmentEligible(true);
    setEditFulfillmentPriority(100);
  };

  const defaultTenantsForWarehouse = (wid: number) =>
    assignments.filter((a) => a.warehouse_id === wid && a.is_default).map((a) => tenantById(a.tenant_id));

  const fulfillmentModeDirty =
    fulfillmentMode !== fulfillmentModeBaseline ||
    consolidationWarehouseId !== consolidationWarehouseBaseline;

  const eligibleConsolidationWarehouses = useMemo(
    () =>
      assignments
        .filter((a) => a.tenant_id === TENANT_ID && a.fulfillment_eligible !== false)
        .map((a) => warehouses.find((w) => w.id === a.warehouse_id))
        .filter((w): w is { id: number; name: string } => Boolean(w)),
    [assignments, warehouses],
  );

  const saveFulfillmentConfiguration = async () => {
    if (fulfillmentCfgSaving || !fulfillmentModeDirty) return;
    setFulfillmentCfgSaving(true);
    try {
      const next = await patchFulfillmentConfiguration(TENANT_ID, {
        fulfillment_assignment_mode: fulfillmentMode,
        consolidation_warehouse_id:
          consolidationWarehouseId === "" ? null : Number(consolidationWarehouseId),
      });
      setFulfillmentMode(next.fulfillment_assignment_mode);
      setFulfillmentModeBaseline(next.fulfillment_assignment_mode);
      const cw = next.consolidation_warehouse_id ?? null;
      setConsolidationWarehouseId(cw != null && cw > 0 ? cw : "");
      setConsolidationWarehouseBaseline(cw != null && cw > 0 ? cw : "");
      toast.success("Zapisano strategię realizacji zamówień.");
    } catch {
      toast.error("Nie udało się zapisać strategii realizacji.");
    } finally {
      setFulfillmentCfgSaving(false);
    }
  };

  const createWarehouse = async () => {
    const nm = newWarehouseName.trim();
    if (!nm) return;
    try {
      await warehouseService.createWarehouseStandalone({ name: nm });
      setNewWarehouseName("");
      toast.success("Dodano magazyn.");
      await loadStructure();
    } catch {
      toast.error("Nie udało się utworzyć magazynu.");
    }
  };

  const createTenant = async () => {
    const nm = newTenantName.trim();
    if (!nm) return;
    try {
      await warehouseService.createTenant(nm);
      setNewTenantName("");
      toast.success("Dodano firmę.");
      await loadStructure();
    } catch {
      toast.error("Nie udało się utworzyć firmy.");
    }
  };

  const createAssignment = async () => {
    if (assignTenantId == null || assignWarehouseId == null) return;
    try {
      await warehouseService.createAssignment({
        tenant_id: assignTenantId,
        warehouse_id: assignWarehouseId,
        role: assignRole,
        is_default: assignIsDefault,
      });
      setAssignTenantId(null);
      setAssignWarehouseId(null);
      setAssignRole("operator");
      setAssignIsDefault(false);
      toast.success("Zapisano przypisanie.");
      await loadStructure();
    } catch {
      toast.error("Nie udało się utworzyć przypisania.");
    }
  };

  const saveWarehouseEdit = async () => {
    if (!editWh || editWhSaving) return;
    const nm = editWhName.trim();
    if (!nm) return;
    const priority = Number(editFulfillmentPriority);
    if (!Number.isFinite(priority) || priority < 1) {
      toast.error("Priorytet realizacji musi być liczbą ≥ 1.");
      return;
    }
    setEditWhSaving(true);
    try {
      await warehouseService.updateWarehouse(editWh.id, { name: nm });
      if (editWhAssignmentId != null) {
        await warehouseService.updateAssignment(editWhAssignmentId, {
          participates_in_network_stock: editParticipatesNetwork,
          fulfillment_eligible: editFulfillmentEligible,
          fulfillment_priority: Math.round(priority),
        });
      }
      closeWarehouseEdit();
      toast.success("Zaktualizowano magazyn.");
      await loadStructure();
    } catch {
      toast.error("Nie udało się zapisać magazynu.");
    } finally {
      setEditWhSaving(false);
    }
  };

  if (authLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center py-24 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
        </div>
      </PageLayout>
    );
  }

  if (!canEdit) {
    return <Navigate to="/" replace />;
  }

  const logoSrc = resolvePublicUploadUrl(profile?.logo_url ?? "");

  const tabNav = (
    <div className="flex min-w-0 flex-wrap gap-2 border-b border-slate-200 pb-1">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === t.id
              ? "bg-cyan-600 text-white shadow-sm"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  return (
    <PageLayout>
      <PageHeader
        title="Firma"
        subtitle="Profil organizacji, magazyny, przypisania firm do magazynów oraz branding. Serie dokumentów i szablony konfigurujesz w module dokumentów."
        breadcrumbs={[
          { label: "Ustawienia", to: "/settings/wms" },
          { label: "Firma" },
        ]}
        tabs={tabNav}
        actions={
          activeTab === "firma" ? (
            <button
              type="button"
              disabled={!form || !dirty || saving || loading}
              onClick={() => void save()}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Zapisz zmiany
            </button>
          ) : null
        }
      />

      <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-16 pt-4">
        {err ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{err}</div>
        ) : null}

        {activeTab === "firma" && (
          <>
            {dirty ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Masz niezapisane zmiany. Kliknij „Zapisz zmiany”, aby je utrwalić.
              </div>
            ) : null}
            {loading || !form ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-20 text-slate-500 shadow-sm">
                <Loader2 className="h-10 w-10 animate-spin text-cyan-600" aria-hidden />
                <p className="text-sm font-medium">Wczytywanie…</p>
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <section className={card}>
                  <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-inner">
                      <Building2 className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <h2 className={cardTitle}>Dane firmy</h2>
                      <p className="mt-1 text-sm text-slate-500">Dane rejestrowe i adres korespondencyjny.</p>
                    </div>
                  </div>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <Field label="Nazwa firmy" className="sm:col-span-2">
                      <input className={inp} value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
                    </Field>
                    <Field label="Ulica">
                      <input className={inp} value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
                    </Field>
                    <Field label="Nr domu">
                      <input className={inp} value={form.building_number} onChange={(e) => setForm({ ...form, building_number: e.target.value })} />
                    </Field>
                    <Field label="Nr lokalu">
                      <input className={inp} value={form.apartment_number} onChange={(e) => setForm({ ...form, apartment_number: e.target.value })} />
                    </Field>
                    <Field label="Kod pocztowy">
                      <input className={inp} value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
                    </Field>
                    <Field label="Miasto">
                      <input className={inp} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                    </Field>
                    <Field label="Kraj">
                      <input className={inp} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="np. Polska" />
                    </Field>
                    <Field label="NIP">
                      <input className={inp} value={form.nip} onChange={(e) => setForm({ ...form, nip: e.target.value })} />
                    </Field>
                    <Field label="REGON">
                      <input className={inp} value={form.regon} onChange={(e) => setForm({ ...form, regon: e.target.value })} />
                    </Field>
                    <Field label="Dodatkowa linia adresu" className="sm:col-span-2">
                      <input
                        className={inp}
                        value={form.address_extra_line}
                        onChange={(e) => setForm({ ...form, address_extra_line: e.target.value })}
                        placeholder="np. dział, budynek B"
                      />
                    </Field>
                  </div>
                </section>

                <section className={card}>
                  <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-inner">
                      <Landmark className="h-5 w-5 opacity-95" aria-hidden />
                    </span>
                    <div>
                      <h2 className={cardTitle}>Bank i kontakt</h2>
                      <p className="mt-1 text-sm text-slate-500">Dane rozliczeniowe i kontaktowe organizacji.</p>
                    </div>
                  </div>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <Field label="Nazwa banku" className="sm:col-span-2">
                      <input className={inp} value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
                    </Field>
                    <Field label="Numer konta / IBAN" className="sm:col-span-2">
                      <input className={inp} value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="PL…" />
                    </Field>
                    <Field label="BIC / SWIFT">
                      <input className={inp} value={form.bic_swift} onChange={(e) => setForm({ ...form, bic_swift: e.target.value })} />
                    </Field>
                    <Field label="E-mail do dokumentów">
                      <input type="email" className={inp} value={form.document_email} onChange={(e) => setForm({ ...form, document_email: e.target.value })} />
                    </Field>
                    <Field label="Telefon firmowy">
                      <input className={inp} value={form.company_phone} onChange={(e) => setForm({ ...form, company_phone: e.target.value })} />
                    </Field>
                    <Field label="Strona WWW" className="sm:col-span-2">
                      <input className={inp} value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} placeholder="https://…" />
                    </Field>
                  </div>
                </section>
              </div>
            )}
          </>
        )}

        {activeTab === "magazyny" && (
          <div className="space-y-6">
            <section className={card}>
              <h2 className={cardTitle}>Nowy magazyn</h2>
              <p className="mt-1 text-sm text-slate-500">Utwórz magazyn, a następnie przypisz go do firmy w zakładce „Firmy i przypisania”.</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1">
                  <span className={lab}>Nazwa magazynu</span>
                  <input
                    className={inp}
                    value={newWarehouseName}
                    onChange={(e) => setNewWarehouseName(e.target.value)}
                    placeholder="np. Magazyn centralny"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void createWarehouse()}
                  className="shrink-0 rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-cyan-700"
                >
                  Dodaj magazyn
                </button>
              </div>
            </section>

            <section className={card}>
              <h2 className={cardTitle}>Realizacja zamówień</h2>
              <p className="mt-1 text-sm text-slate-500">
                Strategia przypisania magazynu realizacji dla nowych zamówień. Szczegóły per magazyn (priorytet, flaga
                realizacji) edytujesz przy karcie magazynu poniżej.
              </p>
              {fulfillmentCfgLoading ? (
                <div className="mt-6 flex justify-center py-6 text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  <p className={lab}>Strategia przypisania magazynu</p>
                  {FULFILLMENT_ASSIGNMENT_MODE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                        fulfillmentMode === opt.value
                          ? "border-cyan-300 bg-cyan-50/60"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="fulfillment-assignment-mode"
                        className="mt-1 h-4 w-4 border-slate-300 text-cyan-600"
                        checked={fulfillmentMode === opt.value}
                        onChange={() => setFulfillmentMode(opt.value)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">{opt.label}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{opt.description}</span>
                        {opt.value === "AUTO_ATP_FUTURE" ? (
                          <span className="mt-1 block text-xs font-medium text-amber-800">
                            Funkcja zostanie aktywowana w późniejszym etapie wdrożenia.
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                  <div className="pt-2">
                    <p className={lab}>Magazyn konsolidacyjny (opcjonalnie)</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Preferowany magazyn docelowy przy konsolidacji wielomagazynowej. Puste = magazyn z resolvera /
                      najlepszy kandydat.
                    </p>
                    <select
                      className="mt-2 w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={consolidationWarehouseId === "" ? "" : String(consolidationWarehouseId)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setConsolidationWarehouseId(v === "" ? "" : Number(v));
                      }}
                    >
                      <option value="">— automatycznie (resolver) —</option>
                      {eligibleConsolidationWarehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => void saveFulfillmentConfiguration()}
                      disabled={!fulfillmentModeDirty || fulfillmentCfgSaving}
                      className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-cyan-700 disabled:opacity-50"
                    >
                      {fulfillmentCfgSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                      Zapisz strategię
                    </button>
                  </div>
                </div>
              )}
            </section>

            {structLoading ? (
              <div className="flex justify-center py-12 text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {warehouses.length === 0 ? (
                  <p className="text-sm text-slate-600 sm:col-span-2">Brak magazynów — dodaj pierwszy powyżej.</p>
                ) : (
                  warehouses.map((w) => {
                    const defaults = defaultTenantsForWarehouse(w.id);
                    return (
                      <div key={w.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-lg font-bold text-slate-900">{w.name}</p>
                            <p className="mt-1 text-xs font-medium text-slate-500">Identyfikator: {w.id}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openWarehouseEdit(w)}
                            className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                            title="Edytuj"
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                        <dl className="mt-4 space-y-2 text-sm">
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-500">Status / typ</dt>
                            <dd className="font-medium text-slate-800">{warehouseTypeLabel(w.type)}</dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-500">Utworzono</dt>
                            <dd className="font-medium text-slate-800">{fmtDateTime(w.created_at)}</dd>
                          </div>
                        </dl>
                        {defaults.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-1">
                            {defaults.map((tn) => (
                              <span
                                key={tn}
                                className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-bold text-cyan-900"
                              >
                                Domyślny: {tn}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-xs text-slate-400">Brak domyślnego przypisania dla tego magazynu.</p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "tenanty" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className={card}>
              <h2 className={cardTitle}>Firmy w systemie</h2>
              <p className="mt-1 text-sm text-slate-500">Osobny zapis firmy pozwala przypisać wiele magazynów i uprawnień.</p>
              {structLoading ? (
                <Loader2 className="mt-6 h-8 w-8 animate-spin text-slate-400" aria-hidden />
              ) : (
                <ul className="mt-4 space-y-2">
                  {tenants.length === 0 ? (
                    <li className="text-sm text-slate-500">Brak zdefiniowanych firm.</li>
                  ) : (
                    tenants.map((t) => (
                      <li key={t.id} className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm">
                        <span className="font-semibold text-slate-900">{t.name}</span>
                        <span className="ml-2 text-slate-500">ID {t.id}</span>
                        <span className="mt-1 block text-xs text-slate-500">Utworzono: {fmtDateTime(t.created_at)}</span>
                      </li>
                    ))
                  )}
                </ul>
              )}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1">
                  <span className={lab}>Nazwa nowej firmy</span>
                  <input className={inp} value={newTenantName} onChange={(e) => setNewTenantName(e.target.value)} placeholder="np. Nazwa spółki" />
                </label>
                <button
                  type="button"
                  onClick={() => void createTenant()}
                  className="shrink-0 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Dodaj firmę
                </button>
              </div>
            </section>

            <section className={card}>
              <h2 className={cardTitle}>Przypisania</h2>
              <p className="mt-1 text-sm text-slate-500">Powiązanie firmy z magazynem i rola dostępu. Domyślny magazyn jest używany przy starcie sesji.</p>
              {structLoading ? (
                <Loader2 className="mt-6 h-8 w-8 animate-spin text-slate-400" aria-hidden />
              ) : (
                <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                  {assignments.length === 0 ? (
                    <li className="text-sm text-slate-500">Brak przypisań.</li>
                  ) : (
                    assignments.map((a) => (
                      <li key={a.id} className="rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm shadow-sm">
                        <span className="font-medium text-slate-800">{tenantById(a.tenant_id)}</span>
                        <span className="text-slate-400"> → </span>
                        <span className="font-medium text-slate-800">{warehouseById(a.warehouse_id)}</span>
                        <span className="ml-2 text-xs text-slate-500">
                          {roleLabel(a.role)}
                          {a.is_default ? " · domyślny magazyn" : ""}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              )}
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <label>
                  <span className={lab}>Firma</span>
                  <select
                    className={inp}
                    value={assignTenantId ?? ""}
                    onChange={(e) => setAssignTenantId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— wybierz —</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={lab}>Magazyn</span>
                  <select
                    className={inp}
                    value={assignWarehouseId ?? ""}
                    onChange={(e) => setAssignWarehouseId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— wybierz —</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={lab}>Rola dostępu</span>
                  <select className={inp} value={assignRole} onChange={(e) => setAssignRole(e.target.value)}>
                    <option value="owner">Właściciel</option>
                    <option value="client">Klient</option>
                    <option value="operator">Operator</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600"
                    checked={assignIsDefault}
                    onChange={(e) => setAssignIsDefault(e.target.checked)}
                  />
                  <span className="text-sm text-slate-700">Domyślny magazyn dla tej firmy</span>
                </label>
              </div>
              <button
                type="button"
                disabled={assignTenantId == null || assignWarehouseId == null}
                onClick={() => void createAssignment()}
                className="mt-4 rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Dodaj przypisanie
              </button>
            </section>
          </div>
        )}

        {activeTab === "branding" && (
          <>
            {loading || !profile ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-cyan-600" aria-hidden />
              </div>
            ) : (
              <section className={card}>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white shadow-inner">
                      <ImageIcon className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <h2 className={cardTitle}>Logo firmy</h2>
                      <p className="mt-1 max-w-xl text-sm text-slate-500">
                        Logo używane w materiałach firmowych. Zalecany obszar ok.{" "}
                        <span className="font-semibold text-slate-700">240 × 80 px</span> (poziomo) — PNG lub SVG z
                        przezroczystym tłem.
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/settings/printers"
                    className="text-sm font-semibold text-cyan-700 hover:text-cyan-900 hover:underline"
                  >
                    Drukarki i kalibracja etykiet →
                  </Link>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-stretch">
                  <div
                    role="presentation"
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      void onLogoFiles(e.dataTransfer.files);
                    }}
                    className={`flex min-h-[220px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 transition ${
                      dragOver ? "border-cyan-500 bg-cyan-50/40 ring-2 ring-cyan-100" : "border-slate-200 bg-slate-50/40"
                    } ${logoBusy ? "pointer-events-none opacity-60" : ""}`}
                  >
                    {logoBusy ? (
                      <Loader2 className="h-10 w-10 animate-spin text-cyan-600" aria-hidden />
                    ) : (
                      <>
                        <Upload className="mb-3 h-10 w-10 text-slate-400" aria-hidden />
                        <p className="text-center text-sm font-semibold text-slate-800">Przeciągnij plik tutaj</p>
                        <p className="mt-1 text-center text-xs text-slate-500">PNG, JPG lub SVG · max 6 MB</p>
                        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                          <label
                            htmlFor={logoInputId}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:border-cyan-300"
                          >
                            <Upload className="h-4 w-4" aria-hidden />
                            Wybierz plik
                          </label>
                          {profile.logo_url ? (
                            <button
                              type="button"
                              onClick={() => void removeLogo()}
                              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                              Usuń logo
                            </button>
                          ) : null}
                        </div>
                        <input
                          id={logoInputId}
                          type="file"
                          accept="image/png,image/jpeg,image/svg+xml"
                          className="sr-only"
                          disabled={logoBusy}
                          onChange={(e) => {
                            void onLogoFiles(e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </>
                    )}
                  </div>

                  <div className="flex min-h-[220px] flex-col rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 shadow-inner">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Podgląd</p>
                    <div className="mt-4 flex flex-1 items-center justify-center rounded-xl border border-slate-200/80 bg-white p-6">
                      {profile.logo_url ? (
                        <img src={logoSrc} alt="Logo firmy" className="max-h-28 max-w-full object-contain" />
                      ) : (
                        <div className="text-center text-sm text-slate-400">Brak logo.</div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {editWh ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Edycja magazynu</h3>
            <p className="mt-1 text-sm text-slate-500">ID {editWh.id}</p>
            <label className="mt-4 block">
              <span className={lab}>Nazwa</span>
              <input className={inp} value={editWhName} onChange={(e) => setEditWhName(e.target.value)} />
            </label>

            <div className="mt-6 border-t border-slate-100 pt-5">
              <h4 className="text-sm font-bold text-slate-900">Sprzedaż i realizacja</h4>
              {editWhAssignmentId == null ? (
                <p className="mt-2 text-sm text-amber-800">
                  Brak przypisania magazynu do bieżącej firmy — ustawienia sieciowe zapiszesz po dodaniu przypisania w
                  zakładce „Firmy i przypisania”.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-cyan-600"
                      checked={editParticipatesNetwork}
                      onChange={(e) => setEditParticipatesNetwork(e.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800">Uwzględniaj w stanie sieciowym</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Magazyn uczestniczy w puli dostępnej online.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-cyan-600"
                      checked={editFulfillmentEligible}
                      onChange={(e) => setEditFulfillmentEligible(e.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800">Magazyn może realizować zamówienia</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Magazyn może zostać wybrany przez silnik sourcingu.
                      </span>
                    </span>
                  </label>
                  <label className="block">
                    <span className={lab}>Priorytet realizacji</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className={inp}
                      value={editFulfillmentPriority}
                      onChange={(e) => setEditFulfillmentPriority(Number(e.target.value) || 1)}
                    />
                    <span className="mt-1 block text-xs text-slate-500">Niższa wartość oznacza wyższy priorytet.</span>
                  </label>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeWarehouseEdit}
                disabled={editWhSaving}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => void saveWarehouseEdit()}
                disabled={editWhSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
              >
                {editWhSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Zapisz
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageLayout>
  );
}
