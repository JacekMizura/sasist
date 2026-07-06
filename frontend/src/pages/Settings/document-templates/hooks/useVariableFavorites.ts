import { useCallback, useEffect, useState } from "react";

function storageKey(templateId: number) {
  return `dte-var-favorites-${templateId}`;
}

export function useVariableFavorites(templateId: number) {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(templateId));
      if (raw) setFavorites(JSON.parse(raw) as string[]);
      else setFavorites([]);
    } catch {
      setFavorites([]);
    }
  }, [templateId]);

  const persist = useCallback(
    (next: string[]) => {
      setFavorites(next);
      try {
        localStorage.setItem(storageKey(templateId), JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [templateId],
  );

  const toggleFavorite = useCallback(
    (insert: string) => {
      persist(favorites.includes(insert) ? favorites.filter((x) => x !== insert) : [...favorites, insert]);
    },
    [favorites, persist],
  );

  const isFavorite = useCallback((insert: string) => favorites.includes(insert), [favorites]);

  return { favorites, toggleFavorite, isFavorite };
}
