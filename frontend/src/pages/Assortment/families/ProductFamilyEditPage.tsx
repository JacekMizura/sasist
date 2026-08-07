import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Sparkles, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { fetchTenantsList } from "../../../api/tenantsApi";
import {
  attachProductFamily,
  createProductFamily,
  deleteProductFamily,
  getProductFamily,
  previewFamilyGenerate,
  updateProductFamily,
  type ProductFamilyMember,
} from "../../../api/productFamiliesApi";
import { extractApiErrorMessage } from "../../../api/authApi";
import { ListPageHeader } from "../../../components/listPage/ListPageHeader";
import PageLayout from "../../../components/layout/PageLayout";
import {
  PrimaryButton,
  SecondaryButton,
  dangerOutlineButtonClassFor,
} from "../../../design-system";
import { UI_STRINGS } from "../../../constants/uiStrings";
import type { ProductSearchHit } from "../../../api/productsSearchApi";
import { FamilyEditAttributesSection } from "./FamilyEditAttributesSection";
import { FamilyEditInfoCard } from "./FamilyEditInfoCard";
import { FamilyEditMembersCard } from "./FamilyEditMembersCard";
import { ProductFamilyGeneratorPanel } from "./ProductFamilyGeneratorPanel";
import {
  draftAttributeCount,
  draftCombinationCount,
  emptyAttr,
  fromApiAttributes,
  type DraftAttr,
} from "./familyEditDraft";

/**
 * Asortyment → Rodzina — dashboard kartowy (info, cechy, produkty, generator).
 */
