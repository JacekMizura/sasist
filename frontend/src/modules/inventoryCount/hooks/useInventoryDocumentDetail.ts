import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import {
  approveInventoryDocument,
  downloadInventoryAuditPackageBlob,
  downloadInventoryReportBlob,
  fetchInventoryAuditLog,
  fetchInventoryConflicts,
  fetchInventoryDocument,
  fetchInventoryDocumentTimelines,
  fetchInventoryPostingPreview,
  fetchInventoryUnknownProducts,
  completeInventoryRecount,
  generateInventoryRecounts,
  getDocumentDifferenceAnalysis,
  listDocumentLines,
  postInventoryDocumentAdjustments,
  rejectInventoryDocument,
  submitInventoryDocumentForApproval,
  updateInventoryWizard,
  type InventoryConflictsRead,
  type InventoryConflictItem,
  type InventoryDocumentRead,
  type InventoryLineFocus,
  type InventoryLineRead,
  type InventoryPostingPreview,
  type InventoryUnknownProductRead,
} from "@/api/inventoryCountApi";
import { triggerBrowserDownload } from "@/modules/inventoryCount/erp/downloadHelpers";
import { formatInventoryRequestError } from "@/modules/inventoryCount/inventoryCountApiErrors";
import {
  canSubmitInventoryDocument,
  inventorySubmitBlockHint,
} from "@/modules/inventoryCount/inventorySubmitReadiness";
import {
  EMPTY_TABLE_FILTERS,
  filterInventoryLines,
  loadPersistedTableFilters,
  persistTableFilters,
  type InventoryTableFilters,
} from "@/modules/inventoryCount/inventoryTableFilters";

export type InventoryDocTab = "progress" | "differences" | "control";
export type InventoryApprovalMode = "submit" | "approve" | "post";

const TAB_STORAGE_PREFIX = "inv-doc-tab-";

function loadPersistedTab(documentId: number): InventoryDocTab {
  try {
    const raw = sessionStorage.getItem(`${TAB_STORAGE_PREFIX}${documentId}`);
    if (raw === "progress" || raw === "differences" || raw === "control") return raw;
  } catch {
    /* ignore */
  }
  return "progress";
}

