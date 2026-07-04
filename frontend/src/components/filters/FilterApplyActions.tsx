import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw, Star } from "lucide-react";
import toast from "react-hot-toast";

import { useAuth } from "../../context/AuthContext";
import { isSuperRole } from "../../auth/isSuperRole";
import { listSellasistInputClass } from "../listPage/listSellasistTokens";
import type { ListViewActionsBinding } from "../../preferences/listView/listViewActionsTypes";
import type { ListViewPresetRecord } from "../../preferences/listView/listViewStateTypes";
import type { SavePresetInput } from "../../preferences/listView/listViewStateTypes";
import {
  filterToolbarBtnApply,
  filterToolbarBtnSecondary,
} from "./filterUiTokens";

const splitApplyLeftClass =
  "inline-flex h-[2.375rem] items-center justify-center rounded-l-md rounded-r-none bg-amber-600 px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-1 border-r border-amber-700/80";

const splitApplyToggleClass =
  "inline-flex h-[2.375rem] items-center justify-center rounded-r-md rounded-l-none bg-amber-600 px-2 text-white shadow-sm transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-1";

const menuItemClass =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-slate-700 transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none";

const menuSeparatorClass = "my-1 border-t border-slate-100";

export type FilterApplyActionsProps = {
  onClear: () => void;
  onApply: () => void;
  clearLabel?: string;
  applyLabel?: string;
  /** When set, shows split „Filtruj ▼” with view presets menu. */
  listView?: ListViewActionsBinding;
  /** Primary apply button type — use `submit` inside filter forms. */
  applyButtonType?: "button" | "submit";
  className?: string;
};

export function FilterApplyActions({
  onClear,
  onApply,
  clearLabel = "Wyczyść filtry",
  applyLabel = "Filtruj",
  listView,
  applyButtonType = "button",
  className = "",
}: FilterApplyActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadExpanded, setLoadExpanded] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setLoadExpanded(false);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [closeMenu, menuOpen]);

  const handleApplyFromMenu = useCallback(() => {
    closeMenu();
    onApply();
  }, [closeMenu, onApply]);

  const handleReset = useCallback(async () => {
    if (!listView) return;
    if (!confirm("Resetuj widok do ustawień domyślnych i usuń autosave?")) return;
    closeMenu();
    try {
      await listView.onResetView();
      toast.success("Przywrócono widok domyślny.");
    } catch {
      toast.error("Nie udało się zresetować widoku.");
    }
  }, [closeMenu, listView]);

  const presets = listView?.presets ?? [];
  const hasPresets = presets.length > 0;

  return (
    <>
      <div className={`flex flex-wrap items-center justify-end gap-2 ${className}`.trim()}>
        <button type="button" onClick={onClear} className={filterToolbarBtnSecondary}>
          {clearLabel}
        </button>

        {listView ? (
          <div ref={menuRef} className="relative inline-flex">
            <div className="inline-flex rounded-md shadow-sm">
              <button type={applyButtonType} onClick={onApply} className={splitApplyLeftClass}>
                {applyLabel}
              </button>
              <button
                type="button"
                className={splitApplyToggleClass}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="Opcje filtrowania i widoków"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${menuOpen ? "rotate-180" : ""}`} aria-hidden />
              </button>
            </div>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-1.5 w-[min(100vw-1.5rem,17rem)] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-900/5"
              >
                <button type="button" role="menuitem" className={menuItemClass} onClick={handleApplyFromMenu}>
                  {applyLabel}
                </button>

                <div className={menuSeparatorClass} role="separator" />

                <button
                  type="button"
                  role="menuitem"
                  className={menuItemClass}
                  onClick={() => {
                    closeMenu();
                    setSaveOpen(true);
                  }}
                >
                  Zapisz bieżący widok…
                </button>

                <div className="relative">
                  <button
                    type="button"
                    role="menuitem"
                    aria-expanded={loadExpanded}
                    className={`${menuItemClass} justify-between ${!hasPresets ? "text-slate-400" : ""}`}
                    disabled={!hasPresets}
                    onClick={() => {
                      if (!hasPresets) return;
                      setLoadExpanded((v) => !v);
                    }}
                  >
                    <span>Wczytaj widok</span>
                    {hasPresets ? (
                      <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${loadExpanded ? "rotate-90" : ""}`} aria-hidden />
                    ) : null}
                  </button>
                  {loadExpanded && hasPresets ? (
                    <div className="border-t border-slate-100 bg-slate-50/80 py-1">
                      <PresetLoadList
                        presets={presets}
                        onApply={(p) => {
                          listView.onApplyPreset(p);
                          closeMenu();
                          toast.success(`Wczytano widok „${p.name}”.`);
                        }}
                      />
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  role="menuitem"
                  className={menuItemClass}
                  onClick={() => {
                    closeMenu();
                    setManageOpen(true);
                  }}
                >
                  Zarządzaj widokami
                </button>

                <div className={menuSeparatorClass} role="separator" />

                <button type="button" role="menuitem" className={`${menuItemClass} text-slate-600`} onClick={() => void handleReset()}>
                  <RotateCcw className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  Resetuj widok
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <button type={applyButtonType} onClick={onApply} className={filterToolbarBtnApply}>
            {applyLabel}
          </button>
        )}
      </div>

      {listView && saveOpen ? (
        <ListViewSavePresetModal
          presets={presets}
          onClose={() => setSaveOpen(false)}
          onSave={listView.onSavePreset}
        />
      ) : null}

      {listView && manageOpen ? (
        <ListViewManagePresetsModal
          presets={presets}
          onClose={() => setManageOpen(false)}
          onApplyPreset={(p) => {
            listView.onApplyPreset(p);
            toast.success(`Wczytano widok „${p.name}”.`);
          }}
          onDeletePreset={listView.onDeletePreset}
          onSetDefaultPreset={listView.onSetDefaultPreset}
        />
      ) : null}
    </>
  );
}

