import {
  claimDmInvite,
  claimInvite,
  createDmInvite,
  createInvite,
  getDmInvites,
  getInvites,
} from "../services/invites";
import { useAuth } from "../services/AuthContext";
import { errorMessage } from "../lib/errors";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * One campaign's invite list plus the mint.
 *
 * Scoped by argument rather than by policy. A DM who runs two campaigns passes
 * this the one they are looking at — see getInvites for why the filter belongs
 * in the client here and not in getCampaigns. Each campaign is its own
 * ["invites", campaignId] cache entry, which is what retires the two races the
 * manual version guarded by hand: a stale fetch can't paint another campaign's
 * codes over this one's, and a mint that lands after a navigation invalidates
 * the entry it was minted against, not whatever is on screen. The
 * same-campaign duplicate row this hook used to accept as debt (previously in
 * KNOWN_ISSUES.md) is gone with the local prepend that caused it.
 *
 * Nothing about claiming lives in this hook. That flow starts from a code and
 * has no campaign to be scoped to until the server resolves one, so it has no
 * list to own. It gets the two hooks at the bottom of this file anyway, for a
 * reason that is not about lists at all — see useClaimDmInvite.
 */
export function useInvites(campaignId: string) {
  const queryClient = useQueryClient();
  // Destructured, not spread: a spread reads every getter on the result and
  // subscribes the component to all of them — see useLocations.
  const { data, isLoading, error } = useQuery({
    queryKey: ["invites", campaignId],
    queryFn: () =>
      getInvites(campaignId).catch((err) => {
        throw new Error(errorMessage(err, "Failed to load invites"));
      }),
  });
  const addInviteMutation = useMutation({
    mutationFn: (label: string) => createInvite(campaignId, label),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["invites", campaignId] }),
  });
  return {
    data,
    isLoading,
    error,
    // mutateAsync, not mutate: InvitePanel's mint form awaits this, shows its
    // rejection as the form error, and needs the created Invite back. The
    // query's own `error` still means only "the list itself is missing".
    addInvite: addInviteMutation.mutateAsync,
  };
}

/**
 * The same list and mint for DM invites, minus the campaign. Deliberately a
 * second hook rather than an optional argument on the first: the two answer
 * different questions — "who may join this campaign" and "who may create
 * campaigns at all" — and a hook that took `campaignId | undefined` and switched
 * tables on it would make that difference look like a parameter.
 *
 * No campaign means nothing in the query key to scope by: one cache entry,
 * where useInvites keeps one per campaign.
 */
export function useDmInvites() {
  const queryClient = useQueryClient();
  // Destructured, not spread: a spread reads every getter on the result and
  // subscribes the component to all of them — see useLocations.
  const { data, isLoading, error } = useQuery({
    queryKey: ["dmInvites"],
    queryFn: () =>
      getDmInvites().catch((err) => {
        throw new Error(errorMessage(err, "Failed to load DM invites"));
      }),
  });
  const addInviteMutation = useMutation({
    mutationFn: (label: string) => createDmInvite(label),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dmInvites"] }),
  });
  return {
    data,
    isLoading,
    error,
    // mutateAsync, not mutate: InvitePanel's mint form awaits this, shows its
    // rejection as the form error, and needs the created Invite back. The
    // query's own `error` still means only "the list itself is missing".
    addInvite: addInviteMutation.mutateAsync,
  };
}

