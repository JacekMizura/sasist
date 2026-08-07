import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { listSellasistInputClass } from "../../../components/listPage/listSellasistTokens";
import { WMS_SETTINGS_SEARCH_CATALOG } from "./catalog";
import { navigateToWmsSetting } from "./navigateToSetting";
import {
  searchWmsSettingsCatalog,
  WMS_SETTINGS_SEARCH_MIN_CHARS,
} from "./searchSettingsCatalog";
import type { WmsSettingsSearchHit } from "./types";

function pathLine(hit: WmsSettingsSearchHit): string {
  const parts = [hit.tabLabel, hit.sectionLabel];
  if (hit.groupLabel) parts.push(hit.groupLabel.replace(/^[A-Z]\.\s*/, ""));
  return parts.join(" → ");
}

/**
 * VS Code / JetBrains-style global settings search for the whole Ustawienia WMS module.
 */
export function WmsSettingsGlobalSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [navigating, setNavigating] = useState(false);

  const hits = useMemo(() => searchWmsSettingsCatalog(WMS_SETTINGS_SEARCH_CATALOG, query), [query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const onDoc = (ev: MouseEvent) => {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const showList = open && query.trim().length >= WMS_SETTINGS_SEARCH_MIN_CHARS;

  const selectHit = async (hit: WmsSettingsSearchHit) => {
    setNavigating(true);
    setOpen(false);
    try {
      await navigateToWmsSetting(navigate, hit, {
        currentPath: location.pathname,
        currentSearch: location.search,
      });
      setQuery("");
    } finally {
      setNavigating(false);
      inputRef.current?.blur();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
      return;
    }
    if (!showList || hits.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, hits.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits.length === 1 ? hits[0] : hits[activeIndex];
      if (hit) void selectHit(hit);
    }
  };

  return (
    <div ref={rootRef} className="relative w-full min-w-0 sm:w-72 lg:w-80">
      <label className="relative block">
        <span className="sr-only">Szukaj ustawień WMS</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          strokeWidth={2}
          aria-hidden
        />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && hits[activeIndex] ? `${listId}-opt-${activeIndex}` : undefined}
          value={query}
          disabled={navigating}
          placeholder="Szukaj ustawień…"
          autoComplete="off"
          className={`${listSellasistInputClass} !h-10 w-full pl-9 pr-9`}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Wyczyść"
            onClick={() => {
              setQuery("");
              setOpen(false);
              inputRef.current?.focus();
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </label>

      {showList ? (
        <div
          id={listId}
          role="listbox"
          className="absolute right-0 z-[80] mt-1 max-h-[min(70vh,22rem)] w-[min(100vw-2rem,22rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/60"
        >
          {hits.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-500">Brak ustawień dla „{query.trim()}”.</p>
          ) : (
            hits.map((hit, idx) => {
              const active = idx === activeIndex;
              return (
                <button
                  key={hit.id}
                  id={`${listId}-opt-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={
                    active
                      ? "flex w-full flex-col gap-0.5 bg-orange-50 px-3 py-2.5 text-left"
                      : "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-slate-50"
                  }
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => void selectHit(hit)}
                >
                  <span className="text-sm font-semibold text-slate-900">{hit.label}</span>
                  <span className="text-xs text-slate-500">{pathLine(hit)}</span>
                </button>
              );
            })
          )}
        </div>
      ) : null}

      {open && query.trim().length > 0 && query.trim().length < WMS_SETTINGS_SEARCH_MIN_CHARS ? (
        <p className="absolute right-0 z-[80] mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-sm">
          Wpisz co najmniej {WMS_SETTINGS_SEARCH_MIN_CHARS} znaki…
        </p>
      ) : null}
    </div>
  );
}
