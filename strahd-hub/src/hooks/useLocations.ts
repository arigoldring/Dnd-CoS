import {
  getLocations,
  updateLocationDescription,
  updateLocationVisibility,
} from "../services/locations";
import { errorMessage } from "../lib/errors";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

export function useLocations(campaignId: string) {
  const queryClient = useQueryClient();
  // Destructured, not spread: v5 only subscribes the component to the fields
  // actually read, and a spread reads every one of them — including
  // isFetching, which flips on every background refetch.
  const { data, isLoading, error } = useQuery({
    queryKey: ["locations", campaignId],
    queryFn: () =>
      getLocations(campaignId).catch((err) => {
        throw new Error(errorMessage(err, "Failed to load locations"));
      }),
  });
  const saveDescriptionMutation = useMutation({
    mutationFn: ({ id, description }: { id: string; description: string }) =>
      updateLocationDescription(id, description),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["locations", campaignId] }),
  });
  const toggleVisibilityMutation = useMutation({
    mutationFn: ({ id, isRevealed }: { id: string; isRevealed: boolean }) =>
      updateLocationVisibility(id, isRevealed),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["locations", campaignId] }),
  });
  return {
    data,
    isLoading,
    error,
    // mutateAsync, not mutate: the description editor awaits the save and
    // relies on rejection to stay open with the draft when the write fails.
    saveDescription: saveDescriptionMutation.mutateAsync,
    toggleVisibility: toggleVisibilityMutation.mutate,
  };
}
