import { useEffect, useMemo, useState } from "react";

import type { AudioDbArtist } from "../../app/types";

type ApiGet = <T>(path: string, options?: RequestInit) => Promise<T>;

export function useArtistSearchResults({ apiGet, searchTerm }: { apiGet: ApiGet; searchTerm: string }) {
  const [searchResults, setSearchResults] = useState<AudioDbArtist[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const clearSearchResults = useMemo(
    () => () => {
      setSearchResults([]);
      setSearchLoading(false);
    },
    []
  );

  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setSearchLoading(true);
        const results = await apiGet<AudioDbArtist[]>(
          `/api/search/artists?query=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        setSearchResults(results);
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          setSearchResults([]);
        }
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [apiGet, searchTerm]);

  return {
    searchResults,
    setSearchResults,
    clearSearchResults,
    searchLoading
  };
}

