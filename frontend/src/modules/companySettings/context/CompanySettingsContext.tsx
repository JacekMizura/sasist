import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import toast from "react-hot-toast";

import {
  deleteCompanyLogo,
  fetchCompanyProfile,
  postCompanyLogo,
  putCompanyProfile,
  type CompanyProfileDto,
} from "../../../api/companyProfileApi";
import {
  fetchFulfillmentConfiguration,
  patchFulfillmentConfiguration,
  type FulfillmentAssignmentMode,
} from "../../../api/fulfillmentConfigurationApi";
import {
  warehouseService,
  type TenantDto,
  type TenantWarehouseAssignment,
  type Warehouse,
} from "../../../services/warehouseService";
import {
  COMPANY_TENANT_ID,
  dtoToForm,
  formToPayload,
  isAllowedLogoFile,
  LOGO_MAX_BYTES,
  type CompanyFormState,
} from "../companySettingsUtils";

type CompanySettingsContextValue = {
  tenantId: number;
  profile: CompanyProfileDto | null;
  form: CompanyFormState | null;
  setForm: React.Dispatch<React.SetStateAction<CompanyFormState | null>>;
  profileLoading: boolean;
  profileErr: string | null;
  profileDirty: boolean;
  profileSaving: boolean;
  saveProfile: () => Promise<void>;
  logoBusy: boolean;
  onLogoFiles: (files: FileList | null) => Promise<void>;
  removeLogo: () => Promise<void>;
  warehouses: Warehouse[];
  tenants: TenantDto[];
  assignments: TenantWarehouseAssignment[];
  structLoading: boolean;
  loadStructure: () => Promise<void>;
  createWarehouse: (name: string) => Promise<void>;
  createTenant: (name: string) => Promise<void>;
  createAssignment: (payload: {
    tenant_id: number;
    warehouse_id: number;
    role: string;
    is_default: boolean;
  }) => Promise<void>;
  setDefaultWarehouse: (assignmentId: number) => Promise<void>;
  saveWarehouseEdit: (payload: {
    warehouseId: number;
    name: string;
    requiresPutaway: boolean;
    assignmentId: number | null;
    participatesNetwork: boolean;
    fulfillmentEligible: boolean;
    fulfillmentPriority: number;
  }) => Promise<void>;
  fulfillmentMode: FulfillmentAssignmentMode;
  setFulfillmentMode: (mode: FulfillmentAssignmentMode) => void;
  consolidationWarehouseId: number | "";
  setConsolidationWarehouseId: (id: number | "") => void;
  fulfillmentModeDirty: boolean;
  fulfillmentCfgLoading: boolean;
  fulfillmentCfgSaving: boolean;
  saveFulfillmentConfiguration: () => Promise<void>;
  eligibleConsolidationWarehouses: { id: number; name: string }[];
  tenantById: (id: number) => string;
  warehouseById: (id: number) => string;
  assignmentForTenantWarehouse: (warehouseId: number) => TenantWarehouseAssignment | null;
  defaultWarehouseName: string;
};

const CompanySettingsContext = createContext<CompanySettingsContextValue | null>(null);

export function useCompanySettings() {
  const ctx = useContext(CompanySettingsContext);
  if (!ctx) throw new Error("useCompanySettings must be used within CompanySettingsProvider");
  return ctx;
}

