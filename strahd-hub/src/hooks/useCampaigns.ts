import {
  createCampaign,
  deleteCampaign,
  getCampaigns,
  updateCampaignName,
} from "../services/campaigns";
import { errorMessage } from "../lib/errors";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Two very different callers share this: the picker, which lists what you can
// open, and CampaignLayout, which checks a URL param against the same list.
// That's on purpose — "campaigns you can see" is one answer, so a campaign that
// isn't pickable can't be reachable by typing its id either. They also share
// the ["campaigns"] cache entry, so the answer really is one list, not two
// fetches that usually agree.
export function useCampaigns() {
  const queryClient = useQueryClient();
  // Destructured, not spread: a spread reads every getter on the result and
  // subscribes the component to all of them — see useLocations.
  const { data, isLoading, error } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () =>
      getCampaigns().catch((err) => {
        throw new Error(errorMessage(err, "Failed to load campaigns"));
      }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });

  // All three REJECT on failure rather than surfacing through the query's
  // `error` — same split as useRecaps: `error` means "there is no list to show
  // at all"; a create/rename/delete that fails still has a page full of good
  // campaigns behind it, and the form or row that called it is what should say
  // what went wrong. Hence mutateAsync, not mutate: every caller awaits and
  // catches.

  // Resolves to the new id, and the await matters twice: the caller navigates
  // into /campaign/:id with it, and mutateAsync doesn't settle until the
  // invalidation refetch has landed — so by the time the navigate runs,
  // CampaignLayout's copy of this list already contains the campaign it's
  // about to look up.
  const addCampaignMutation = useMutation({
    mutationFn: (name: string) => createCampaign(name),
    onSuccess: invalidate,
  });

  const renameCampaignMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateCampaignName(id, name),
    onSuccess: invalidate,
  });

  const removeCampaignMutation = useMutation({
    mutationFn: (id: string) => deleteCampaign(id),
    onSuccess: invalidate,
  });

  return {
    data,
    isLoading,
    error,
    addCampaign: addCampaignMutation.mutateAsync,
    // Wrapped to keep the two-argument shape the picker calls with; the
    // mutation itself takes one variables object.
    renameCampaign: (id: string, name: string) =>
      renameCampaignMutation.mutateAsync({ id, name }),
    removeCampaign: removeCampaignMutation.mutateAsync,
  };
}
