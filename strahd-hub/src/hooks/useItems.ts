import { errorMessage } from "../lib/errors";
import { getItems } from "../services/items";
import { useQuery } from "@tanstack/react-query";

export function useItems() {
  return useQuery({
    queryKey: ["items"],
    queryFn: () =>
      getItems().catch((err) => {
        throw new Error(errorMessage(err, "Failed to load items"));
      }),
  });
}