export function useInventoryDocumentDetail(documentId: number, tenantId: number) {
  const id = documentId;

  const [tab, setTab] = useState<InventoryDocTab>(() => (Number.isFinite(id) ? loadPersistedTab(id) : "progress"));
  const [showUncounted, setShowUncounted] = useState(false);
  const [doc, setDoc] = useState<InventoryDocumentRead | null>(null);
  const [lines, setLines] = useState<InventoryLineRead[]>([]);
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof getDocumentDifferenceAnalysis>> | null>(null);
  const [auditLog, setAuditLog] = useState<Awaited<ReturnType<typeof fetchInventoryAuditLog>> | null>(null);
  const [timelines, setTimelines] = useState<Awaited<ReturnType<typeof fetchInventoryDocumentTimelines>> | null>(null);
  const [conflicts, setConflicts] = useState<InventoryConflictsRead | null>(null);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [unknownProducts, setUnknownProducts] = useState<InventoryUnknownProductRead[]>([]);
  const [unknownLoading, setUnknownLoading] = useState(false);
  const [opsPreview, setOpsPreview] = useState<InventoryPostingPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const [linesLoading, setLinesLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tableFilters, setTableFilters] = useState<InventoryTableFilters>(() =>
    Number.isFinite(id) ? loadPersistedTableFilters(id) : EMPTY_TABLE_FILTERS,
  );
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalMode, setApprovalMode] = useState<InventoryApprovalMode>("submit");
  const [approvalPreview, setApprovalPreview] = useState<InventoryPostingPreview | null>(null);
  const [approvalPreviewLoading, setApprovalPreviewLoading] = useState(false);
  const [conflictBusy, setConflictBusy] = useState(false);
  const approvalActionInFlightRef = useRef(false);
  const postIdempotencyKeyRef = useRef<string | null>(null);

  const lineFocus: InventoryLineFocus =
    tab === "differences" ? "differences" : showUncounted ? "all" : "operational";

  const updateFilters = useCallback(
    (next: InventoryTableFilters) => {
      setTableFilters(next);
      if (Number.isFinite(id)) persistTableFilters(id, next);
    },
    [id],
  );

  const changeTab = useCallback(
    (next: InventoryDocTab) => {
      setTab(next);
      if (Number.isFinite(id)) {
        try {
          sessionStorage.setItem(`${TAB_STORAGE_PREFIX}${id}`, next);
        } catch {
          /* ignore */
        }
      }
    },
    [id],
  );

  const loadDoc = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setErr(null);
    try {
      const [d, diff, preview] = await Promise.all([
        fetchInventoryDocument(tenantId, id),
        getDocumentDifferenceAnalysis(tenantId, id),
        fetchInventoryPostingPreview(tenantId, id).catch(() => null),
      ]);
      setDoc(d);
      setAnalysis(diff);
      setOpsPreview(preview);
    } catch {
      setErr("Nie udało się wczytać dokumentu inwentaryzacji.");
    }
  }, [tenantId, id]);

  const loadLines = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setLinesLoading(true);
    try {
      const ln = await listDocumentLines(tenantId, id, { focus: lineFocus });
      setLines(ln);
    } finally {
      setLinesLoading(false);
    }
  }, [tenantId, id, lineFocus]);

  const loadConflicts = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setConflictsLoading(true);
    try {
      const data = await fetchInventoryConflicts(tenantId, id);
      setConflicts(data);
    } catch {
      setConflicts(null);
    } finally {
      setConflictsLoading(false);
    }
  }, [tenantId, id]);

  const loadUnknown = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setUnknownLoading(true);
    try {
      const items = await fetchInventoryUnknownProducts(tenantId, id, "draft");
      setUnknownProducts(items);
    } catch {
      setUnknownProducts([]);
    } finally {
      setUnknownLoading(false);
    }
  }, [tenantId, id]);

  const loadAudit = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    const [log, tl] = await Promise.all([
      fetchInventoryAuditLog(tenantId, id),
      fetchInventoryDocumentTimelines(tenantId, id),
    ]);
    setAuditLog(log);
    setTimelines(tl);
  }, [tenantId, id]);

  useEffect(() => {
    void loadDoc();
    void loadConflicts();
    void loadUnknown();
  }, [loadDoc, loadConflicts, loadUnknown]);

  useEffect(() => {
    if (tab === "control") {
      void loadAudit();
    } else {
      void loadLines();
    }
  }, [tab, loadLines, loadAudit]);

  const filteredLines = useMemo(() => filterInventoryLines(lines, tableFilters), [lines, tableFilters]);

  const saveTitle = useCallback(async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const updated = await updateInventoryWizard(tenantId, doc.id, {
        title: titleDraft.trim() || null,
        notes: notesDraft.trim() || null,
      });
      setDoc(updated);
      setEditingTitle(false);
      toast.success("Zapisano tytuł dokumentu.");
    } catch {
      toast.error("Nie udało się zapisać tytułu.");
    } finally {
      setBusy(false);
    }
  }, [doc, tenantId, titleDraft, notesDraft]);

  const openApprovalModal = useCallback(
    async (mode: InventoryApprovalMode) => {
      setApprovalMode(mode);
      setApprovalOpen(true);
      setApprovalPreview(null);
      setApprovalPreviewLoading(true);
      postIdempotencyKeyRef.current =
        mode === "post" && typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : mode === "post"
            ? `post-${Date.now()}-${Math.random().toString(36).slice(2)}`
            : null;
      try {
        const preview = await fetchInventoryPostingPreview(tenantId, id);
        setApprovalPreview(preview);
      } catch {
        toast.error("Nie udało się wczytać podsumowania.");
        setApprovalOpen(false);
        postIdempotencyKeyRef.current = null;
      } finally {
        setApprovalPreviewLoading(false);
      }
    },
    [tenantId, id],
  );

  const confirmApprovalAction = useCallback(async () => {
    if (approvalActionInFlightRef.current) return;
    approvalActionInFlightRef.current = true;
    setBusy(true);
    try {
      if (approvalMode === "submit") await submitInventoryDocumentForApproval(tenantId, id);
      else if (approvalMode === "approve") await approveInventoryDocument(tenantId, id);
      else {
        await postInventoryDocumentAdjustments(tenantId, id, {
          idempotencyKey: postIdempotencyKeyRef.current ?? undefined,
          expectedVersion: doc?.version,
        });
      }
      setApprovalOpen(false);
      postIdempotencyKeyRef.current = null;
      await loadDoc();
      await loadConflicts();
      await loadUnknown();
      toast.success("Zapisano.");
    } catch (actionErr) {
      console.error("[inventory-count action]", approvalMode, actionErr);
      toast.error(formatInventoryRequestError(actionErr));
      await loadDoc();
    } finally {
      approvalActionInFlightRef.current = false;
      setBusy(false);
    }
  }, [approvalMode, tenantId, id, doc?.version, loadDoc, loadConflicts, loadUnknown]);

  const actionReject = useCallback(async () => {
    setBusy(true);
    try {
      await rejectInventoryDocument(tenantId, id);
      await loadDoc();
      toast.success("Odrzucono dokument.");
    } catch (actionErr) {
      toast.error(formatInventoryRequestError(actionErr));
    } finally {
      setBusy(false);
    }
  }, [tenantId, id, loadDoc]);

  const runDownload = useCallback(
    async (key: string, fn: () => Promise<{ blob: Blob; fileName: string }>) => {
      setDownloadBusy(key);
      try {
        const { blob, fileName } = await fn();
        triggerBrowserDownload(blob, fileName);
        toast.success(`Pobrano: ${fileName}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Pobieranie nie powiodło się.");
      } finally {
        setDownloadBusy(null);
      }
    },
    [],
  );

  const startEditTitle = useCallback(() => {
    if (!doc) return;
    setTitleDraft(doc.title ?? "");
    setNotesDraft(doc.notes ?? "");
    setEditingTitle(true);
  }, [doc]);

  const refreshAfterUnknownChange = useCallback(() => {
    void loadUnknown();
    void loadDoc();
    void loadLines();
  }, [loadUnknown, loadDoc, loadLines]);

  const refreshAfterConflictAction = useCallback(async () => {
    await Promise.all([loadDoc(), loadLines(), loadConflicts()]);
  }, [loadConflicts, loadDoc, loadLines]);

  const resolveConflictQuantity = useCallback(
    async (conflict: InventoryConflictItem, quantity: number) => {
      if (!Number.isFinite(id)) return;
      setConflictBusy(true);
      try {
        let recountId = conflict.recount_id;
        if (!recountId) {
          await generateInventoryRecounts(tenantId, id);
          const refreshed = await fetchInventoryConflicts(tenantId, id);
          recountId = refreshed.items.find((item) => item.line_id === conflict.line_id)?.recount_id ?? null;
        }
        if (!recountId) {
          toast.error("Nie udało się utworzyć zadania recount.");
          return;
        }
        await completeInventoryRecount(tenantId, recountId, quantity);
        await refreshAfterConflictAction();
        toast.success(`Zatwierdzono ${quantity} szt.`);
      } catch (actionErr) {
        toast.error(formatInventoryRequestError(actionErr));
      } finally {
        setConflictBusy(false);
      }
    },
    [id, refreshAfterConflictAction, tenantId],
  );

  const requestConflictRecount = useCallback(
    async (conflict: InventoryConflictItem) => {
      if (!Number.isFinite(id)) return;
      setConflictBusy(true);
      try {
        const result = await generateInventoryRecounts(tenantId, id);
        await refreshAfterConflictAction();
        toast.success(
          result.recounts_created > 0
            ? `Utworzono ${result.recounts_created} zadań recount.`
            : "Recount już istnieje — odświeżono listę.",
        );
      } catch (actionErr) {
        toast.error(formatInventoryRequestError(actionErr));
      } finally {
        setConflictBusy(false);
      }
    },
    [id, refreshAfterConflictAction, tenantId],
  );

  const derived = useMemo(() => {
    if (!doc) {
      return {
        submitReady: false,
        submitHint: undefined as string | undefined,
        updatesStock: true,
        scopeMode: "full",
        movementPolicy: "",
        conflictCount: 0,
        surplus: 0,
        shortage: 0,
        hasValueBreakdown: false,
        resultPolicy: "update_stock",
      };
    }
    const resultPolicy = doc.result_policy ?? (doc.strategy?.result_policy as string) ?? "update_stock";
    const surplus = analysis?.surplus_value_net ?? 0;
    const shortage = analysis?.shortage_value_net ?? 0;
    return {
      submitReady: canSubmitInventoryDocument(doc),
      submitHint: inventorySubmitBlockHint(doc),
      updatesStock: resultPolicy === "update_stock",
      scopeMode: String(doc.filters?.scope_mode ?? "full"),
      movementPolicy: doc.movement_policy ?? doc.lock_mode,
      conflictCount: analysis?.summary?.operator_conflicts ?? conflicts?.total_conflicts ?? 0,
      surplus,
      shortage,
      hasValueBreakdown: surplus > 0 || shortage > 0,
      resultPolicy,
    };
  }, [doc, analysis, conflicts]);

  return {
    err,
    doc,
    analysis,
    tab,
    showUncounted,
    setShowUncounted,
    changeTab,
    tableFilters,
    updateFilters,
    filteredLines,
    linesLoading,
    conflicts,
    conflictsLoading,
    conflictBusy,
    resolveConflictQuantity,
    requestConflictRecount,
    unknownProducts,
    unknownLoading,
    opsPreview,
    auditLog,
    timelines,
    busy,
    downloadBusy,
    editingTitle,
    setEditingTitle,
    titleDraft,
    setTitleDraft,
    notesDraft,
    setNotesDraft,
    saveTitle,
    startEditTitle,
    approvalOpen,
    setApprovalOpen,
    approvalMode,
    approvalPreview,
    approvalPreviewLoading,
    openApprovalModal,
    confirmApprovalAction,
    actionReject,
    runDownload,
    refreshAfterUnknownChange,
    derived,
    documentId: id,
    tenantId,
  };
}

export type InventoryDocumentDetailState = ReturnType<typeof useInventoryDocumentDetail>;
