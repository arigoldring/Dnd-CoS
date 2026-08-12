import { QueryClient } from "@tanstack/react-query";

// Module-scoped rather than created in App so non-component code (signOut)
// can reach it; App would be a circular import (App → Layout → auth → App).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});
