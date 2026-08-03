/**
 * The invite link a DM hands over, and the query it turns back into at /claim.
 *
 * Both halves live here because they are one agreement about two query
 * parameters, and splitting them across the page that writes the link and the
 * page that reads it is how you end up with a link that opens the wrong form.
 * That failure is worth picturing: the claim page would call the wrong RPC, get
 * "invite not found or already used" back, and blame a code that was fine.
 *
 * The kind has to travel beside the code because a code does not say which it
 * is. player_invites and dm_invites both store `gen_random_uuid()::text`, so the
 * two are indistinguishable as strings, and claim_player_invite raises on a
 * perfectly valid DM code exactly the way it raises on a made-up one. There is
 * no way to sniff it and no way to try one then the other — the first attempt
 * would have to be against a live claim function, and those burn what they
 * accept. Hence a parameter, and hence /claim asking outright when a code
 * arrives without one.
 */
export type InviteKind = "player" | "dm";

// A type guard rather than a cast at the call site: `?kind=` is user input like
// any other query parameter — editable in the address bar, truncatable by a chat
// client — so "player" | "dm" has to be proven rather than asserted.
export function isInviteKind(value: string | null): value is InviteKind {
  return value === "player" || value === "dm";
}

/**
 * An absolute URL, because the whole point is to paste it somewhere outside the
 * app, where a relative path means nothing.
 *
 * pathname is read rather than assumed to be "/": the router is a HashRouter, so
 * everything before the # is wherever the app is served from, and hard-coding
 * the root would quietly break every link the day this moves under a subpath.
 * location.search is dropped on purpose — the app keeps no state above the hash,
 * so anything there is somebody else's parameter and copying it forward would
 * only follow the invitee around.
 */
export function claimUrl(code: string, kind: InviteKind): string {
  const { origin, pathname } = window.location;
  // Encoded even though today's codes are uuids and have nothing to encode: the
  // codes are the database's to choose, and this is the one line that would have
  // to change if gen_random_uuid ever became something friendlier to read out.
  return `${origin}${pathname}#/claim?code=${encodeURIComponent(code)}&kind=${kind}`;
}

// ---------------------------------------------------------------------------
// surviving the sign-in round trip
// ---------------------------------------------------------------------------

/**
 * The problem this half solves, because it is not obvious from the code that
 * needs it:
 *
 * The main audience for a player link is somebody who has never opened the app.
 * They follow it signed out, AuthGate replaces the routes with a sign-in button
 * — the URL still says /claim, but nothing under it is rendering — and they sign
 * in with Google. signInWithGoogle sends `redirectTo: window.location.origin`,
 * so the browser comes back to the bare origin and the fragment carrying their
 * code is gone. They land on the campaign picker with nothing, and the link they
 * were sent looks broken.
 *
 * The tempting one-line fix is `redirectTo: window.location.href`, and it is a
 * trap: Supabase matches redirect targets against an allow-list of *exact* URLs
 * (see additional_redirect_urls in supabase/config.toml), so a URL carrying a
 * per-invite fragment would have to be wildcarded in the hosted project's
 * dashboard first. Changing the client without that lands as a refused sign-in
 * for everybody, not a degraded one for invitees.
 *
 * So the code is put somewhere the round trip cannot reach instead. Same tab,
 * same origin, survives a cross-origin navigation and back — sessionStorage is
 * exactly sized for this, and being per-tab means a stashed code cannot outlive
 * the visit that stashed it.
 */

const STASH_KEY = "pendingClaim";

export interface PendingClaim {
  code: string;
  kind: InviteKind;
}

/**
 * Snapshot a claim link's parameters at startup. Called from main.tsx before
 * render, because it has to run on the load that HAS the fragment — by the time
 * any component could ask, the sign-in redirect has already thrown it away.
 *
 * Parses the hash by hand rather than through the router: this runs outside it,
 * and one indexOf is cheaper than mounting something to read a query string.
 */
export function stashPendingClaim(): void {
  const hash = window.location.hash;
  const queryStart = hash.indexOf("?");
  if (queryStart === -1) return;
  // Only /claim, so an unrelated page's query string can never seed a claim.
  if (!hash.slice(0, queryStart).startsWith("#/claim")) return;

  const params = new URLSearchParams(hash.slice(queryStart + 1));
  const code = params.get("code");
  const kind = params.get("kind");
  // Both or neither. A code without a valid kind is not a link this file wrote,
  // and guessing the kind is the one thing claimLink exists to avoid.
  if (!code || !isInviteKind(kind)) return;

  try {
    sessionStorage.setItem(STASH_KEY, JSON.stringify({ code, kind }));
  } catch (err) {
    // Storage can be unavailable or full — Safari's private mode is the usual
    // one. Swallowed rather than thrown because this runs before render: the
    // cost of failing is that a signed-out invitee has to paste their code by
    // hand, and the cost of throwing would be a blank app for everyone.
    console.error("Problem saving the invite code for after sign-in:", err);
  }
}

// Shared by peek and take, and validating rather than trusting: sessionStorage
// is writable by anything running on this origin, so what comes back is input.
function readPendingClaim(): PendingClaim | null {
  try {
    const raw = sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { code, kind } = parsed as { code?: unknown; kind?: unknown };
    if (typeof code !== "string" || typeof kind !== "string") return null;
    if (!isInviteKind(kind)) return null;
    return { code, kind };
  } catch (err) {
    console.error("Problem reading the saved invite code:", err);
    return null;
  }
}

// Non-destructive, for the picker: it only needs to know whether to send the
// user to /claim, and consuming the stash on the way past would leave the claim
// page with nothing to show when they arrived.
export function peekPendingClaim(): PendingClaim | null {
  return readPendingClaim();
}

/**
 * Read and clear. Called once by /claim on mount — reaching that page is what
 * consumes a pending claim, whether or not the code came from the stash.
 *
 * Clearing unconditionally is what stops the redirect becoming a trap: a
 * signed-in DM who opens their own link to check it stashes a code they never
 * needed, and if it survived, every later visit to the picker would bounce them
 * back to /claim.
 */
export function takePendingClaim(): PendingClaim | null {
  const pending = readPendingClaim();
  try {
    sessionStorage.removeItem(STASH_KEY);
  } catch (err) {
    console.error("Problem clearing the saved invite code:", err);
  }
  return pending;
}
