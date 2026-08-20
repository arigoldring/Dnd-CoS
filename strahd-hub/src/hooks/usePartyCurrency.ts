import { adjustPartyCurrency, getPartyCurrency } from "../services/currency";
import type { Denomination } from "../services/characters";
import { errorMessage } from "../lib/errors";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// usePartyInventory's shape exactly, for the same pool at a different table:
// campaignId is a parameter rather than read from a global because the queryFn
// closes over it, and it belongs in the key for the same reason.
export function usePartyCurrency(campaignId: string) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["partyCurrency", campaignId],
    queryFn: () =>
      getPartyCurrency(campaignId).catch((err) => {
        throw new Error(errorMessage(err, "Failed to load the party's purse"));
      }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["partyCurrency", campaignId] });

  // Rejects rather than surfacing through `error`, the split every mutation in
  // this app makes: `error` means the page has nothing to show, but a failed
  // add or spend happens with the pool's current total still on screen.
  const adjustCurrencyMutation = useMutation({
    mutationFn: ({ denomination, delta }: { denomination: Denomination; delta: number }) =>
      adjustPartyCurrency(campaignId, denomination, delta),
    onSuccess: invalidate,
  });

  return {
    data,
    isLoading,
    error,
    adjustCurrency: (denomination: Denomination, delta: number) =>
      adjustCurrencyMutation.mutateAsync({ denomination, delta }),
  };
}