export function CompanySettingsProvider({ children }: { children: ReactNode }) {
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [profile, setProfile] = useState<CompanyProfileDto | null>(null);
  const [form, setForm] = useState<CompanyFormState | null>(null);
  const [baseline, setBaseline] = useState<CompanyFormState | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [tenants, setTenants] = useState<TenantDto[]>([]);
  const [assignments, setAssignments] = useState<TenantWarehouseAssignment[]>([]);
  const [structLoading, setStructLoading] = useState(false);

  const [fulfillmentMode, setFulfillmentMode] = useState<FulfillmentAssignmentMode>("DEFAULT_WAREHOUSE");
  const [fulfillmentModeBaseline, setFulfillmentModeBaseline] =
    useState<FulfillmentAssignmentMode>("DEFAULT_WAREHOUSE");
  const [consolidationWarehouseId, setConsolidationWarehouseId] = useState<number | "">("");
  const [consolidationWarehouseBaseline, setConsolidationWarehouseBaseline] = useState<number | "">("");
  const [fulfillmentCfgLoading, setFulfillmentCfgLoading] = useState(false);
  const [fulfillmentCfgSaving, setFulfillmentCfgSaving] = useState(false);

  const applyDto = useCallback((d: CompanyProfileDto) => {
    setProfile(d);
    const f = dtoToForm(d);
    setForm(f);
    setBaseline(f);
  }, []);

  const loadProfile = useCallback(async () => {
    setProfileErr(null);
    setProfileLoading(true);
    try {
      const d = await fetchCompanyProfile(COMPANY_TENANT_ID);
      applyDto(d);
    } catch {
      setProfileErr("Nie udało się wczytać profilu firmy.");
      setProfile(null);
      setForm(null);
      setBaseline(null);
    } finally {
      setProfileLoading(false);
    }
  }, [applyDto]);

  const loadStructure = useCallback(async () => {
    setStructLoading(true);
    setFulfillmentCfgLoading(true);
    try {
      const [wRes, tRes, aRes, fcRes] = await Promise.all([
        warehouseService.getAllWarehouses(),
        warehouseService.listTenants(),
        warehouseService.getAssignments(),
        fetchFulfillmentConfiguration(COMPANY_TENANT_ID).catch(() => null),
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
    void loadProfile();
  }, [loadProfile]);

  const profileDirty = useMemo(() => {
    if (!form || !baseline) return false;
    return JSON.stringify(form) !== JSON.stringify(baseline);
  }, [form, baseline]);

  const saveProfile = async () => {
    if (!form || profileSaving) return;
    setProfileSaving(true);
    setProfileErr(null);
    try {
      const next = await putCompanyProfile(COMPANY_TENANT_ID, formToPayload(form));
      applyDto(next);
      toast.success("Zapisano profil firmy.");
    } catch {
      setProfileErr("Nie udało się zapisać zmian.");
      toast.error("Błąd zapisu profilu firmy.");
    } finally {
      setProfileSaving(false);
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
    setProfileErr(null);
    try {
      const next = await postCompanyLogo(COMPANY_TENANT_ID, f);
      applyDto(next);
      toast.success("Logo zostało zaktualizowane.");
    } catch {
      setProfileErr("Nie udało się wgrać logo.");
      toast.error("Błąd wgrywania logo.");
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = async () => {
    if (logoBusy || !profile?.logo_url) return;
    if (!window.confirm("Usunąć logo firmy z profilu?")) return;
    setLogoBusy(true);
    setProfileErr(null);
    try {
      const next = await deleteCompanyLogo(COMPANY_TENANT_ID);
      applyDto(next);
      toast.success("Usunięto logo.");
    } catch {
      setProfileErr("Nie udało się usunąć logo.");
      toast.error("Błąd usuwania logo.");
    } finally {
      setLogoBusy(false);
    }
  };

  const tenantById = useCallback((id: number) => tenants.find((t) => t.id === id)?.name ?? `ID ${id}`, [tenants]);
  const warehouseById = useCallback(
    (id: number) => warehouses.find((w) => w.id === id)?.name ?? `ID ${id}`,
    [warehouses],
  );

  const assignmentForTenantWarehouse = useCallback(
    (warehouseId: number) =>
      assignments.find((a) => a.tenant_id === COMPANY_TENANT_ID && a.warehouse_id === warehouseId) ?? null,
    [assignments],
  );

  const defaultWarehouseName = useMemo(() => {
    const def = assignments.find((a) => a.tenant_id === COMPANY_TENANT_ID && a.is_default);
    return def ? warehouseById(def.warehouse_id) : "—";
  }, [assignments, warehouseById]);

  const fulfillmentModeDirty =
    fulfillmentMode !== fulfillmentModeBaseline || consolidationWarehouseId !== consolidationWarehouseBaseline;

  const eligibleConsolidationWarehouses = useMemo(
    () =>
      assignments
        .filter((a) => a.tenant_id === COMPANY_TENANT_ID && a.fulfillment_eligible !== false)
        .map((a) => warehouses.find((w) => w.id === a.warehouse_id))
        .filter((w): w is { id: number; name: string } => Boolean(w)),
    [assignments, warehouses],
  );

  const saveFulfillmentConfiguration = async () => {
    if (fulfillmentCfgSaving || !fulfillmentModeDirty) return;
    setFulfillmentCfgSaving(true);
    try {
      const next = await patchFulfillmentConfiguration(COMPANY_TENANT_ID, {
        fulfillment_assignment_mode: fulfillmentMode,
        consolidation_warehouse_id: consolidationWarehouseId === "" ? null : Number(consolidationWarehouseId),
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

  const createWarehouse = async (name: string) => {
    const nm = name.trim();
    if (!nm) return;
    try {
      await warehouseService.createWarehouseStandalone({ name: nm });
      toast.success("Dodano magazyn.");
      await loadStructure();
    } catch {
      toast.error("Nie udało się utworzyć magazynu.");
      throw new Error("create warehouse failed");
    }
  };

  const createTenant = async (name: string) => {
    const nm = name.trim();
    if (!nm) return;
    try {
      await warehouseService.createTenant(nm);
      toast.success("Dodano firmę.");
      await loadStructure();
    } catch {
      toast.error("Nie udało się utworzyć firmy.");
      throw new Error("create tenant failed");
    }
  };

  const createAssignment = async (payload: {
    tenant_id: number;
    warehouse_id: number;
    role: string;
    is_default: boolean;
  }) => {
    try {
      await warehouseService.createAssignment(payload);
      toast.success("Zapisano przypisanie.");
      await loadStructure();
    } catch {
      toast.error("Nie udało się utworzyć przypisania.");
      throw new Error("create assignment failed");
    }
  };

  const setDefaultWarehouse = async (assignmentId: number) => {
    try {
      await warehouseService.updateAssignment(assignmentId, { is_default: true });
      toast.success("Ustawiono magazyn domyślny.");
      await loadStructure();
    } catch {
      toast.error("Nie udało się ustawić magazynu domyślnego.");
    }
  };

  const saveWarehouseEdit = async (payload: {
    warehouseId: number;
    name: string;
    requiresPutaway: boolean;
    assignmentId: number | null;
    participatesNetwork: boolean;
    fulfillmentEligible: boolean;
    fulfillmentPriority: number;
  }) => {
    const nm = payload.name.trim();
    if (!nm) return;
    const priority = Number(payload.fulfillmentPriority);
    if (!Number.isFinite(priority) || priority < 1) {
      toast.error("Priorytet realizacji musi być liczbą ≥ 1.");
      throw new Error("invalid priority");
    }
    try {
      await warehouseService.updateWarehouse(payload.warehouseId, {
        name: nm,
        requires_putaway: payload.requiresPutaway,
      });
      if (payload.assignmentId != null) {
        await warehouseService.updateAssignment(payload.assignmentId, {
          participates_in_network_stock: payload.participatesNetwork,
          fulfillment_eligible: payload.fulfillmentEligible,
          fulfillment_priority: Math.round(priority),
        });
      }
      toast.success("Zaktualizowano magazyn.");
      await loadStructure();
    } catch (e: unknown) {
      const detail =
        e &&
        typeof e === "object" &&
        "response" in e &&
        (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Nie udało się zapisać magazynu.");
      throw new Error("save warehouse failed");
    }
  };

  const value: CompanySettingsContextValue = {
    tenantId: COMPANY_TENANT_ID,
    profile,
    form,
    setForm,
    profileLoading,
    profileErr,
    profileDirty,
    profileSaving,
    saveProfile,
    logoBusy,
    onLogoFiles,
    removeLogo,
    warehouses,
    tenants,
    assignments,
    structLoading,
    loadStructure,
    createWarehouse,
    createTenant,
    createAssignment,
    setDefaultWarehouse,
    saveWarehouseEdit,
    fulfillmentMode,
    setFulfillmentMode,
    consolidationWarehouseId,
    setConsolidationWarehouseId,
    fulfillmentModeDirty,
    fulfillmentCfgLoading,
    fulfillmentCfgSaving,
    saveFulfillmentConfiguration,
    eligibleConsolidationWarehouses,
    tenantById,
    warehouseById,
    assignmentForTenantWarehouse,
    defaultWarehouseName,
  };

  return <CompanySettingsContext.Provider value={value}>{children}</CompanySettingsContext.Provider>;
}
