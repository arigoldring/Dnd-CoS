import { useState } from "react";

// T is a placeholder that gets filled at call time, object calling must containe a name and tages field
export function useSearchBar<T extends { name: string; tags: string[] }>(
  items: T[],
) {
  const [filter, setFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const filtered = items
    .filter((item) => filter === "" || item.tags.includes(filter))
    .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
  return { filter, setFilter, search, setSearch, filtered };
}
