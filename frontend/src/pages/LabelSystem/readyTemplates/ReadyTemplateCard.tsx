import { MoreVertical, Star } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { STARTER_USE_CTA_LABEL } from "@/components/templates/starterFlow";

type Props = {
  name: string;
  description: string;
  metaLine: string;
  /** Preview band — same slot for label canvas or document thumbnail. */
  thumbnail: ReactNode;
  isSystem?: boolean;
  isDefault?: boolean;
  /**
   * `starter` = immutable system template: single „Użyj startera” CTA, no edit/delete.
   * `owned` = user template: Edytuj / Użyj (+ overflow including Usuń when provided).
   */
  mode?: "starter" | "owned";
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  onEdit?: () => void;
  onUse?: () => void;
  /** Starter mode primary action (create user copy). */
  onUseStarter?: () => void;
  onDuplicate?: () => void;
  onExport?: () => void;
  onDelete?: () => void;
};

/**
 * Library card — preview-first, outline actions, overflow menu.
 * Shared by Szablony etykiet (Gotowe) and Szablony wydruków (Startery).
 */
export default function ReadyTemplateCard({
  name,
  description,
  metaLine,
  thumbnail,
  isSystem,
  isDefault,
  mode = "owned",
  primaryActionLabel = "Edytuj",
  secondaryActionLabel = "Użyj",
  onEdit,
  onUse,
  onUseStarter,
  onDuplicate,
  onExport,
  onDelete,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isStarter = mode === "starter";

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const showOverflow = isStarter ? Boolean(onExport) : Boolean(onDuplicate || onExport || onDelete);

  return (
    <article
      className="group relative flex h-[300px] flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-orange-300 hover:shadow-md"
      style={{ borderRadius: 16 }}
    >
      <div className="relative h-[48%] shrink-0 bg-white">
        <div className="h-full border-b border-[#E5E7EB] bg-white">{thumbnail}</div>
        <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          {isSystem || isStarter ? (
            <span className="pointer-events-auto rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 shadow-sm">
              Systemowy
            </span>
          ) : null}
          {isDefault ? (
            <span className="pointer-events-auto inline-flex items-center gap-0.5 rounded-md border border-amber-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 shadow-sm">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
              Domyślny
            </span>
          ) : null}
        </div>
        {showOverflow ? (
          <div className="absolute right-2 top-2" ref={menuRef}>
            <button
              type="button"
              aria-label="Więcej akcji"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-slate-600 shadow-sm opacity-100 transition hover:bg-white hover:shadow-md md:opacity-0 md:group-hover:opacity-100"
            >
              <MoreVertical className="h-4 w-4" strokeWidth={2} />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 min-w-[168px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
              >
                {!isStarter && onDuplicate ? (
                  <>
                    <MenuItem
                      label="Duplikuj"
                      onClick={() => {
                        setMenuOpen(false);
                        onDuplicate();
                      }}
                    />
                    <MenuItem
                      label="Utwórz kopię"
                      onClick={() => {
                        setMenuOpen(false);
                        onDuplicate();
                      }}
                    />
                  </>
                ) : null}
                {onExport ? (
                  <MenuItem
                    label="Eksportuj"
                    onClick={() => {
                      setMenuOpen(false);
                      onExport();
                    }}
                  />
                ) : null}
                {!isStarter && onDelete ? (
                  <MenuItem
                    label="Usuń"
                    danger
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-5">
        <h3 className="line-clamp-1 text-sm font-semibold text-slate-900">{name}</h3>
        <p className="mt-1 line-clamp-2 flex-1 text-xs leading-relaxed text-slate-500">{description}</p>
        <p className="mt-2 text-xs text-gray-500">{metaLine}</p>
        <div className="mt-3 flex gap-2">
          {isStarter ? (
            <button
              type="button"
              onClick={onUseStarter}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-orange-300 hover:shadow-md"
            >
              {STARTER_USE_CTA_LABEL}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-orange-300 hover:shadow-md"
              >
                {primaryActionLabel}
              </button>
              <button
                type="button"
                onClick={onUse}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-orange-300 hover:shadow-md"
              >
                {secondaryActionLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={[
        "block w-full px-3 py-2 text-left text-sm transition hover:bg-orange-50",
        danger ? "font-medium text-red-600" : "text-slate-700",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
