import { supabase } from "../lib/supabase";
import type { Tables } from "../types/database.types";

/**
 * Both invite lifecycles: mint a one-shot code, hand it over, burn it. App.tsx
 * has had a note about this since the routes were laid out — the RPCs landed in
 * 000 and 010 and nothing has ever called them.
 *
 * Two kinds, and what they grant is the whole difference:
 *
 *   player_invites  membership in one named campaign. Campaign-scoped in every
 *                   sense — the code carries a campaign_id, and after 019 only
 *                   that campaign's DM can mint or read it.
 *
 *   dm_invites      the global profiles.role = 'dm' flag, which since 018 means
 *                   one thing: may create campaigns. No campaign_id, because
 *                   there is no campaign yet — this is the code that lets
 *                   someone start one.
 *
 * They are kept in one file because they are the same mechanism twice, and the
 * shapes below are literally shared. What is NOT shared is who may mint: a
 * player invite asks is_campaign_dm, a DM invite asks the global flag, and that
 * asymmetry is deliberate — see 019's closing note for why dm_invites is the one
 * place is_dm() still guards is_dm().
 *
 * Every write here is an RPC rather than a table write, and that is not a style
 * choice: both tables have a SELECT policy and nothing else. No INSERT, no
 * UPDATE, no DELETE — from the client they are readable and otherwise inert. The
 * four functions are security definer and write past RLS, which is what makes
 * minting and burning possible at all, and why each carries its own gate in
 * code.
 *
 * Same *Row / domain-type split as recaps.ts, and for the same reason: the
 * tables store used_by as a uuid, which is useless to a component, so the
 * queries embed the claimant's profile and the mapper flattens it to a name.
 */

// One shape for every read, so an invite is the same object wherever it came
// from. The embed works for the reason 007 made it work for recap bylines: RLS
// applies to embedded joins too, and the widened profiles SELECT policy is what
// keeps display_name from coming back null for everyone but yourself.
const INVITE_SELECT = "*, claimant:used_by(display_name)";

// A union, and that is the point rather than a shortcut: the two tables are
// column-identical apart from player_invites.campaign_id, which Invite does not
// expose, so one row type and one mapper serve both. TypeScript allows the
// property reads below because every one of them exists on both arms — add a
// field that doesn't and this stops compiling, which is the behaviour wanted.
//
// `claimant` rather than `profiles` because the select aliases it, and aliased
// through the FK column so a second FK to profiles later wouldn't be ambiguous.
// A single object or null, not an array — the invite tables hold the FK, so a
// code has at most one claimant.
type InviteRow = (Tables<"player_invites"> | Tables<"dm_invites">) & {
  claimant: Pick<Tables<"profiles">, "display_name"> | null;
};

export interface Invite {
  id: string;
  // The thing the DM actually hands over. Unique in the schema, which is why the
  // mint below can find its own row by it.
  code: string;
  // The DM's note to themselves about who this one is for, or null for none.
  label: string | null;
  used: boolean;
  usedAt: string | null;
  // null while unused, and also null if the claimant's profile was deleted —
  // `used` is the authoritative "has this been burned" signal, not this name.
  // Same trap 007 documents for recap bylines.
  claimedByName: string | null;
  createdAt: string;
}

function toInvite(row: InviteRow): Invite {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    used: row.used,
    usedAt: row.used_at,
    claimedByName: row.claimant?.display_name ?? null,
    createdAt: row.created_at,
  };
}

// An empty label is the DM declining to name the invite, which the schema spells
// null. Sending "" would store a real label that renders as nothing.
//
// undefined rather than null, unlike the blankToNull in recaps.ts, because this
// one feeds an RPC argument instead of a column. `invite_label text default
// null` is optional in SQL and generated as optional in TypeScript, so the way
// to ask for the default is to leave the key out — and an undefined value drops
// out of the JSON body on its own. The column still ends up null either way.
function blankToOmitted(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

// ---------------------------------------------------------------------------
// player invites — membership in one campaign
// ---------------------------------------------------------------------------

/**
 * One campaign's invites, newest first.
 *
 * The .eq() is deliberate here, and is the opposite call from getCampaigns —
 * worth being clear about, because the two look contradictory. There, the policy
 * *is* the list: "campaigns you can see" answers exactly the question the picker
 * asks, so restating it in the client would only add a second place to get it
 * wrong. Here the policy answers a wider question than the page does. After 019
 * it returns every invite for every campaign the caller runs, and this screen is
 * about one of them. The filter is a scope, not a duplicated permission check.
 *
 * DM only in practice — "dms can view invites" (019) means a player calling this
 * gets an empty list rather than an error.
 */
export async function getInvites(campaignId: string): Promise<Invite[]> {
  const { data, error } = await supabase
    .from("player_invites")
    .select(INVITE_SELECT)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    throw error;
  }

  return data.map(toInvite);
}

/**
 * Mint a code for one campaign. DM of *that* campaign only, enforced by 019's
 * `if not is_campaign_dm(target_campaign)` — the function is security definer,
 * so that check is the whole gate and there is no policy behind it.
 *
 * The argument keys are spelled the way 019 spells its parameters, and have to
 * be: these become named SQL arguments, so a mismatch is not a type error but
 * "function does not exist" at runtime.
 */
