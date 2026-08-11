import { errorMessage } from "../lib/errors";
import { getSpells } from "../services/spells";
import { useQuery } from "@tanstack/react-query";

export function useSpells() {
  return useQuery({
    queryKey: ["spells"],
    queryFn: () =>
      getSpells().catch((err) => {
        throw new Error(errorMessage(err, "Failed to load spells"));
      }),
  });
}