export default function ProductFamilyEditPage() {
  const { familyId } = useParams();
  const navigate = useNavigate();
  const isNew = !familyId || familyId === "new";
  const numericId = !isNew ? Number(familyId) : null;

  const [tenantId, setTenantId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [baseProductId, setBaseProductId] = useState<number | null>(null);
  const [baseProductName, setBaseProductName] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<DraftAttr[]>([emptyAttr()]);
  const [members, setMembers] = useState<ProductFamilyMember[]>([]);
  const [serverCombinationCount, setServerCombinationCount] = useState(0);
  const [missingCount, setMissingCount] = useState(0);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);

  useEffect(() => {
    void fetchTenantsList()
      .then((list) => setTenantId(list[0]?.id ?? null))
      .catch(() => setTenantId(null));
  }, []);

  const refreshMissing = useCallback(async (tid: number, fid: number) => {
    try {
      const p = await previewFamilyGenerate(tid, fid);
      setMissingCount(p.missing_count ?? 0);
      setServerCombinationCount(p.combination_count ?? 0);
    } catch {
      /* KPI stays draft-based */
    }
  }, []);

  useEffect(() => {
    if (tenantId == null || isNew || numericId == null || !Number.isFinite(numericId)) return;
    setLoading(true);
    void getProductFamily(tenantId, numericId)
      .then(async (g) => {
        setName(g.name);
        setIsActive(g.is_active);
        setBaseProductId(g.base_product_id != null ? Number(g.base_product_id) : null);
        setBaseProductName(g.base_product_name ?? null);
        setAttributes(fromApiAttributes(g.attributes));
        setMembers(g.members ?? []);
        setServerCombinationCount(g.combination_count ?? 0);
        await refreshMissing(tenantId, numericId);
      })
      .catch((e) => {
        toast.error(extractApiErrorMessage(e, "Nie udało się wczytać rodziny."));
        navigate("/product-families");
      })
      .finally(() => setLoading(false));
  }, [tenantId, isNew, numericId, navigate, refreshMissing]);

  const liveAttributeCount = useMemo(() => draftAttributeCount(attributes), [attributes]);
  const liveCombinationCount = useMemo(() => draftCombinationCount(attributes), [attributes]);
  const combinationCount = isNew ? liveCombinationCount : Math.max(serverCombinationCount, liveCombinationCount);
  const productCount = members.length;
  const kpiMissing = isNew
    ? Math.max(0, liveCombinationCount - productCount)
    : missingCount;

  const toPayload = useCallback(() => {
    return {
      name: name.trim(),
      is_active: isActive,
      base_product_id: baseProductId,
      attributes: attributes
        .map((ax, ai) => ({
          id: ax.id,
          name: ax.name.trim(),
          sort_order: ai,
          display_type: ax.display_type,
          show_in_filters: ax.show_in_filters,
          sort_alpha: ax.sort_alpha,
          values: ax.values
            .map((v, vi) => ({
              id: v.id,
              name: v.name.trim(),
              sort_order: vi,
              color_hex: ax.display_type === "color" ? v.color_hex.trim() || null : null,
              image_url: null as string | null,
            }))
            .filter((v) => v.name),
        }))
        .filter((ax) => ax.name),
    };
  }, [name, isActive, baseProductId, attributes]);

  const reloadFamily = useCallback(async () => {
    if (tenantId == null || numericId == null) return;
    const g = await getProductFamily(tenantId, numericId);
    setBaseProductId(g.base_product_id != null ? Number(g.base_product_id) : null);
    setBaseProductName(g.base_product_name ?? null);
    setAttributes(fromApiAttributes(g.attributes));
    setMembers(g.members ?? []);
    setServerCombinationCount(g.combination_count ?? 0);
    await refreshMissing(tenantId, numericId);
  }, [tenantId, numericId, refreshMissing]);

  const onAttachExisting = async (hit: ProductSearchHit | null) => {
    if (!hit || tenantId == null || numericId == null) return;
    setAttachBusy(true);
    try {
      await attachProductFamily(tenantId, hit.id, numericId);
      toast.success(`Dołączono „${hit.name || hit.id}” do rodziny.`);
      await reloadFamily();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się dołączyć produktu."));
    } finally {
      setAttachBusy(false);
    }
  };

  const onSave = async () => {
    if (tenantId == null) return;
    const payload = toPayload();
    if (!payload.name) {
      toast.error("Podaj nazwę rodziny.");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await createProductFamily(tenantId, payload);
        toast.success("Utworzono rodzinę produktów.");
        navigate(`/product-families/${created.id}/edit`, { replace: true });
      } else if (numericId != null) {
        const updated = await updateProductFamily(tenantId, numericId, payload);
        setName(updated.name);
        setIsActive(updated.is_active);
        setBaseProductId(updated.base_product_id != null ? Number(updated.base_product_id) : null);
        setBaseProductName(updated.base_product_name ?? null);
        setAttributes(fromApiAttributes(updated.attributes));
        setMembers(updated.members ?? []);
        setServerCombinationCount(updated.combination_count ?? 0);
        await refreshMissing(tenantId, numericId);
        toast.success("Zapisano rodzinę produktów.");
      }
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Zapis nie powiódł się."));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (tenantId == null || numericId == null) return;
    if (!window.confirm(`Usunąć rodzinę „${name || "bez nazwy"}”?`)) return;
    try {
      await deleteProductFamily(tenantId, numericId);
      toast.success("Usunięto.");
      navigate("/product-families");
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Usuwanie nie powiodło się."));
    }
  };

  const scrollToGenerator = () => {
    document.getElementById("family-generator")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) {
    return (
      <PageLayout>
        <p className="text-sm text-slate-500">Ładowanie…</p>
      </PageLayout>
    );
  }

  const statusLabel = isActive ? "Aktywna" : "Nieaktywna";

  return (
    <PageLayout>
      <ListPageHeader
        title={isNew ? "Nowa rodzina produktów" : name.trim() || "Rodzina produktów"}
        breadcrumbs={[
          { label: UI_STRINGS.navigation.assortment },
          { label: UI_STRINGS.navigation.productFamilies, to: "/product-families" },
          { label: isNew ? "Nowa" : "Edycja" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!isNew ? (
              <SecondaryButton type="button" density="compact" onClick={scrollToGenerator}>
                <Sparkles className="mr-1.5 h-4 w-4" strokeWidth={2} aria-hidden />
                Generator
              </SecondaryButton>
            ) : null}
            <PrimaryButton type="button" density="compact" disabled={saving} onClick={() => void onSave()}>
              {saving ? "Zapisywanie…" : "Zapisz"}
            </PrimaryButton>
            {!isNew ? (
              <button
                type="button"
                className={dangerOutlineButtonClassFor("compact")}
                onClick={() => void onDelete()}
              >
                <Trash2 className="mr-1.5 h-4 w-4" strokeWidth={2} aria-hidden />
                Usuń
              </button>
            ) : null}
          </div>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{name.trim() || "Bez nazwy"}</p>
        </div>
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"
          }`}
        >
          {statusLabel}
        </span>
        <span className="text-sm text-slate-600">
          <span className="font-semibold tabular-nums text-slate-900">{productCount}</span> produktów
        </span>
        <span className="min-w-0 truncate text-sm text-slate-600">
          Bazowy:{" "}
          <span className="font-medium text-slate-900">
            {baseProductName?.trim() || (baseProductId != null ? `#${baseProductId}` : "—")}
          </span>
        </span>
      </div>

      <div className="mt-6 space-y-6">
        <FamilyEditInfoCard
          name={name}
          setName={setName}
          isActive={isActive}
          setIsActive={setIsActive}
          tenantId={tenantId}
          baseProductId={baseProductId}
          baseProductName={baseProductName}
          onBaseSelect={(hit) => {
            if (!hit) {
              setBaseProductId(null);
              setBaseProductName(null);
              return;
            }
            setBaseProductId(hit.id);
            setBaseProductName(hit.name || `Produkt #${hit.id}`);
          }}
          saving={saving}
          productCount={productCount}
          attributeCount={liveAttributeCount}
          combinationCount={combinationCount}
          missingCount={kpiMissing}
        />

        <FamilyEditAttributesSection attributes={attributes} setAttributes={setAttributes} />

        {!isNew && tenantId != null && numericId != null ? (
          <FamilyEditMembersCard
            tenantId={tenantId}
            familyId={numericId}
            members={members}
            attachBusy={attachBusy}
            onAttach={(hit) => void onAttachExisting(hit)}
          />
        ) : null}

        {!isNew && tenantId != null && numericId != null ? (
          <div id="family-generator">
            <ProductFamilyGeneratorPanel
              tenantId={tenantId}
              familyId={numericId}
              onGenerated={() => {
                void reloadFamily();
              }}
              onPreviewChange={(p) => {
                setMissingCount(p.missing_count ?? 0);
                setServerCombinationCount(p.combination_count ?? 0);
              }}
            />
          </div>
        ) : null}
      </div>
    </PageLayout>
  );
}
