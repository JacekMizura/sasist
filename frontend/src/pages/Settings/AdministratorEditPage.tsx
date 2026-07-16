import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useLocation, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { 
  UserPlus, 
  ShieldCheck, 
  ArrowLeft, 
  Mail, 
  Phone, 
  Lock, 
  AlertCircle,
  ShieldAlert,
  Save,
  Trash2,
  Settings2,
  Fingerprint,
  History,
  Briefcase,
  Layers
} from "lucide-react";

import PermissionTreePanel from "../../components/admin/PermissionTreePanel";
import AvatarUploadField from "../../components/admin/AvatarUploadField";
import { builtinPresetLabel } from "../../components/admin/permissionPresetLabels";
import {
  createCustomPermissionPreset,
  createUser,
  deleteCustomPermissionPreset,
  fetchUsers,
  fetchAuditLogs,
  fetchCustomPermissionPresets,
  fetchPermissionCatalog,
  fetchUser,
  updateUser,
  extractApiErrorMessage,
  type AppUserListItem,
  type AuditLogItem,
  type MeResponse,
  type PermissionCatalogResponse,
  type PermissionPresetDto,
  type WmsProfilePayload,
} from "../../api/authApi";
import { PageContainer } from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { isSuperRole } from "../../auth/isSuperRole";
import { PLATFORM_ROLE_OPTIONS } from "../../settings/platformRoles";
import { warehouseService, type Warehouse } from "../../services/warehouseService";
import UserPanelStatusMatrix from "../../components/admin/UserPanelStatusMatrix";
import { fetchEmployeeCostProfile, putEmployeeCostProfile } from "../../api/workforceApi";
import { fetchWorkforceUserGroups, type WorkforceUserGroupDto } from "../../api/workforceGroupsApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { WMS_OPERATIONAL_MODE_KEYS, WMS_OPERATIONAL_MODE_LABELS_PL } from "../../constants/wmsOperationalModes";
import {
  auditDetailLines,
  humanizeAuditAction,
  humanizeEntityType,
  humanizeModule,
} from "../../utils/workforceUiLabels";
import { computeOperationalEmployerCosts, OPERATIONAL_COST_DISCLAIMER_PL } from "../../utils/operationalEmployerCosts";

type TabId = "permissions" | "wms" | "panel_statuses" | "activity" | "workforce" | "presets";

// --- HELPERS ---
function rosterName(u: AppUserListItem): string {
  const n = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return n || u.login;
}

function initialsFromForm(login: string, firstName: string, lastName: string) {
  const a = (firstName?.[0] ?? "").toUpperCase();
  const b = (lastName?.[0] ?? "").toUpperCase();
  if (a || b) return `${a}${b}`;
  return (login?.slice(0, 2) ?? "?").toUpperCase();
}

function roleLabel(role: string) {
  return PLATFORM_ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}

function parseTab(s: string | null): TabId {
  if (s === "warehouses" || s === "wms") return "wms";
  if (s === "panel_statuses" || s === "statuses" || s === "statusy" || s === "panel-statuses") return "panel_statuses";
  if (s === "workforce" || s === "org") return "workforce";
  if (s === "permissions" || s === "activity" || s === "presets") return s;
  return "permissions";
}

const EMPLOYMENT_OPTIONS = ["Umowa o pracę", "Umowa zlecenie", "B2B", "Praktykant", "Tymczasowy"] as const;
const SHIFT_OPTIONS = ["Jedna zmiana", "Dwie zmiany", "Trzy zmiany", "Nocna", "Elastyczny"] as const;
const JOB_POSITION_OPTIONS = ["Picker", "Packer", "Lider", "Operator", "Kontrola jakości", "Biuro", "Manager"] as const;

function employmentToContractType(employmentLabel: string): string {
  const t = employmentLabel.trim();
  if (t === "Umowa o pracę" || t === "Praktykant") return "uop";
  if (t === "Umowa zlecenie" || t === "Tymczasowy") return "zlecenie";
  if (t === "B2B") return "b2b";
  return "uop";
}

// --- STYLES ---
const cardCls = "rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500";
const sidebarInputCls = "block w-full rounded-xl border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10";
const labelCls = "block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1";
const tabBtnCls = "px-4 py-2 text-sm font-semibold transition-all rounded-lg whitespace-nowrap flex items-center gap-2";