/**
 * Claiming a DM invite, with the profile refresh attached.
 *
 * Neither claim hook owns a list, and neither owns any form state — /claim is a
 * form action and holds its own submitting and error the way CampaignNameForm
 * does. They exist for a reason that is not about state at all: each claim
 * writes something cached that nothing else invalidates. This one's cache is
 * AuthContext; useClaimInvite below has the ["campaigns"] half.
 *
 * claim_dm_invite writes profiles.role, and that row is cached in AuthContext
 * for the life of the session. Every isDm check in the app reads the cache, and
 * nothing invalidates it — so a claim that succeeds leaves the user a player on
 * screen, with the New campaign button still hidden, until they happen to
 * reload. Pairing the two calls here is what makes that impossible to forget;
 * refetchProfile exists for exactly this and has said so since it was written.
 *
 * Awaited, not fired and forgotten: the caller's next line is usually a navigate
 * or a success message, and both want to run against a profile that already
 * says 'dm'.
 *
 * The obvious hazard in this pairing is that a claim which commits and then
 * fails to refresh would report itself as a failed claim — telling a new DM they
 * are not one. That cannot happen, and it is worth writing down why rather than
 * guarding against it: refetchProfile does not reject. It catches its own
 * failure and reports it through AuthContext's own error state, so nothing from
 * the second await can reach the form that called this. A try/catch around it
 * here would be a branch that can never run.
 *
 * What DOES happen, and what a claim form has to be built for: refetchProfile
 * sets AuthContext loading, and AuthGate renders "Loading..." instead of its
 * children while that is true. The form calling this is one of those children,
 * so it unmounts and remounts around the refresh, losing whatever local state it
 * was holding. A success message set after this resolves will not survive.
 * Navigate on success instead — the redirect is the confirmation, and it is the
 * one outcome the remount cannot swallow.
 */
export function useClaimDmInvite() {
  const { refetchProfile } = useAuth();

  // A plain function rather than a useCallback: AuthProvider builds its context
  // value fresh on every render, so refetchProfile has a new identity each time
  // and memoising on it would return a new callback anyway. This is only ever
  // called from an event handler, where identity does not matter.
  return async function claim(code: string) {
    // Order matters and is the whole point of the hook: the claim is the thing
    // that can fail, and it fails before anything has been written. Only once it
    // has committed is there a new role to go and read.
    await claimDmInvite(code);
    await refetchProfile();
  };
}

/**
 * Claiming a player invite, with the campaigns list refreshed.
 *
 * The same shape as useClaimDmInvite above and for the same reason, one cache
 * down. claim_player_invite inserts a campaign_members row, and ["campaigns"]
 * reads that table twice over — through the membership embed in getCampaigns
 * and through the subquery in "read campaigns you can see". Nothing else in the
 * app writes that table, so nothing else has cause to invalidate the entry, and
 * without this pairing a claim that succeeds leaves the claimer looking at their
 * pre-claim list. For a first-time invitee that is the empty one, immediately
 * under a page that has just told them they joined.
 *
 * Worth naming the worst version, because it is not the obvious one: a non-DM
 * whose list held exactly one campaign is redirected straight into it by
 * CampaignPicker, so the campaign they just joined is not merely missing from
 * the list — it is unreachable until the entry goes stale. staleTime is 60s and
 * a window blur refetches too, so all of it repairs itself within about a
 * minute, which is what makes it a bug that is already gone by the time anyone
 * is asked to look at it.
 *
 * Returns what claimInvite returns — true if this call added the membership,
 * false if the caller was already in that campaign. Both burn the code, and
 * /claim says something different for each.
 */
export function useClaimInvite() {
  const queryClient = useQueryClient();

  // A plain function rather than a useMutation, matching useClaimDmInvite: no
  // list to own, and no isPending anyone reads — the form tracks its own
  // submitting. All this has to be is the two calls, kept together.
  return async function claim(code: string): Promise<boolean> {
    // Order matters and is the whole point of the hook: the claim is the thing
    // that can fail, and it fails before anything has been written. Only once
    // the membership row exists is there a new list to go and read.
    const isNew = await claimInvite(code);
    // Awaited, because what follows a claim is a navigation or a message about
    // a campaign the user now has. In practice this resolves without a fetch:
    // the picker unmounted to get to /claim, so ["campaigns"] is inactive and
    // invalidate only marks it stale — refetchOnMount does the work when the
    // picker comes back. The await is what keeps the ordering honest for a
    // caller that does still have the list on screen.
    await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    return isNew;
  };
}
