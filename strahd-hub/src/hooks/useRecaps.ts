import {
  createRecap,
  deleteRecap,
  getRecaps,
  updateRecap,
} from "../services/recaps";
import { errorMessage } from "../lib/errors";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useRecaps(campaignId: string) {
  const queryClient = useQueryClient();
  // Keyed by campaign, which is what keeps a DM switching campaigns honest:
  // each campaign's log is its own cache entry, so the previous one's recaps
  // can never linger on screen or land from a stale in-flight fetch — the two
  // races the old manual version needed a reset and an `ignore` flag for.
  const query = useQuery({
    queryKey: ["recaps", campaignId],
    queryFn: () =>
      getRecaps(campaignId).catch((err) => {
        throw new Error(errorMessage(err, "Failed to load recaps"));
      }),
  });

  // Invalidate rather than patch: getRecaps orders by session number
  // descending, so the refetch also handles the one ordering subtlety the old
  // local patching did by hand — a backfilled Session 2 written after Session 5
  // sorts in between 3 and 1, not at the top — and a save comes back with the
  // fresh "last edited by" byline the trigger wrote.
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["recaps", campaignId] });

  // All three REJECT on failure rather than surfacing through the query's
  // `error` — that state means "the page has no data to show at all". A save
  // that fails still has a page full of good recaps behind it, and the form
  // that called it is the thing that should say what went wrong. Hence
  // mutateAsync (wrapped back to the positional signatures the forms take).

  // campaignId is closed over from the hook argument rather than passed per
  // call: this hook has a "current campaign" and a new recap files against the
  // same one the list is showing.
  const addRecapMutation = useMutation({
    mutationFn: ({
      sessionNumber,
      title,
      body,
    }: {
      sessionNumber: number;
      title: string;
      body: string;
    }) => createRecap(campaignId, sessionNumber, title, body),
    onSuccess: invalidate,
  });

  const saveRecapMutation = useMutation({
    mutationFn: ({
      id,
      title,
      body,
    }: {
      id: string;
      title: string;
      body: string;
    }) => updateRecap(id, title, body),
    onSuccess: invalidate,
  });

  const removeRecapMutation = useMutation({
    mutationFn: (id: string) => deleteRecap(id),
    onSuccess: invalidate,
  });

  return {
    ...query,
    addRecap: async (sessionNumber: number, title: string, body: string) => {
      await addRecapMutation.mutateAsync({ sessionNumber, title, body });
    },
    saveRecap: async (id: string, title: string, body: string) => {
      await saveRecapMutation.mutateAsync({ id, title, body });
    },
    removeRecap: removeRecapMutation.mutateAsync,
  };
}