export default function AdministratorEditPage() {
  const params = useParams<{ id?: string }>();
  const location = useLocation();
  const id = params.id ?? (location.pathname.replace(/\/+$/, "").endsWith("/settings/administrators/new") ? "new" : undefined);
  const isNew = id === "new";
  const numericId = id && !isNew ? Number(id) : NaN;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading, hasPermission, sessionReady } = useAuth();
  const { refreshWarehouses } = useWarehouse();
  const { selectedWarehouseId } = useWarehouse();
  const canManageUsers = hasPermission("settings.users") || isSuperRole(user?.role ?? "");
  
  const [tab, setTab] = useState<TabId>(() => parseTab(searchParams.get("tab")));
  const [catalog, setCatalog] = useState<PermissionCatalogResponse | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Form states
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [role, setRole] = useState<string>("user");
  const [isActive, setIsActive] = useState(true);
  const [roleLocked, setRoleLocked] = useState(false);
  const [activeLocked, setActiveLocked] = useState(false);
  const [language, setLanguage] = useState("pl");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permSearch, setPermSearch] = useState("");

  const [barcodeLoginCode, setBarcodeLoginCode] = useState("");
  const [wmsLanguage, setWmsLanguage] = useState("pl");
  const [timezone, setTimezone] = useState("Europe/Warsaw");
  const [requireScan, setRequireScan] = useState(false);
  const [canEditPreview, setCanEditPreview] = useState(false);
  const [pickerColor, setPickerColor] = useState("");
  const [warehouseIds, setWarehouseIds] = useState<number[]>([]);
  const [defaultWarehouseId, setDefaultWarehouseId] = useState<number | "">("");

  const [primaryWorkforceGroupId, setPrimaryWorkforceGroupId] = useState<number | "">("");
  const [workforceGroups, setWorkforceGroups] = useState<WorkforceUserGroupDto[]>([]);
  const [wmsOperationalModes, setWmsOperationalModes] = useState<string[]>([]);
  const [supervisorUserId, setSupervisorUserId] = useState<number | "">("");
  const [allUsers, setAllUsers] = useState<AppUserListItem[]>([]);
  const [employmentType, setEmploymentType] = useState("");
  const [shiftType, setShiftType] = useState("");
  const [jobPosition, setJobPosition] = useState("");

  const [auditRows, setAuditRows] = useState<AuditLogItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditDetail, setAuditDetail] = useState<AuditLogItem | null>(null);

  const [warehouseZonesText, setWarehouseZonesText] = useState("");
  const [workforceColorTag, setWorkforceColorTag] = useState("");
  const [costNet, setCostNet] = useState("");
  const [costGross, setCostGross] = useState("");
  const [costEmployerTotal, setCostEmployerTotal] = useState("");
  const [costHoursMonth, setCostHoursMonth] = useState("168");
  const [costPpk, setCostPpk] = useState(false);
  const [costNotes, setCostNotes] = useState("");
  const [costEmployerRateOverride, setCostEmployerRateOverride] = useState("");

  const [presets, setPresets] = useState<PermissionPresetDto[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetDescription, setPresetDescription] = useState("");
  const [presetVisibility, setPresetVisibility] = useState<"personal" | "organization">("personal");

  const snapshotRef = useRef<string>("");
  const buildSnapshotRef = useRef<() => string>(() => "");
  const auditLoadedForUserRef = useRef<number | null>(null);
  const costLoadedForUserRef = useRef<number | null>(null);

  const buildSnapshot = useCallback(() => {
    return JSON.stringify({
      login, email, password, firstName, lastName, phone, avatarUrl,
      role, isActive, language, permissions,
      barcodeLoginCode, wmsLanguage, timezone, requireScan, canEditPreview,
      pickerColor, warehouseIds, defaultWarehouseId,
      primaryWorkforceGroupId, wmsOperationalModes, supervisorUserId,
      employmentType, shiftType, jobPosition,
      warehouseZonesText, workforceColorTag,
      costNet, costGross, costEmployerTotal, costHoursMonth, costPpk, costNotes, costEmployerRateOverride,
    });
  }, [
    login, email, password, firstName, lastName, phone, avatarUrl, role, isActive, language, permissions,
    barcodeLoginCode, wmsLanguage, timezone, requireScan, canEditPreview, pickerColor, warehouseIds, defaultWarehouseId,
    primaryWorkforceGroupId, wmsOperationalModes, supervisorUserId, employmentType, shiftType, jobPosition,
    warehouseZonesText, workforceColorTag, costNet, costGross, costEmployerTotal, costHoursMonth, costPpk, costNotes,
    costEmployerRateOverride,
  ]);

  buildSnapshotRef.current = buildSnapshot;

  const isDirty = useMemo(() => {
    return snapshotRef.current !== "" && buildSnapshot() !== snapshotRef.current;
  }, [buildSnapshot]);

  const costOperational = useMemo(() => {
    const ct = employmentToContractType(employmentType);
    const g = costGross.trim() === "" ? null : Number(costGross);
    const n = costNet.trim() === "" ? null : Number(costNet);
    const et = costEmployerTotal.trim() === "" ? null : Number(costEmployerTotal);
    const hoRaw = costHoursMonth.trim() === "" ? 168 : Number(costHoursMonth);
    const ero = costEmployerRateOverride.trim() === "" ? null : Number(costEmployerRateOverride);
    const hasMoney = (x: number | null) => x != null && Number.isFinite(x) && x > 0;
    if (!hasMoney(g) && !hasMoney(n) && !(et != null && Number.isFinite(et) && et > 0)) return null;
    return computeOperationalEmployerCosts({
      contractType: ct,
      grossMonthly: g,
      netMonthly: n,
      hoursPerMonth: Number.isFinite(hoRaw) && hoRaw > 0 ? hoRaw : 168,
      ppkEnabled: costPpk,
      employerTotalOverride: et != null && Number.isFinite(et) && et > 0 ? et : null,
      employerSideRateOverride: ero != null && Number.isFinite(ero) ? ero : null,
    });
  }, [employmentType, costGross, costNet, costEmployerTotal, costHoursMonth, costPpk, costEmployerRateOverride]);

  const applyUserToForm = useCallback((u: MeResponse) => {
    setLogin(u.login);
    setEmail(u.email ?? "");
    setFirstName(u.first_name ?? "");
    setLastName(u.last_name ?? "");
    setPhone(u.phone ?? "");
    setAvatarUrl(u.avatar_url ?? "");
    setRole(u.role);
    setIsActive(u.is_active);
    setRoleLocked(Boolean(u.is_role_changeable === false || u.is_system_user || u.is_owner || isSuperRole(u.role)));
    setActiveLocked(Boolean(u.is_system_user || isSuperRole(u.role)));
    setLanguage(u.language);
    setPermissions(isSuperRole(u.role) ? [] : [...(u.explicit_permissions ?? [])]);
    if (u.wms_profile) {
      const wp = u.wms_profile;
      setBarcodeLoginCode(wp.barcode_login_code ?? "");
      setWmsLanguage(wp.language ?? "pl");
      setTimezone(wp.timezone ?? "Europe/Warsaw");
      setRequireScan(wp.require_scan_every_product ?? false);
      setCanEditPreview(wp.can_edit_products_preview ?? false);
      setPickerColor(wp.picker_color ?? "");
      setWarehouseIds(wp.warehouse_ids ?? []);
      setDefaultWarehouseId(wp.default_warehouse_id ?? "");
      setWmsOperationalModes(wp.wms_operational_modes ?? []);
      setSupervisorUserId(wp.workforce_supervisor_user_id ?? "");
      setEmploymentType(wp.workforce_employment_type ?? "");
      setShiftType(wp.workforce_shift_type ?? "");
      setJobPosition(wp.workforce_default_workstation ?? "");
      const zids = wp.workforce_active_warehouse_zone_ids ?? [];
      setWarehouseZonesText(zids.length ? zids.join(", ") : "");
      setWorkforceColorTag(wp.workforce_color_tag ?? "");
    }
    setPrimaryWorkforceGroupId(u.primary_workforce_group_id ?? "");
  }, []);

  const identityPayload = useCallback(
    () => ({
      email: email.trim(),
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      phone: phone.trim() || null,
      ...(roleLocked ? {} : { role }),
      ...(activeLocked ? {} : { is_active: isActive }),
      language,
      ...(password.trim() ? { password } : {}),
    }),
    [email, firstName, lastName, phone, role, isActive, language, password, roleLocked, activeLocked],
  );

  const buildWmsPayload = useCallback((): WmsProfilePayload => {
    const zoneIds = warehouseZonesText
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n));
    return {
      barcode_login_code: barcodeLoginCode.trim() || null,
      language: wmsLanguage || "pl",
      timezone: timezone || "Europe/Warsaw",
      default_warehouse_id: defaultWarehouseId === "" ? null : Number(defaultWarehouseId),
      warehouse_ids: warehouseIds,
      require_scan_every_product: requireScan,
      can_edit_products_preview: canEditPreview,
      picker_color: pickerColor.trim() || null,
      wms_operational_modes: wmsOperationalModes,
      workforce_supervisor_user_id: supervisorUserId === "" ? null : Number(supervisorUserId),
      workforce_employment_type: employmentType.trim() || null,
      workforce_shift_type: shiftType.trim() || null,
      workforce_default_workstation: jobPosition.trim() || null,
      workforce_active_warehouse_zone_ids: zoneIds,
      workforce_color_tag: workforceColorTag.trim() || null,
    };
  }, [
    barcodeLoginCode,
    wmsLanguage,
    timezone,
    defaultWarehouseId,
    warehouseIds,
    requireScan,
    canEditPreview,
    pickerColor,
    wmsOperationalModes,
    supervisorUserId,
    employmentType,
    shiftType,
    jobPosition,
    warehouseZonesText,
    workforceColorTag,
  ]);

  const goTab = (t: TabId) => {
    setTab(t);
    setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set("tab", t); return n; }, { replace: true });
  };

  useEffect(() => {
    const next = parseTab(searchParams.get("tab"));
    setTab((prev) => (prev === next ? prev : next));
  }, [searchParams]);

  useEffect(() => {
    auditLoadedForUserRef.current = null;
    costLoadedForUserRef.current = null;
  }, [numericId]);

  useEffect(() => {
    if (!sessionReady) return;
    void fetchPermissionCatalog().then(setCatalog).catch(() => setCatalog(null));
    void warehouseService.getAllWarehouses().then((res) => setWarehouses(Array.isArray(res.data) ? res.data : []));
  }, [sessionReady]);

  useEffect(() => {
    if (!sessionReady || !canManageUsers) return;
    void fetchWorkforceUserGroups(false).then(setWorkforceGroups).catch(() => setWorkforceGroups([]));
    void fetchUsers().then(setAllUsers).catch(() => setAllUsers([]));
  }, [sessionReady, canManageUsers]);

  useEffect(() => {
    if (tab !== "activity" || isNew || !Number.isFinite(numericId)) return;
    if (!hasPermission("audit.view")) {
      setAuditRows([]);
      setAuditLoading(false);
      return;
    }
    if (auditLoadedForUserRef.current === numericId) return;
    let cancelled = false;
    setAuditLoading(true);
    void fetchAuditLogs({ limit: 200 })
      .then((data) => {
        if (cancelled) return;
        setAuditRows(data.filter((r) => r.user_id === numericId));
      })
      .catch(() => {
        if (!cancelled) setAuditRows([]);
      })
      .finally(() => {
        if (!cancelled) {
          setAuditLoading(false);
          auditLoadedForUserRef.current = numericId;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab, isNew, numericId, hasPermission]);

  useEffect(() => {
    if (tab !== "workforce" || isNew || !Number.isFinite(numericId) || !canManageUsers) return;
    if (costLoadedForUserRef.current === numericId) return;
    let cancelled = false;
    void fetchEmployeeCostProfile(numericId)
      .then((p) => {
        if (cancelled) return;
        setCostNet(p.net_monthly_pln != null ? String(p.net_monthly_pln) : "");
        setCostGross(p.gross_monthly_pln != null ? String(p.gross_monthly_pln) : "");
        setCostEmployerTotal(p.employer_total_monthly_pln != null ? String(p.employer_total_monthly_pln) : "");
        setCostHoursMonth(String(p.default_hours_per_month ?? 168));
        setCostPpk(Boolean(p.ppk_enabled));
        setCostNotes(p.notes ?? "");
        setCostEmployerRateOverride(p.employer_side_rate_override != null ? String(p.employer_side_rate_override) : "");
      })
      .catch(() => {
        if (cancelled) return;
        setCostNet("");
        setCostGross("");
        setCostEmployerTotal("");
        setCostHoursMonth("168");
        setCostPpk(false);
        setCostNotes("");
        setCostEmployerRateOverride("");
      })
      .finally(() => {
        if (!cancelled) costLoadedForUserRef.current = numericId;
      });
    return () => {
      cancelled = true;
    };
  }, [tab, isNew, numericId, canManageUsers]);

  useEffect(() => {
    if (tab !== "presets" || !canManageUsers) return;
    let cancelled = false;
    setPresetsLoading(true);
    void fetchCustomPermissionPresets()
      .then((p) => {
        if (!cancelled) setPresets(p);
      })
      .catch(() => {
        if (!cancelled) setPresets([]);
      })
      .finally(() => {
        if (!cancelled) setPresetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, canManageUsers]);

  useEffect(() => {
    if (isNew || !Number.isFinite(numericId) || !sessionReady) {
      if (isNew) {
        setLoading(false);
        setTimeout(() => {
          snapshotRef.current = buildSnapshotRef.current();
        }, 0);
      }
      return;
    }
    void (async () => {
      setLoading(true);
      try {
        const u: MeResponse = await fetchUser(numericId);
        applyUserToForm(u);
        setTimeout(() => {
          snapshotRef.current = buildSnapshotRef.current();
        }, 0);
      } catch {
        setErr("Nie udało się wczytać użytkownika.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isNew, numericId, sessionReady, applyUserToForm]);

  const onSave = async () => {
    setSaving(true);
    try {
      if (wmsOperationalModes.length > 0 && !isSuperRole(role) && warehouseIds.length === 0) {
        toast.error("Użytkownik operacyjny WMS musi mieć co najmniej jeden przypisany magazyn.");
        setSaving(false);
        return;
      }
      if (
        defaultWarehouseId !== "" &&
        warehouseIds.length > 0 &&
        !warehouseIds.includes(Number(defaultWarehouseId))
      ) {
        toast.error("Domyślny magazyn musi być wśród przypisanych magazynów.");
        setSaving(false);
        return;
      }
      if (isNew) {
        if (!password.trim()) {
          toast.error("Podaj hasło dla nowego użytkownika.");
          return;
        }
        const row = await createUser({
          login: login.trim(),
          email: email.trim(),
          password: password.trim(),
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          phone: phone.trim() || null,
          role,
          is_active: isActive,
          language,
          permissions: isSuperRole(role) ? [] : [...permissions],
          wms_profile: buildWmsPayload(),
          primary_workforce_group_id: primaryWorkforceGroupId === "" ? null : Number(primaryWorkforceGroupId),
        });
        toast.success("Użytkownik utworzony.");
        navigate(`/settings/administrators/${row.id}`, { replace: true });
        return;
      }

      const base = identityPayload();
      let toastLabel = "Zapisano zmiany.";

      if (tab === "permissions" || tab === "presets") {
        await updateUser(numericId, {
          ...base,
          permissions: isSuperRole(role) ? [] : [...permissions],
        });
        toastLabel = "Uprawnienia zapisane.";
      } else if (tab === "wms") {
        await updateUser(numericId, {
          ...base,
          wms_profile: buildWmsPayload(),
        });
        toastLabel = "Ustawienia WMS zapisane.";
      } else if (tab === "workforce") {
        await updateUser(numericId, {
          ...base,
          primary_workforce_group_id: primaryWorkforceGroupId === "" ? null : Number(primaryWorkforceGroupId),
          wms_profile: {
            workforce_employment_type: employmentType.trim() || null,
            workforce_shift_type: shiftType.trim() || null,
            workforce_default_workstation: jobPosition.trim() || null,
            workforce_color_tag: workforceColorTag.trim() || null,
          },
        });
        if (canManageUsers) {
          try {
            await putEmployeeCostProfile(numericId, {
              contract_type: employmentToContractType(employmentType),
              net_monthly_pln: costNet.trim() === "" ? null : Number(costNet),
              gross_monthly_pln: costGross.trim() === "" ? null : Number(costGross),
              employer_total_monthly_pln: costEmployerTotal.trim() === "" ? null : Number(costEmployerTotal),
              default_hours_per_month: costHoursMonth.trim() === "" ? 168 : Number(costHoursMonth),
              ppk_enabled: costPpk,
              employer_side_rate_override: costEmployerRateOverride.trim() === "" ? null : Number(costEmployerRateOverride),
              notes: costNotes.trim() || null,
              is_active: true,
            });
          } catch (costErr: unknown) {
            console.error("[AdministratorEdit] putEmployeeCostProfile", costErr);
            toast.error(extractApiErrorMessage(costErr, "Profil kosztu nie został zapisany."));
          }
        }
        toastLabel = "Ustawienia pracy zapisane.";
      } else if (tab === "panel_statuses") {
        toast.success("Statusy zapisuj osobnym przyciskiem „Zapisz” w macierzy poniżej.");
        setSaving(false);
        return;
      } else {
        await updateUser(numericId, {
          ...base,
          permissions: isSuperRole(role) ? [] : [...permissions],
          wms_profile: buildWmsPayload(),
          primary_workforce_group_id: primaryWorkforceGroupId === "" ? null : Number(primaryWorkforceGroupId),
        });
      }

      const refreshed = await fetchUser(numericId);
      applyUserToForm(refreshed);
      snapshotRef.current = buildSnapshot();
      if (tab === "wms" || tab === "identity") {
        if (user?.id === numericId) {
          await refreshWarehouses();
        }
      }
      toast.success(toastLabel);
    } catch (err: unknown) {
      console.error("[AdministratorEdit] onSave", err);
      toast.error(extractApiErrorMessage(err, "Błąd zapisu."));
    } finally {
      setSaving(false);
    }
  };

  const onCancelEdit = useCallback(() => {
    if (!isDirty || window.confirm("Porzucić zmiany?")) navigate("/settings/administrators");
  }, [isDirty, navigate]);

  if (!authLoading && !user) return <Navigate to="/login" replace />;

  const tree = catalog?.tree ?? [];

  return (
    <PageContainer fullBleed omitCard className="bg-white !p-0">
      <div className="w-full min-w-0 space-y-6 p-5">
        {/* HEADER — match {@link AdministratorsModuleStack} / {@link PageHeader} (list module) */}
        <PageHeader
          className="space-y-2"
          breadcrumbs={[
            { label: "Ustawienia", to: "/settings/company" },
            { label: "Użytkownicy", to: "/settings/administrators" },
            { label: isNew ? "Nowy" : "Edycja" },
          ]}
          title={isNew ? "Nowy użytkownik" : `Edytuj: ${login}`}
          actions={
            <Link
              to="/settings/administrators"
              className="relative z-10 inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              Powrót do listy
            </Link>
          }
        />

        {err && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 font-semibold text-red-800">
            <AlertCircle className="h-5 w-5 shrink-0" /> {err}
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[440px_1fr]">
          
          {/* SIDEBAR */}
          <aside className="space-y-8">
            <div className={cardCls}>
              <div className="h-28 bg-gradient-to-br from-indigo-500/10 to-indigo-600/5" />
              <div className="px-8 pb-8">
                <div className="-mt-14 mb-6">
                   <AvatarUploadField
                      initials={initialsFromForm(login, firstName, lastName)}
                      storedUrl={avatarUrl || undefined}
                      pendingFile={avatarFile}
                      onPickFile={setAvatarFile}
                      onClearStored={() => setAvatarUrl("")}
                      disabled={loading}
                      className="ring-8 ring-white shadow-xl"
                    />
                </div>
                
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {isActive ? "Aktywny" : "Nieaktywny"}
                      {activeLocked ? " · zablokowane" : ""}
                    </span>
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-indigo-700 ring-1 ring-indigo-200">
                      {roleLabel(role)}
                      {roleLocked ? " · zablokowane" : ""}
                    </span>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div>
                      <label className={labelCls}>Login</label>
                      <input className={sidebarInputCls} value={login} onChange={(e) => setLogin(e.target.value)} readOnly={!isNew} />
                    </div>
                    <div>
                      <label className={labelCls}>E-mail</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-3 h-4 w-4 text-slate-400" />
                        <input className={`${sidebarInputCls} pl-11`} value={email} onChange={(e) => setEmail(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>{isNew ? "Hasło" : "Nowe hasło"}</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-3 h-4 w-4 text-slate-400" />
                        <input type="password" className={`${sidebarInputCls} pl-11`} value={password} onChange={(e) => setPassword(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={cardCls}>
               <div className="border-b border-slate-100 bg-slate-50 px-8 py-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Profil</h3>
               </div>
               <div className="p-8 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Imię</label>
                      <input className={sidebarInputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Nazwisko</label>
                      <input className={sidebarInputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Telefon</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-3 h-4 w-4 text-slate-400" />
                      <input className={`${sidebarInputCls} pl-11`} value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                  </div>
               </div>
            </div>
          </aside>

          {/* MAIN CONTENT */}
          <main className="min-w-0">
            <div className={`${cardCls} flex flex-col min-h-[700px] bg-white`}>
              <div className="bg-slate-50 p-4 border-b border-slate-200">
                <nav className="flex flex-wrap gap-2">
                  {[
                    { id: "permissions", label: "Uprawnienia", icon: ShieldCheck },
                    { id: "wms", label: "WMS i magazyny", icon: Fingerprint },
                    { id: "panel_statuses", label: "Statusy", icon: Settings2 },
                    { id: "workforce", label: "Praca", icon: Briefcase },
                    { id: "activity", label: "Aktywność", icon: History },
                    { id: "presets", label: "Presety", icon: Layers },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => goTab(item.id as TabId)}
                      className={`
                        ${tabBtnCls} 
                        ${tab === item.id 
                          ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200" 
                          : "text-slate-500 hover:text-slate-800 hover:bg-white/50"}
                      `}
                    >
                      <item.icon className="h-4 w-4" /> {item.label}
                    </button>
                  ))}
                </nav>
              </div>

              <div className="p-10 flex-1">
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-full py-20">
                    <div className="h-10 w-10 animate-spin border-4 border-indigo-600 border-t-transparent rounded-full mb-4" />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Ładowanie danych...</p>
                  </div>
                ) : (
                  <div className="animate-in fade-in duration-500">
                    
                    {tab === "permissions" && (
                      <div className="space-y-8">
                        <div className="space-y-1">
                          <h2 className="text-2xl font-black text-slate-900">Uprawnienia systemowe</h2>
                          <p className="text-slate-500">
                            Zaznaczenia zapisują dodatkowe uprawnienia użytkownika. Rola nadaje zestaw bazowy automatycznie.
                          </p>
                        </div>
                        {isSuperRole(role) && (
                          <div className="flex items-start gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
                            <ShieldAlert className="h-8 w-8 shrink-0 text-amber-600" />
                            <div className="text-sm">
                              <p className="font-black uppercase tracking-wide mb-1">Rola Super Admina</p>
                              <p className="opacity-80 leading-relaxed font-medium">To konto posiada nieograniczony dostęp</p>
                            </div>
                          </div>
                        )}
                        <div className="rounded-3xl border border-slate-100 bg-slate-50/30 p-6">
                           <PermissionTreePanel tree={tree} value={permissions} onChange={setPermissions} disabled={isSuperRole(role)} search={permSearch} onSearchChange={setPermSearch} />
                        </div>
                      </div>
                    )}

                    {tab === "wms" && (
                      <div className="space-y-8">
                        <div className="space-y-1">
                          <h2 className="text-2xl font-black text-slate-900">WMS i magazyny</h2>
                        </div>
                        <div className="grid gap-6 lg:grid-cols-2">
                          <div className="space-y-4">
                            <div>
                              <label className={labelCls}>Kod logowania</label>
                              <input className={sidebarInputCls} value={barcodeLoginCode} onChange={(e) => setBarcodeLoginCode(e.target.value)} />
                            </div>
                            <div>
                              <label className={labelCls}>Język WMS</label>
                              <input className={sidebarInputCls} value={wmsLanguage} onChange={(e) => setWmsLanguage(e.target.value)} />
                            </div>
                            <div>
                              <label className={labelCls}>Strefa czasowa</label>
                              <input className={sidebarInputCls} value={timezone} onChange={(e) => setTimezone(e.target.value)} />
                            </div>
                            <div>
                              <label className={labelCls}>Domyślny magazyn</label>
                              <select
                                className={sidebarInputCls}
                                value={defaultWarehouseId === "" ? "" : String(defaultWarehouseId)}
                                onChange={(e) => setDefaultWarehouseId(e.target.value ? Number(e.target.value) : "")}
                              >
                                <option value="">— Wybierz —</option>
                                {(warehouseIds.length ? warehouses.filter((w) => warehouseIds.includes(w.id)) : warehouses).map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="space-y-4">
                            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={requireScan} onChange={(e) => setRequireScan(e.target.checked)} />
                              <span className="text-sm font-bold text-slate-700">Wymagaj skanowania każdego produktu</span>
                            </div>
                            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={canEditPreview} onChange={(e) => setCanEditPreview(e.target.checked)} />
                              <span className="text-sm font-bold text-slate-700">Może edytować podgląd produktów</span>
                            </div>
                            <div>
                              <label className={labelCls}>Kolor zbieracza (etykieta)</label>
                              <input className={sidebarInputCls} value={pickerColor} onChange={(e) => setPickerColor(e.target.value)} placeholder="#RRGGBB lub nazwa" />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">Przypisywanie magazynów</h3>
                          <p className="text-sm text-slate-500">Zaznacz magazyny dostępne w profilu WMS.</p>
                          <div className="flex flex-wrap gap-2">
                            {warehouses.map((w) => {
                              const on = warehouseIds.includes(w.id);
                              return (
                                <button
                                  key={w.id}
                                  type="button"
                                  onClick={() =>
                                    setWarehouseIds((prev) => {
                                      if (on) {
                                        const next = prev.filter((x) => x !== w.id);
                                        if (defaultWarehouseId === w.id) {
                                          setDefaultWarehouseId(next[0] ?? "");
                                        }
                                        return next;
                                      }
                                      const next = [...prev, w.id];
                                      if (prev.length === 0) {
                                        setDefaultWarehouseId(w.id);
                                      }
                                      return next;
                                    })
                                  }
                                  className={`rounded-xl border px-4 py-2 text-sm font-bold transition-all ${
                                    on ? "border-indigo-600 bg-indigo-50 text-indigo-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                  }`}
                                >
                                  {w.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">Tryby operacyjne WMS</h3>
                          <div className="flex flex-wrap gap-2">
                            {WMS_OPERATIONAL_MODE_KEYS.map((key) => {
                              const on = wmsOperationalModes.includes(key);
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() =>
                                    setWmsOperationalModes((prev) => (on ? prev.filter((k) => k !== key) : [...prev, key]))
                                  }
                                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                                    on ? "border-indigo-600 bg-indigo-50 text-indigo-800" : "border-slate-200 bg-white text-slate-600"
                                  }`}
                                >
                                  {WMS_OPERATIONAL_MODE_LABELS_PL[key] ?? key}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid gap-6 lg:grid-cols-2">
                          <div>
                            <label className={labelCls}>Przełożony</label>
                            <select
                              className={sidebarInputCls}
                              value={supervisorUserId === "" ? "" : String(supervisorUserId)}
                              onChange={(e) => setSupervisorUserId(e.target.value ? Number(e.target.value) : "")}
                            >
                              <option value="">— Brak —</option>
                              {allUsers
                                .filter((u) => u.id !== numericId)
                                .map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {rosterName(u)} ({u.login})
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div>
                            <label className={labelCls}>ID stref magazynowych (CSV)</label>
                            <input
                              className={sidebarInputCls}
                              value={warehouseZonesText}
                              onChange={(e) => setWarehouseZonesText(e.target.value)}
                              placeholder="np. 1, 2, 5"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {tab === "panel_statuses" && (
                      <div className="space-y-8">
                        <div className="space-y-1">
                          <h2 className="text-2xl font-black text-slate-900">Statusy panelu zamówień</h2>
                        </div>
                        {isNew ? (
                          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
                            Zapisz użytkownika, aby móc konfigurować macierz statusów.
                          </p>
                        ) : selectedWarehouseId == null ? (
                          <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">
                            Wybierz magazyn w nagłówku aplikacji — macierz statusów jest per magazyn.
                          </p>
                        ) : (
                          <UserPanelStatusMatrix tenantId={DAMAGE_TENANT_ID} warehouseId={selectedWarehouseId} targetUserId={numericId} />
                        )}
                      </div>
                    )}

                    {tab === "workforce" && (
                      <div className="space-y-8">
                        <div className="space-y-1">
                          <h2 className="text-2xl font-black text-slate-900">Praca i organizacja</h2>
                        </div>
                        <div className="grid gap-6 lg:grid-cols-2">
                          <div>
                            <label className={labelCls}>Grupa operacyjna</label>
                            <select
                              className={sidebarInputCls}
                              value={primaryWorkforceGroupId === "" ? "" : String(primaryWorkforceGroupId)}
                              onChange={(e) => setPrimaryWorkforceGroupId(e.target.value ? Number(e.target.value) : "")}
                            >
                              <option value="">— Brak —</option>
                              {workforceGroups.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={labelCls}>Tag koloru</label>
                            <input className={sidebarInputCls} value={workforceColorTag} onChange={(e) => setWorkforceColorTag(e.target.value)} placeholder="np. team-blue" />
                          </div>
                          <div>
                            <label className={labelCls}>Forma zatrudnienia</label>
                            <select className={sidebarInputCls} value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
                              <option value="">— Wybierz —</option>
                              {EMPLOYMENT_OPTIONS.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={labelCls}>Zmiana / grafik</label>
                            <select className={sidebarInputCls} value={shiftType} onChange={(e) => setShiftType(e.target.value)}>
                              <option value="">— Wybierz —</option>
                              {SHIFT_OPTIONS.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="lg:col-span-2">
                            <label className={labelCls}>Stanowisko / rola operacyjna</label>
                            <input
                              className={sidebarInputCls}
                              list="admin-job-position-options"
                              value={jobPosition}
                              onChange={(e) => setJobPosition(e.target.value)}
                              placeholder="Wpisz lub wybierz z podpowiedzi"
                            />
                            <datalist id="admin-job-position-options">
                              {JOB_POSITION_OPTIONS.map((o) => (
                                <option key={o} value={o} />
                              ))}
                            </datalist>
                          </div>
                        </div>

                        {!isNew && canManageUsers && (
                          <div className="space-y-4 rounded-3xl border border-slate-100 bg-slate-50/40 p-6">
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">Profil kosztu</h3>
                            <p className="text-xs text-slate-500">{OPERATIONAL_COST_DISCLAIMER_PL}</p>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                              <div>
                                <label className={labelCls}>Netto miesięcznie (PLN)</label>
                                <input className={sidebarInputCls} inputMode="decimal" value={costNet} onChange={(e) => setCostNet(e.target.value)} />
                              </div>
                              <div>
                                <label className={labelCls}>Brutto miesięcznie (PLN)</label>
                                <input className={sidebarInputCls} inputMode="decimal" value={costGross} onChange={(e) => setCostGross(e.target.value)} />
                              </div>
                              <div>
                                <label className={labelCls}>Koszt pracodawcy (override)</label>
                                <input className={sidebarInputCls} inputMode="decimal" value={costEmployerTotal} onChange={(e) => setCostEmployerTotal(e.target.value)} />
                              </div>
                              <div>
                                <label className={labelCls}>Godziny w miesiącu</label>
                                <input className={sidebarInputCls} inputMode="numeric" value={costHoursMonth} onChange={(e) => setCostHoursMonth(e.target.value)} />
                              </div>
                              <div>
                                <label className={labelCls}>Override stawki pracodawcy (0–1)</label>
                                <input className={sidebarInputCls} inputMode="decimal" value={costEmployerRateOverride} onChange={(e) => setCostEmployerRateOverride(e.target.value)} />
                              </div>
                              <div className="flex items-center gap-3 pt-6">
                                <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={costPpk} onChange={(e) => setCostPpk(e.target.checked)} />
                                <span className="text-sm font-bold text-slate-700">PPK (składka pracodawcy w modelu)</span>
                              </div>
                            </div>
                            <div>
                              <label className={labelCls}>Notatki</label>
                              <textarea className={`${sidebarInputCls} min-h-[88px]`} value={costNotes} onChange={(e) => setCostNotes(e.target.value)} />
                            </div>
                            {costOperational && (
                              <div className="rounded-2xl border border-indigo-100 bg-white p-4 text-sm text-slate-700">
                                <p className="font-bold text-indigo-800">Podgląd operacyjny</p>
                                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                                  <li>Brutto: {costOperational.grossMonthly} PLN</li>
                                  <li>Netto: {costOperational.netMonthly ?? "—"}</li>
                                  <li>Koszt pracodawcy / mc: {costOperational.employerTotalMonthly} PLN</li>
                                  <li>Stawka pracodawcy / h: {costOperational.employerHourlyPln} PLN</li>
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {tab === "activity" && (
                      <div className="space-y-8">
                        <div className="space-y-1">
                          <h2 className="text-2xl font-black text-slate-900">Historia aktywności</h2>
                        </div>
                        {!hasPermission("audit.view") ? (
                          <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Brak uprawnienia `audit.view`.</p>
                        ) : isNew ? (
                          <p className="text-sm text-slate-500">Zapisz użytkownika, aby zobaczyć historię.</p>
                        ) : auditLoading ? (
                          <div className="flex items-center gap-3 text-slate-500">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                            <span className="text-sm font-medium">Ładowanie logów…</span>
                          </div>
                        ) : auditRows.length === 0 ? (
                          <p className="text-sm text-slate-500">Brak wpisów dla tego użytkownika.</p>
                        ) : (
                          <div className="overflow-x-auto rounded-2xl border border-slate-200">
                            <table className="min-w-full text-left text-sm">
                              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500">
                                <tr>
                                  <th className="px-4 py-3">Data</th>
                                  <th className="px-4 py-3">Akcja</th>
                                  <th className="px-4 py-3">Moduł</th>
                                  <th className="px-4 py-3">Encja</th>
                                  <th className="px-4 py-3" />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {auditRows.map((r) => (
                                  <tr key={r.id} className="bg-white hover:bg-slate-50/80">
                                    <td className="whitespace-nowrap px-4 py-2 text-slate-600">{new Date(r.created_at).toLocaleString("pl-PL")}</td>
                                    <td className="px-4 py-2 font-medium text-slate-800">{humanizeAuditAction(r.action)}</td>
                                    <td className="px-4 py-2 text-slate-600">{humanizeModule(r.module)}</td>
                                    <td className="px-4 py-2 text-slate-600">{humanizeEntityType(r.entity_type)}</td>
                                    <td className="px-4 py-2 text-right">
                                      {r.detail && Object.keys(r.detail).length > 0 ? (
                                        <button type="button" className="text-xs font-bold text-indigo-600 hover:underline" onClick={() => setAuditDetail(r)}>
                                          Szczegóły
                                        </button>
                                      ) : null}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {auditDetail && (
                          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 p-4" role="presentation" onClick={() => setAuditDetail(null)}>
                            <div
                              className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-2xl"
                              role="dialog"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <h3 className="text-lg font-black text-slate-900">Szczegóły wpisu</h3>
                              <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-xs text-slate-700">
                                {auditDetailLines(auditDetail.detail).join("\n")}
                              </pre>
                              <button type="button" className="mt-6 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white" onClick={() => setAuditDetail(null)}>
                                Zamknij
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {tab === "presets" && (
                      <div className="space-y-8">
                        <div className="space-y-1">
                          <h2 className="text-2xl font-black text-slate-900">Presety uprawnień</h2>
                          <p className="text-slate-500">Własne szablony oraz szybkie zastosowanie do bieżącej listy uprawnień.</p>
                        </div>
                        {!canManageUsers ? (
                          <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Brak uprawnień do zarządzania presetami.</p>
                        ) : presetsLoading ? (
                          <div className="flex items-center gap-3 text-slate-500">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                            <span className="text-sm font-medium">Ładowanie presetów…</span>
                          </div>
                        ) : (
                          <>
                            <div className="rounded-3xl border border-slate-100 bg-slate-50/40 p-6">
                              <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">Nowy preset (z bieżących uprawnień)</h3>
                              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                <div className="sm:col-span-2">
                                  <label className={labelCls}>Nazwa</label>
                                  <input className={sidebarInputCls} value={presetName} onChange={(e) => setPresetName(e.target.value)} />
                                </div>
                                <div className="sm:col-span-2">
                                  <label className={labelCls}>Opis</label>
                                  <input className={sidebarInputCls} value={presetDescription} onChange={(e) => setPresetDescription(e.target.value)} />
                                </div>
                                <div>
                                  <label className={labelCls}>Widoczność</label>
                                  <select
                                    className={sidebarInputCls}
                                    value={presetVisibility}
                                    onChange={(e) => setPresetVisibility(e.target.value as "personal" | "organization")}
                                  >
                                    <option value="personal">Osobisty</option>
                                    <option value="organization">Organizacja</option>
                                  </select>
                                </div>
                                <div className="flex items-end">
                                  <button
                                    type="button"
                                    disabled={!presetName.trim() || isSuperRole(role)}
                                    onClick={() => {
                                      void (async () => {
                                        try {
                                          const row = await createCustomPermissionPreset({
                                            name: presetName.trim(),
                                            description: presetDescription.trim() || null,
                                            visibility: presetVisibility,
                                            permission_keys: isSuperRole(role) ? [] : permissions,
                                          });
                                          setPresets((prev) => [row, ...prev]);
                                          setPresetName("");
                                          setPresetDescription("");
                                          toast.success("Preset utworzony.");
                                        } catch {
                                          toast.error("Nie udało się utworzyć presetu.");
                                        }
                                      })();
                                    }}
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-indigo-500 disabled:opacity-40"
                                  >
                                    <UserPlus className="h-4 w-4" />
                                    Utwórz
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">Biblioteka</h3>
                              {presets.length === 0 ? (
                                <p className="text-sm text-slate-500">Brak własnych presetów.</p>
                              ) : (
                                <ul className="space-y-2">
                                  {presets.map((p) => (
                                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                      <div>
                                        <p className="font-bold text-slate-900">{p.name}</p>
                                        <p className="text-xs text-slate-500">
                                          {p.visibility === "organization" ? "Organizacja" : "Osobisty"} · {p.permission_keys.length} uprawnień
                                        </p>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                                          onClick={() => {
                                            if (isSuperRole(role)) return;
                                            setPermissions([...new Set([...p.permission_keys])]);
                                            toast.success("Zastosowano preset.");
                                          }}
                                        >
                                          Zastosuj
                                        </button>
                                        <button
                                          type="button"
                                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
                                          onClick={() => {
                                            if (!window.confirm("Usunąć preset?")) return;
                                            void (async () => {
                                              try {
                                                await deleteCustomPermissionPreset(p.id);
                                                setPresets((prev) => prev.filter((x) => x.id !== p.id));
                                                toast.success("Usunięto.");
                                              } catch {
                                                toast.error("Nie udało się usunąć.");
                                              }
                                            })();
                                          }}
                                        >
                                          <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                                          Usuń
                                        </button>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            {catalog?.presets && (
                              <div className="space-y-3">
                                <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">Presety systemowe (role)</h3>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(catalog.presets).map(([key, keys]) => (
                                    <button
                                      key={key}
                                      type="button"
                                      disabled={isSuperRole(role)}
                                      onClick={() => {
                                        if (isSuperRole(role)) return;
                                        setPermissions([...keys]);
                                        toast.success(`Załadowano: ${builtinPresetLabel(key)}`);
                                      }}
                                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-indigo-300 disabled:opacity-40"
                                    >
                                      {builtinPresetLabel(key)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* FLOATING ACTION BAR */}
      <div className={`fixed bottom-10 left-1/2 z-[100] -translate-x-1/2 transition-all duration-700 ease-in-out ${isDirty ? "translate-y-0 opacity-100 scale-100" : "translate-y-24 opacity-0 scale-95 pointer-events-none"}`}>
         <div className="flex items-center gap-8 rounded-3xl bg-slate-900/95 px-8 py-5 shadow-2xl backdrop-blur-xl ring-1 ring-white/20">
            <div className="flex flex-col">
               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">Edycja administratora</span>
               <span className="text-sm font-bold text-white whitespace-nowrap">Masz niezapisane zmiany</span>
            </div>
            <div className="h-10 w-px bg-white/10" />
            <div className="flex items-center gap-4">
               <button onClick={onCancelEdit} className="text-sm font-bold text-slate-400 hover:text-white transition-colors px-2">Anuluj</button>
               <button 
                onClick={() => void onSave()} 
                disabled={saving}
                className="flex items-center gap-2.5 rounded-2xl bg-indigo-600 px-7 py-3 text-sm font-black text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 active:scale-95 disabled:opacity-50"
               >
                 {saving ? <div className="h-4 w-4 animate-spin border-2 border-white border-t-transparent rounded-full" /> : <Save className="h-4 w-4" />}
                 Zapisz zmiany
               </button>
            </div>
         </div>
      </div>
    </PageContainer>
  );
}