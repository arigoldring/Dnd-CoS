import {
  claimDmInvite,
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
 * Nothing about claiming lives here. That flow starts from a code and has no
 * campaign to be scoped to until the server resolves one, so it has no list to
 * own — a /claim form calls claimInvite directly and holds its own submitting
 * and error state, the way CampaignNameForm already does.
 */
export function useInvites(campaignId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
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
    ...query,
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
  const query = useQuery({
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
    ...query,
    // mutateAsync, not mutate: InvitePanel's mint form awaits this, shows its
    // rejection as the form error, and needs the created Invite back. The
    // query's own `error` still means only "the list itself is missing".
    addInvite: addInviteMutation.mutateAsync,
  };
}

/**
 * Claiming a DM invite, with the profile refresh attached.
 *
 * The other claim — claimInvite for a player code — has no hook on purpose: it
 * is a form action, and a form holds its own submitting and error state the way
 * CampaignNameForm does. This one gets a hook anyway, for a reason that is not
 * about state at all.
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
