import { useState } from "react";

// matchesFilter decides how the `filter` string maps onto an item - callers own that
// meaning (tags, kind, category, ...) since it differs per item shape. Defaults to
// "everything matches", which is a no-op for callers that never call setFilter.
//
// customName is optional on the constraint, so every existing caller passes
// through unchanged and only the lists that carry 047's overrides pay it any
// attention. Searching has to see both names: the row displays the custom one,
// so matching only on `name` would make a renamed item unfindable by the only
// word on screen — and matching only on the custom one would hide it from
// someone searching for what the rules call it.
export function useSearchBar<T extends { name: string; customName?: string | null }>(
  items: T[],
  matchesFilter: (item: T, filter: string) => boolean = () => true,
) {
  const [filter, setFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const needle = search.toLowerCase();
  const filtered = items
    .filter((item) => filter === "" || matchesFilter(item, filter))
    .filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        (item.customName?.toLowerCase().includes(needle) ?? false),
    );
  return { filter, setFilter, search, setSearch, filtered };
}
