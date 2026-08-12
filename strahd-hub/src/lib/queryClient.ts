import { QueryClient } from "@tanstack/react-query";

// Module-scoped rather than created in App so non-component code (signOut)
// can reach it; App would be a circular import (App → Layout → auth → App).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Non-zero so the cache is actually a cache: at the default 0 every
      // mount refetches, which both wastes round-trips on navigation and makes
      // invalidation bugs invisible — a missing invalidateQueries after a
      // write looks identical to a correct one when everything refetches
      // anyway. Writes show up immediately via explicit invalidation; other
      // players' writes arrive on the next focus refetch (library default,
      // kept deliberately). One minute only bounds how stale a quietly open
      // tab can get between those two signals.
      staleTime: 60_000,
    },
  },
});
