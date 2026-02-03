import { useMemo, useState } from "react";

import type { ListSource } from "../../app/types";

type ApiPost = <T>(path: string, body: unknown) => Promise<T>;

export function useListsFeature({
  apiPost,
  loadAll,
  lists,
  normalizedSearch
}: {
  apiPost: ApiPost;
  loadAll: () => Promise<void>;
  lists: ListSource[];
  normalizedSearch: string;
}) {
  const [newListType, setNewListType] = useState("spotify");
  const [newListId, setNewListId] = useState("");
  const [newListName, setNewListName] = useState("");

  const filteredLists = useMemo(() => {
    if (!normalizedSearch) return lists;
    return lists.filter((list) => {
      const matchName = list.name.toLowerCase().includes(normalizedSearch);
      const matchType = list.type.toLowerCase().includes(normalizedSearch);
      const matchId = list.external_id.toLowerCase().includes(normalizedSearch);
      return matchName || matchType || matchId;
    });
  }, [lists, normalizedSearch]);

  const addList = async () => {
    if (!newListId.trim() || !newListName.trim()) return;
    await apiPost("/api/lists", {
      type: newListType,
      externalId: newListId.trim(),
      name: newListName.trim(),
      enabled: true
    });
    setNewListId("");
    setNewListName("");
    await loadAll();
  };

  return {
    newListType,
    setNewListType,
    newListId,
    setNewListId,
    newListName,
    setNewListName,
    addList,
    filteredLists
  };
}

