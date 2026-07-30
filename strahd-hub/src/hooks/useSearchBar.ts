import { useState } from "react";

// matchesFilter decides how the `filter` string maps onto an item - callers own that
// meaning (tags, kind, category, ...) since it differs per item shape. Defaults to
// "everything matches", which is a no-op for callers that never call setFilter.
export function useSearchBar<T extends { name: string }>(
  items: T[],
  matchesFilter: (item: T, filter: string) => boolean = () => true,
) {
  const [filter, setFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const filtered = items
    .filter((item) => filter === "" || matchesFilter(item, filter))
    .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
  return { filter, setFilter, search, setSearch, filtered };
}