function PresetLoadList({
  presets,
  onApply,
}: {
  presets: ListViewPresetRecord[];
  onApply: (preset: ListViewPresetRecord) => void;
}) {
  const privatePresets = useMemo(() => presets.filter((p) => !p.is_public), [presets]);
  const publicPresets = useMemo(() => presets.filter((p) => p.is_public), [presets]);

  return (
    <div className="max-h-48 overflow-y-auto px-1">
      {privatePresets.length > 0 ? (
        <PresetGroup label="Moje widoki" presets={privatePresets} onApply={onApply} />
      ) : null}
      {publicPresets.length > 0 ? (
        <PresetGroup label="Publiczne" presets={publicPresets} onApply={onApply} />
      ) : null}
    </div>
  );
}

function PresetGroup({
  label,
  presets,
  onApply,
}: {
  label: string;
  presets: ListViewPresetRecord[];
  onApply: (preset: ListViewPresetRecord) => void;
}) {
  return (
    <div className="py-0.5">
      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          className="flex w-full items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-left text-[13px] text-slate-800 hover:bg-white"
          onClick={() => onApply(p)}
        >
          {p.is_default ? <Star className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden /> : null}
          <span className="truncate">{p.name}</span>
        </button>
      ))}
    </div>
  );
}

function ListViewSavePresetModal({
  presets,
  onClose,
  onSave,
}: {
  presets: ListViewPresetRecord[];
  onClose: () => void;
  onSave: (input: SavePresetInput) => Promise<void>;
}) {
  const { user } = useAuth();
  const isAdmin = isSuperRole(user?.role) || (user?.role ?? "").toLowerCase() === "admin";
  const privatePresets = useMemo(() => presets.filter((p) => !p.is_public), [presets]);

  const [presetName, setPresetName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [overwriteId, setOverwriteId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  const handleSave = useCallback(async () => {
    const name = presetName.trim();
    if (!name) {
      toast.error("Podaj nazwę widoku.");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        name,
        isPublic: isAdmin && isPublic,
        isDefault,
        overwritePresetId: overwriteId === "" ? undefined : Number(overwriteId),
      });
      toast.success("Widok zapisany.");
      onClose();
    } catch {
      toast.error("Nie udało się zapisać widoku.");
    } finally {
      setBusy(false);
    }
  }, [isAdmin, isDefault, isPublic, onClose, onSave, overwriteId, presetName]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Zapisz bieżący widok</h3>
        <p className="mt-1 text-sm text-slate-500">Filtry, sortowanie, kolumny i pola filtrów — bez numeru strony.</p>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Nazwa
          <input
            className={`${listSellasistInputClass} mt-1 w-full`}
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSave();
              }
            }}
            autoFocus
          />
        </label>
        {privatePresets.length > 0 ? (
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Nadpisz istniejący (opcjonalnie)
            <select
              className={`${listSellasistInputClass} mt-1 w-full`}
              value={overwriteId}
              onChange={(e) => setOverwriteId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">— nowy widok —</option>
              {privatePresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Ustaw jako domyślny
        </label>
        {isAdmin ? (
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            Widok publiczny (cały tenant)
          </label>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" onClick={onClose}>
            Anuluj
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            onClick={() => void handleSave()}
          >
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
}

function ListViewManagePresetsModal({
  presets,
  onClose,
  onApplyPreset,
  onDeletePreset,
  onSetDefaultPreset,
}: {
  presets: ListViewPresetRecord[];
  onClose: () => void;
  onApplyPreset: (preset: ListViewPresetRecord) => void;
  onDeletePreset: (presetId: number) => Promise<void>;
  onSetDefaultPreset: (presetId: number) => Promise<void>;
}) {
  const { user } = useAuth();
  const isAdmin = isSuperRole(user?.role) || (user?.role ?? "").toLowerCase() === "admin";
  const privatePresets = useMemo(() => presets.filter((p) => !p.is_public), [presets]);
  const publicPresets = useMemo(() => presets.filter((p) => p.is_public), [presets]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[min(85vh,32rem)] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">Zarządzaj widokami</h3>
          <p className="mt-0.5 text-sm text-slate-500">Wczytaj, ustaw domyślny lub usuń zapisane widoki.</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {presets.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-slate-500">Brak zapisanych widoków.</p>
          ) : (
            <>
              {privatePresets.length > 0 ? (
                <ManageGroup
                  label="Moje widoki"
                  presets={privatePresets}
                  canManage
                  onApply={onApplyPreset}
                  onDefault={onSetDefaultPreset}
                  onDelete={onDeletePreset}
                />
              ) : null}
              {publicPresets.length > 0 ? (
                <ManageGroup
                  label="Publiczne"
                  presets={publicPresets}
                  canManage={isAdmin}
                  onApply={onApplyPreset}
                  onDefault={onSetDefaultPreset}
                  onDelete={onDeletePreset}
                />
              ) : null}
            </>
          )}
        </div>
        <div className="border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            className="ml-auto block rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
            onClick={onClose}
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}

function ManageGroup({
  label,
  presets,
  canManage,
  onApply,
  onDefault,
  onDelete,
}: {
  label: string;
  presets: ListViewPresetRecord[];
  canManage: boolean;
  onApply: (preset: ListViewPresetRecord) => void;
  onDefault: (presetId: number) => Promise<void>;
  onDelete: (presetId: number) => Promise<void>;
}) {
  return (
    <div className="py-1">
      <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      {presets.map((p) => (
        <div key={p.id} className="flex items-center gap-1 rounded-lg px-1 py-0.5 hover:bg-slate-50">
          <button
            type="button"
            className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm text-slate-800"
            onClick={() => onApply(p)}
          >
            {p.is_default ? <Star className="mr-1 inline h-3.5 w-3.5 text-amber-500" aria-hidden /> : null}
            {p.name}
          </button>
          {canManage ? (
            <div className="flex shrink-0 gap-0.5 pr-1">
              {!p.is_default ? (
                <button
                  type="button"
                  title="Ustaw domyślny"
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-600"
                  onClick={() => void onDefault(p.id)}
                >
                  <Star className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                title="Usuń"
                className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                onClick={() => {
                  if (confirm(`Usunąć widok „${p.name}”?`)) void onDelete(p.id);
                }}
              >
                Usuń
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
