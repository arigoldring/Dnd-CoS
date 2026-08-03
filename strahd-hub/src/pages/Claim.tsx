import { SubmitEvent, useEffect, useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { claimInvite } from "../services/invites";
import { useClaimDmInvite } from "../hooks/useInvites";
import {
  InviteKind,
  isInviteKind,
  peekPendingClaim,
  takePendingClaim,
} from "../lib/claimLink";
import { errorMessage } from "../lib/errors";

/**
 * The other end of every invite link: paste a code, burn it, get what it grants.
 *
 * Top-level, beside the picker, because claiming is the thing you do before you
 * have a campaign — the code is what decides which campaign you end up in, and
 * until the server resolves it there is nothing to scope this page to. That is
 * also why nothing here uses a list hook: there is no list. The two claim calls
 * are one-shot form submissions, and this form holds its own state the way
 * CampaignNameForm does.
 *
 * It still sits inside AuthGate, which is required rather than incidental: both
 * claim functions write a row keyed on auth.uid(), so there has to be a signed-in
 * user before either can be called. An invitee following a link cold gets the
 * sign-in button first — see claimLink.ts for how their code survives that.
 */
export function Claim() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const claimDm = useClaimDmInvite();
  const codeId = useId();

  // Lazy initialisers, and pure: peekPendingClaim only reads. The take() that
  // clears it is in the effect below, because an initialiser runs twice under
  // StrictMode and a destructive one would come back empty the second time —
  // exactly the impurity StrictMode is there to surface.
  //
  // Seeded once on mount, which is worth knowing the limit of: pasting a
  // *different* claim link into the address bar changes only the fragment, so
  // the router stays on this route, this component stays mounted, and the form
  // keeps the first code. Rare enough to live with — the fix would be keying the
  // route on the code — and the box is editable, so it is visible and fixable.
  const [code, setCode] = useState(
    () => params.get("code") ?? peekPendingClaim()?.code ?? "",
  );
  const [kind, setKind] = useState<InviteKind>(() => {
    const fromUrl = params.get("kind");
    if (isInviteKind(fromUrl)) return fromUrl;
    // "player" last, as the default for someone who typed /claim themselves:
    // player codes are the ones handed out in bulk, DM codes the rare exception.
    return peekPendingClaim()?.kind ?? "player";
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null while nothing has been claimed; true or false afterwards, carrying what
  // claim_player_invite reported. Only the player branch ever sets it — see the
  // note in handleSubmit for why the DM branch cannot.
  const [joinedNew, setJoinedNew] = useState<boolean | null>(null);

  // Reaching this page consumes the pending claim, whether or not the code above
  // came from it. Unconditional on purpose: leaving a stale stash behind would
  // make the picker bounce every later visit back here.
  useEffect(() => {
    takePendingClaim();
  }, []);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError(null);
    try {
      if (kind === "dm") {
        await claimDm(trimmed);
        // Redirect rather than a success message, and the asymmetry with the
        // branch below is forced rather than chosen. useClaimDmInvite refetches
        // the profile, that sets AuthContext loading, AuthGate renders
        // "Loading..." instead of its children, and this component — one of
        // those children — unmounts and remounts around it. Any state set here
        // would be wiped by that remount. A navigation is the one confirmation
        // that survives it, which is what useClaimDmInvite's note prescribes.
        //
        // replace, so Back doesn't return to a claim form holding a code that
        // has now been burned.
        navigate("/", { replace: true });
        // Nothing after this: the component is gone.
        return;
      }

      const isNew = await claimInvite(trimmed);
      // Held and shown rather than redirected, because 013 changed
      // claim_player_invite to report whether the join was new specifically so
      // the two could be told apart. Dropping the player on the picker would
      // throw that away — and someone who was already a member deserves to hear
      // that their code did nothing rather than to watch a page change. Nothing
      // unmounts this branch, so the message survives.
      setJoinedNew(isNew);
    } catch (err) {
      // Where a bad, spent or wrong-kind code arrives, as an ordinary Postgres
      // error carrying the function's own message. Stays open holding the code:
      // the usual cause is a mis-paste or the wrong kind selected above, and
      // both are fixed in place.
      console.error("Problem claiming invite:", err);
      setError(errorMessage(err, "Problem claiming invite"));
      setSubmitting(false);
    }
  }

  if (joinedNew !== null) {
    return (
      <div>
        <h1>Code claimed</h1>
        <p>
          {joinedNew
            ? "You've joined the campaign."
            : "You were already in that campaign, so nothing changed — but the code has been used up."}
        </p>
        <Link to="/">Go to your campaigns</Link>
      </div>
    );
  }

  return (
    <div>
      <h1>Claim an invite</h1>

      <form onSubmit={handleSubmit}>
        <label htmlFor={codeId}>Invite code</label>
        <input
          id={codeId}
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste the code you were sent"
          disabled={submitting}
          autoFocus
        />

        {/* Always shown, even when the link already answered it. The kind is not
            a detail the app can check for itself — a player code and a DM code
            are both bare uuids — so if a link arrives truncated, or somebody
            forwards the wrong one, this is the only place it can be corrected.
            Radios rather than a select: two options, both worth reading. */}
        <fieldset disabled={submitting}>
          <legend>What is this code for?</legend>
          <label>
            <input
              type="radio"
              name="kind"
              value="player"
              checked={kind === "player"}
              onChange={() => setKind("player")}
            />
            Joining a campaign
          </label>
          <label>
            <input
              type="radio"
              name="kind"
              value="dm"
              checked={kind === "dm"}
              onChange={() => setKind("dm")}
            />
            Becoming a DM (lets you create your own campaigns)
          </label>
        </fieldset>

        <button type="submit" disabled={submitting || !code.trim()}>
          {submitting ? "Claiming..." : "Claim"}
        </button>
        {error && <p>{error}</p>}
      </form>

      <Link to="/">Back to campaigns</Link>
    </div>
  );
}
