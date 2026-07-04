import { useCallback, useMemo, useState } from "react";
import { Bookmark, ChevronDown, RotateCcw, Star } from "lucide-react";
import toast from "react-hot-toast";

import { useAuth } from "../../context/AuthContext";
import { isSuperRole } from "../../auth/isSuperRole";
import { listSellasistInputClass, listSellasistToolbarSquareBtn } from "../../components/listPage/listSellasistTokens";
import type { ListViewPresetRecord } from "./listViewStateTypes";
import type { SavePresetInput } from "./listViewStateTypes";

type Props = {
  presets: ListViewPresetRecord[];
  onApplyPreset: (preset: ListViewPresetRecord) => void;
  onSavePreset: (input: SavePresetInput) => Promise<void>;
  onDeletePreset: (presetId: number) => Promise<void>;
  onSetDefaultPreset: (presetId: number) => Promise<void>;
  onResetView: () => Promise<void>;
  className?: string;
};

export function ListViewPresetsMenu({
  presets,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  onSetDefaultPreset,
  onResetView,
  className = "",
}: Props) {
  const { user } = useAuth();
  const isAdmin = isSuperRole(user?.role) || (user?.role ?? "").toLowerCase() === "admin";
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [overwriteId, setOverwriteId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  const privatePresets = useMemo(() => presets.filter((p) => !p.is_public), [presets]);
  const publicPresets = useMemo(() => presets.filter((p) => p.is_public), [presets]);

  const handleSave = useCallback(async () => {
    const name = presetName.trim();
    if (!name) {
      toast.error("Podaj nazwę szablonu.");
      return;
    }
    setBusy(true);
    try {
      await onSavePreset({
        name,
        isPublic: isAdmin && isPublic,
        isDefault,
        overwritePresetId: overwriteId === "" ? undefined : Number(overwriteId),
      });
      toast.success("Szablon zapisany.");
      setSaveOpen(false);
      setPresetName("");
      setOverwriteId("");
      setIsDefault(false);
      setIsPublic(false);
    } catch {
      toast.error("Nie udało się zapisać szablonu.");
    } finally {
      setBusy(false);
    }
  }, [isAdmin, isDefault, isPublic, onSavePreset, overwriteId, presetName]);

  const handleReset = useCallback(async () => {
    if (!confirm("Resetuj widok do ustawień domyślnych i usuń autosave?")) return;
    setBusy(true);
    try {
      await onResetView();
      toast.success("Przywrócono widok domyślny.");
    } catch {
      toast.error("Nie udało się zresetować widoku.");
    } finally {
      setBusy(false);
    }
  }, [onResetView]);

  return (
    <div className={`relative inline-flex items-center gap-1 ${className}`}>
      <div className="relative">
        <button
          type="button"
          className={`${listSellasistToolbarSquareBtn} inline-flex items-center gap-1.5 px-3`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Bookmark className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline text-sm font-medium">Widoki</span>
          <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
        </button>
        {menuOpen ? (
          <>
            <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="Zamknij menu" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-1 min-w-[240px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  setMenuOpen(false);
                  setSaveOpen(true);
                }}
              >
                Zapisz bieżący widok…
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setMenuOpen(false);
                  void handleReset();
                }}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Resetuj widok
              </button>
              {privatePresets.length > 0 ? (
                <div className="border-t border-slate-100 px-2 py-1">
                  <p className="px-1 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Moje szablony</p>
                  {privatePresets.map((p) => (
                    <PresetRow
                      key={p.id}
                      preset={p}
                      canManage
                      onApply={() => {
                        onApplyPreset(p);
                        setMenuOpen(false);
                      }}
                      onDefault={() => void onSetDefaultPreset(p.id)}
                      onDelete={() => void onDeletePreset(p.id)}
                    />
                  ))}
                </div>
              ) : null}
              {publicPresets.length > 0 ? (
                <div className="border-t border-slate-100 px-2 py-1">
                  <p className="px-1 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Publiczne</p>
                  {publicPresets.map((p) => (
                    <PresetRow
                      key={p.id}
                      preset={p}
                      canManage={isAdmin}
                      onApply={() => {
                        onApplyPreset(p);
                        setMenuOpen(false);
                      }}
                      onDefault={() => void onSetDefaultPreset(p.id)}
                      onDelete={() => void onDeletePreset(p.id)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {saveOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Zapisz szablon widoku</h3>
            <p className="mt-1 text-sm text-slate-500">Filtry, sortowanie, kolumny i pola filtrów — bez numeru strony.</p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Nazwa
              <input
                className={`${listSellasistInputClass} mt-1 w-full`}
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
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
                  <option value="">— nowy szablon —</option>
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
                Preset publiczny (cały tenant)
              </label>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" onClick={() => setSaveOpen(false)}>
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
      ) : null}
    </div>
  );
}

function PresetRow({
  preset,
  canManage,
  onApply,
  onDefault,
  onDelete,
}: {
  preset: ListViewPresetRecord;
  canManage: boolean;
  onApply: () => void;
  onDefault: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg px-1 py-0.5 hover:bg-slate-50">
      <button type="button" className="min-w-0 flex-1 truncate px-1 py-1.5 text-left text-sm text-slate-800" onClick={onApply}>
        {preset.is_default ? (
          <Star className="mr-1 inline h-3.5 w-3.5 text-amber-500" aria-hidden />
        ) : null}
        {preset.name}
      </button>
      {canManage ? (
        <div className="flex shrink-0 gap-0.5">
          {!preset.is_default ? (
            <button type="button" title="Ustaw domyślny" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-amber-600" onClick={onDefault}>
              <Star className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            title="Usuń"
            className="rounded px-1.5 py-1 text-xs text-red-600 hover:bg-red-50"
            onClick={() => {
              if (confirm(`Usunąć szablon „${preset.name}”?`)) onDelete();
            }}
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
