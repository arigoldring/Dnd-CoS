import { SubmitEvent, useEffect, useId, useState } from "react";
import { Invite } from "../services/invites";
import { InviteKind, claimUrl } from "../lib/claimLink";

/**
 * Mint a code, then hand it over: the screen shared by both invite pages.
 *
 * One component for two kinds, in the same spirit as invites.ts holding both
 * lifecycles — the tables are column-identical apart from campaign_id, the rows
 * arrive as one `Invite` type, and everything below is about a code and a label.
 * What differs between the two pages is entirely upstream of this: which hook
 * owns the list, and who is allowed on the page at all. Neither is this
 * component's business, so both are the caller's.
 *
 * `kind` is here for one reason and it is not styling — it decides which claim
 * URL the copy button produces, and getting it wrong sends the invitee to the
 * wrong claim function. See claimLink.ts for why the code alone can't say.
 */
export function InvitePanel({
  kind,
  invites,
  onMint,
  mintLabel,
  emptyText,
}: {
  kind: InviteKind;
  invites: Invite[];
  onMint: (label: string) => Promise<Invite>;
  mintLabel: string;
  emptyText: string;
}) {
  return (
    <div>
      <MintForm onMint={onMint} mintLabel={mintLabel} />

      {invites.length === 0 ? (
        <p>{emptyText}</p>
      ) : (
        <ul>
          {invites.map((invite) => (
            <InviteRow key={invite.id} invite={invite} kind={kind} />
          ))}
        </ul>
      )}
    </div>
  );
}

// The label is the DM's note about who a code is for, and it is optional at
// every level below this — the column is nullable, the RPC argument defaults to
// null, and blankToOmitted in invites.ts turns an empty box into the default. So
// no `required` here, and no disabled-on-empty submit: an unlabelled invite is a
// real thing to want, unlike the unnamed campaign CampaignNameForm refuses.
function MintForm({
  onMint,
  mintLabel,
}: {
  onMint: (label: string) => Promise<Invite>;
  mintLabel: string;
}) {
  // Generated rather than hard-coded, like CampaignNameForm: nothing stops a
  // future page from mounting both panels, and two labels pointing at one id
  // would leave an input unlabelled.
  const inputId = useId();
  const [label, setLabel] = useState("");
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setMinting(true);
    setError(null);
    try {
      await onMint(label);
      // Cleared rather than kept, and the form stays open rather than closing —
      // both the opposite of NewRecapForm and CampaignNameForm, which unmount on
      // success. Minting a second code is the ordinary next thing a DM does
      // here, and the label just used now belongs to a row in the list below,
      // where leaving it in the box would make it look like the next one's.
      setLabel("");
    } catch (err) {
      // Held rather than cleared: this is where "Only the DM of this campaign
      // can generate invites" (019) arrives, and it is the message that explains
      // the whole page.
      console.error("Problem creating invite:", err);
      setError(err instanceof Error ? err.message : "Problem creating invite");
    } finally {
      // Safe in a finally here, unlike the forms that close on success: nothing
      // in this component unmounts on a successful mint.
      setMinting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor={inputId}>
        Label <span>(optional — a note about who this is for)</span>
      </label>
      <input
        id={inputId}
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="e.g. Ireena's player"
        disabled={minting}
      />
      <button type="submit" disabled={minting}>
        {minting ? "Generating..." : mintLabel}
      </button>
      {error && <p>{error}</p>}
    </form>
  );
}

function InviteRow({ invite, kind }: { invite: Invite; kind: InviteKind }) {
  // `used`, not claimedByName — the name is also null when the claimant's
  // profile has since been deleted, so on its own it cannot tell "nobody has
  // burned this" from "burned by someone since gone". Invite says so, and the
  // recap byline in Recaps.tsx has the same trap.
  if (invite.used) {
    const who = invite.claimedByName ?? "someone since deleted";
    const when = invite.usedAt
      ? new Date(invite.usedAt).toLocaleDateString()
      : "unknown date";
    return (
      <li>
        <span>{invite.label ?? "Unlabelled"}</span>
        {/* No code and no copy buttons on a spent row. The code is dead — codes
            are one-shot — so offering it would be offering a link that fails. */}
        <span>
          claimed by {who} · {when}
        </span>
      </li>
    );
  }

  return (
    <li>
      <span>{invite.label ?? "Unlabelled"}</span>
      {/* The code itself, on screen and selectable, not hidden behind the copy
          button. Both buttons below can fail for reasons the DM cannot fix, and
          this is what makes that a nuisance rather than a dead end. */}
      <code>{invite.code}</code>
      <CopyButton what="code" value={invite.code} />
      <CopyButton what="link" value={claimUrl(invite.code, kind)} />
    </li>
  );
}

function CopyButton({ what, value }: { what: string; value: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  // Both outcomes are transient labels on the button, so both time out. The
  // cleanup is what makes that safe: a row can unmount while a message is up —
  // a reload replaces the whole list — and this cancels the timer with it.
  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch (err) {
      // Deliberately not an error banner. navigator.clipboard needs a secure
      // context and a permission, and either can say no for reasons a DM can do
      // nothing about — over plain http on a LAN address, for one. The code is
      // rendered above and can be selected by hand, so the honest response is to
      // say the button failed and get out of the way.
      console.error("Problem copying to clipboard:", err);
      setState("failed");
    }
  }

  return (
    <button type="button" onClick={handleCopy}>
      {state === "copied"
        ? "Copied"
        : state === "failed"
          ? "Copy failed — select it"
          : `Copy ${what}`}
    </button>
  );
}
