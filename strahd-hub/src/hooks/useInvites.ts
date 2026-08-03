import { useCallback, useEffect, useState } from "react";
import {
  Invite,
  claimDmInvite,
  createDmInvite,
  createInvite,
  getDmInvites,
  getInvites,
} from "../services/invites";
import { useAuth } from "../services/AuthContext";

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

  useEffect(() => {
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
          setError(err instanceof Error ? err.message : "Failed to load invites");
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
      // Prepended, not sorted in: the list is newest-first by created_at and
      // this row is by definition the newest. Nothing can backfill an invite the
      // way a DM can backfill an older recap.
      setInvites((cur) => [created, ...cur]);
      // Returned as well as stored, because the code is the entire point of the
      // call — the caller has to show it to the DM to copy.
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
          setError(
            err instanceof Error ? err.message : "Failed to load DM invites",
          );
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
 */
export function useClaimDmInvite() {
  const { refetchProfile } = useAuth();

  // A plain function rather than a useCallback: AuthProvider builds its context
  // value fresh on every render, so refetchProfile has a new identity each time
  // and memoising on it would return a new callback anyway. This is only ever
  // called from an event handler, where identity does not matter.
  return async function claim(code: string) {
    await claimDmInvite(code);
    await refetchProfile();
  };
}