export async function createInvite(
  campaignId: string,
  label: string,
): Promise<Invite> {
  const { data: code, error } = await supabase.rpc("generate_player_invite", {
    target_campaign: campaignId,
    invite_label: blankToOmitted(label),
  });

  // Where 019's gate arrives: a raise exception comes back as an ordinary
  // Postgres error carrying that message, not as a separate refused branch.
  if (error) {
    console.error(error);
    throw error;
  }

  // The RPC returns the code and nothing else, so the row is read back rather
  // than assembled locally — id and created_at are the database's to say, and a
  // list keyed on a guessed id is a bug waiting for its first duplicate. Safe to
  // look up by code because the column is unique.
  const { data, error: readError } = await supabase
    .from("player_invites")
    .select(INVITE_SELECT)
    .eq("code", code)
    .single();

  // If this half fails the code still exists and still works — the mint already
  // committed. Nothing is lost that a reload doesn't recover, which is why this
  // throws plainly rather than trying to undo anything.
  if (readError) {
    console.error(readError);
    throw new Error(
      "The invite was created, but could not be loaded — reload to see it",
    );
  }

  return toInvite(data);
}

/**
 * Burn a code and join the campaign it names. Not DM-gated and not
 * campaign-scoped: the caller doesn't know which campaign they're joining until
 * the code resolves, which is the whole point of a code.
 *
 * Returns true if this call added the membership, false if the caller was
 * already a member — 013 changed the function to report that distinction, since
 * both outcomes burn the code and both end with the user in the campaign. A bad
 * or spent code raises instead, and arrives here as a thrown Postgres error.
 *
 * Works even though the caller cannot read the invite row they are burning:
 * claim_player_invite is security definer, and an invitee is by definition not
 * yet a member of anything.
 */
export async function claimInvite(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_player_invite", {
    invite_code: code.trim(),
  });

  if (error) {
    console.error(error);
    throw error;
  }

  return data;
}

// ---------------------------------------------------------------------------
// DM invites — the global flag, which is to say permission to create campaigns
// ---------------------------------------------------------------------------

/**
 * Every DM invite ever minted, newest first. No argument, because there is no
 * campaign to scope to — a DM invite belongs to the app, not to a campaign.
 *
 * Readable by any DM, via "dms can view invites" on dm_invites (000). That
 * policy is still the global check and stays that way permanently: this table
 * has no campaign_id to ask about, and the thing being handed out is the flag
 * itself. It is the one place is_dm() guards is_dm().
 */
export async function getDmInvites(): Promise<Invite[]> {
  const { data, error } = await supabase
    .from("dm_invites")
    .select(INVITE_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    throw error;
  }

  return data.map(toInvite);
}

/**
 * Mint a code that makes its claimer a DM. Existing DMs only, enforced inside
 * generate_dm_invite (000) by an inline `role = 'dm'` check rather than by
 * is_dm() — the function predates that helper and is otherwise identical to it.
 *
 * Deliberately not narrowed by 018 or 019: there is no campaign to be the DM of
 * at this point, so is_campaign_dm has nothing to be asked about. This is the
 * question the global flag is still the right answer to.
 */
export async function createDmInvite(label: string): Promise<Invite> {
  const { data: code, error } = await supabase.rpc("generate_dm_invite", {
    invite_label: blankToOmitted(label),
  });

  if (error) {
    console.error(error);
    throw error;
  }

  // Read back rather than assembled locally, for the same reason createInvite
  // does it: the RPC returns a code, and id and created_at are the database's to
  // say. Unique column, so the lookup is deterministic.
  const { data, error: readError } = await supabase
    .from("dm_invites")
    .select(INVITE_SELECT)
    .eq("code", code)
    .single();

  if (readError) {
    console.error(readError);
    throw new Error(
      "The invite was created, but could not be loaded — reload to see it",
    );
  }

  return toInvite(data);
}

/**
 * Burn a code and become a DM. Ungated by design — this is the one call in the
 * app a non-DM is supposed to make, and holding a valid code is the whole
 * authorisation.
 *
 * IMPORTANT: this changes profiles.role, which AuthContext holds in state and
 * every isDm check in the app reads from. Nothing invalidates that cache on its
 * own, so a caller must follow this with refetchProfile() or the user stays a
 * player on screen until a reload. useClaimDmInvite pairs the two so a caller
 * cannot forget; prefer it over calling this directly.
 *
 * Returns void, unlike claimInvite. claim_player_invite was changed in 013 to
 * report whether the join was new, because "already a member" and "just joined"
 * are different things worth telling a player apart. There is no equivalent here
 * — claiming as an existing DM re-sets a role that is already 'dm' and burns the
 * code, which is a no-op nobody needs narrated.
 *
 * A bad or spent code raises, and arrives here as a thrown Postgres error. 008
 * is worth knowing about if the messages ever look odd: this function raises a
 * different error for a valid-but-profileless claim than for a bad code, which
 * made it an oracle for sifting valid codes until anon's EXECUTE grant was
 * revoked. Authenticated callers see both as ordinary failures.
 */
export async function claimDmInvite(code: string): Promise<void> {
  const { error } = await supabase.rpc("claim_dm_invite", {
    invite_code: code.trim(),
  });

  if (error) {
    console.error(error);
    throw error;
  }
}
