import { useCallback, useEffect, useRef, useState } from "react";
import {
  Invite,
  claimDmInvite,
  createDmInvite,
  createInvite,
  getDmInvites,
  getInvites,
} from "../services/invites";
import { useAuth } from "../services/AuthContext";
import { errorMessage } from "../lib/errors";

/**
 * One campaign's invite list plus the mint, in the same shape as useRecaps: this
 * hook is the single owner of the list, and a create patches local state from
 * the row the server sent back rather than refetching everything.
 *
 * Scoped by argument rather than by policy. A DM who runs two campaigns passes
 * this the one they are looking at — see getInvites for why the filter belongs
 * in the client here and not in getCampaigns.
 *
 * Nothing about claiming lives here. That flow starts from a code and has no
 * campaign to be scoped to until the server resolves one, so it has no list to
 * own — a /claim form calls claimInvite directly and holds its own submitting
 * and error state, the way CampaignNameForm already does.
 */
export function useInvites(campaignId: string) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Which campaign the list in state currently belongs to. The load below has
  // `ignore` for this job, but a closure flag only covers the call that created
  // it — addInvite is created once per campaignId and awaits two round trips, so
  // it needs to ask what is true *now* rather than what was true when it was
  // built. A ref is the only thing that reads forward like that.
  const shownCampaignId = useRef(campaignId);

  useEffect(() => {
    // Updated here rather than in its own effect so it moves in lockstep with
    // the fetch that repopulates the list — the ref and the state it describes
    // change for the same reason at the same moment.
    shownCampaignId.current = campaignId;
    let ignore = false;
    async function load() {
      // Reset on every campaign change, not just on mount: without this a DM
      // switching campaigns shows the previous one's codes until the new fetch
      // lands, which is the one wrong thing this screen could display.
      setLoading(true);
      setError(null);
      try {
        const data = await getInvites(campaignId);
        if (!ignore) setInvites(data);
      } catch (err) {
        if (!ignore) {
          console.error(err);
          setError(errorMessage(err, "Failed to load invites"));
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    // `ignore` is what makes switching campaigns safe rather than racy: an
    // in-flight fetch for the old campaign can still resolve after the new one
    // has been requested, and this drops it instead of letting it win.
    return () => {
      ignore = true;
    };
  }, [campaignId]);

  // Rejects on failure instead of setting `error` above — same split as
  // useRecaps and useCampaigns. `error` means "there is no list to show at all";
  // a mint that fails still has a page full of good invites behind it, and the
  // form that called it is what should say what went wrong.
  const addInvite = useCallback(
    async (label: string) => {
      const created = await createInvite(campaignId, label);
      // The same guard the load has, and needed for the same reason: a DM can
      // switch campaigns while the mint is in flight, and by the time it lands
      // `cur` is the other campaign's list. Without this check the updater
      // prepends campaign A's code onto campaign B's screen — display-only and
      // gone on the next load, but wrong in the one way this table must not be.
      //
      // What it deliberately does NOT cover is a same-campaign reload landing
      // between the mint's two round trips, which can duplicate the row. That is
      // accepted debt, not an oversight: see KNOWN_ISSUES.md.
      if (shownCampaignId.current === campaignId) {
        // Prepended, not sorted in: the list is newest-first by created_at and
        // this row is by definition the newest. Nothing can backfill an invite
        // the way a DM can backfill an older recap.
        setInvites((cur) => [created, ...cur]);
      }
      // Returned either way, and outside the guard on purpose: the code was
      // minted and is real whether or not its campaign is still on screen.
      // Swallowing it here would lose the one thing the caller needs to show.
      return created;
    },
    [campaignId],
  );

  return { invites, loading, error, addInvite };
}

/**
 * The same list and mint for DM invites, minus the campaign. Deliberately a
 * second hook rather than an optional argument on the first: the two answer
 * different questions — "who may join this campaign" and "who may create
 * campaigns at all" — and a hook that took `campaignId | undefined` and switched
 * tables on it would make that difference look like a parameter.
 *
 * No campaign means no re-scoping, so unlike useInvites this loads once on
 * mount, the way useCampaigns and useRecaps do.
 */
export function useDmInvites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const data = await getDmInvites();
        if (!ignore) setInvites(data);
      } catch (err) {
        if (!ignore) {
          console.error(err);
          setError(errorMessage(err, "Failed to load DM invites"));
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  // Rejects on failure rather than setting `error`, same split as everywhere
  // else here: `error` means the list itself is missing.
  const addInvite = useCallback(async (label: string) => {
    const created = await createDmInvite(label);
    setInvites((cur) => [created, ...cur]);
    return created;
  }, []);

  return { invites, loading, error, addInvite };
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
