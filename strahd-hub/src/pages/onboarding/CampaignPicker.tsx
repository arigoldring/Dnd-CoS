import { SubmitEvent, useId, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../services/AuthContext";
import { useCampaigns } from "../../hooks/useCampaigns";
import { Campaign } from "../../services/campaigns";
import { peekPendingClaim } from "../../lib/claimLink";
import { errorMessage } from "../../lib/errors";
import "../onboarding/onboarding.css";

export function CampaignPicker() {
  const { profile } = useAuth();
  const isDm = profile?.role === "dm";
  const {
    data: campaigns = [],
    isLoading: loading,
    error,
    addCampaign,
    renameCampaign,
    removeCampaign,
  } = useCampaigns();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  // Which row is in edit mode, by id rather than a boolean per campaign — one
  // open editor at a time, and clicking Rename on another row moves it there.
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // Where an invitee lands after signing in: signInWithGoogle sends them back to
  // the bare origin, so a claim link they followed cold arrives here instead of
  // at /claim, minus its fragment. If main.tsx caught a code on the way past,
  // this is what finishes the trip. Ahead of the loading check on purpose —
  // whether they can claim has nothing to do with which campaigns they can
  // already see, and the wait would be for a list they are not staying for.
  //
  // Cannot loop: /claim clears the stash on mount, so coming back here finds
  // nothing. Peeked rather than taken for that same reason — consuming it in
  // passing would land them on an empty form.
  if (peekPendingClaim()) return <Navigate to="/claim" replace />;

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error.message}</p>;

  // The one rule that decides whether this page is worth showing. A player with
  // a single campaign has nothing to choose, so choosing is skipped and they
  // land in it — for them "/" is a redirect, not a screen. The DM always gets
  // the list even at one campaign, because creating the next one starts here.
  //
  // replace, so the picker doesn't end up in history: without it, Back from
  // inside the campaign returns here and is immediately bounced forward again.
  if (!isDm && campaigns.length === 1)
    return <Navigate to={`/campaign/${campaigns[0].id}`} replace />;

  async function handleCreate(name: string) {
    // Failures propagate to the form, which keeps the draft and shows them.
    const id = await addCampaign(name);
    // The payoff of createCampaign returning the new id: one click makes the
    // campaign and drops you into it, with no trip back through the list.
    navigate(`/campaign/${id}`);
  }

  async function handleRename(id: string, name: string) {
    // Same deal: a rejection stays in the form, so only a save that actually
    // landed closes the editor.
    await renameCampaign(id, name);
    setRenamingId(null);
  }

  return (
    <div className="threshold">
      <div className="threshold__inner">
        <p className="threshold__brand">Strahd Hub</p>
        <h1>Campaigns</h1>

        {campaigns.length === 0 ? (
          <>
            <p className="campaigns__empty">
              {isDm
                ? "No campaigns yet. Start one above."
                : "You're not in a campaign yet. Ask your DM for an invite."}
            </p>
            {isDm && !creating && (
              <button className="campaigns__new" onClick={() => setCreating(true)}>
                New campaign
              </button>
            )}
            {isDm && creating && (
              <CampaignNameForm
                submitLabel="Create campaign"
                savingLabel="Creating..."
                onSubmit={handleCreate}
                onCancel={() => setCreating(false)}
              />
            )}
          </>
        ) : (
          <ul className="campaigns">
            {isDm && !creating && (
              <li>
                <button className="campaigns__new" onClick={() => setCreating(true)}>
                  New campaign
                </button>
              </li>
            )}
            {isDm && creating && (
              <li>
                <CampaignNameForm
                  submitLabel="Create campaign"
                  savingLabel="Creating..."
                  onSubmit={handleCreate}
                  onCancel={() => setCreating(false)}
                />
              </li>
            )}
            {campaigns.map((campaign) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                isRenaming={renamingId === campaign.id}
                onStartRename={() => setRenamingId(campaign.id)}
                onRename={(name) => handleRename(campaign.id, name)}
                onCancelRename={() => setRenamingId(null)}
                onDelete={removeCampaign}
              />
            ))}
          </ul>
        )}

        <hr />
        <div className="threshold__doors">
          {isDm && <Link to="/invites">Invite a DM</Link>}
          <Link to="/claim">Have an invite code?</Link>
        </div>
      </div>
    </div>
  );
}

// One campaign in the list: the link to open it, and — for its DM — the rename
// and delete controls. A component rather than an inline <li> for the same
// reason RecapCard is one: the delete carries its own in-flight and error state,
// and that state belongs next to the row that owns it so a failure reports
// against the campaign that failed, not as one message for the whole list. The
// rename editor is still opened from the page (renamingId is one-at-a-time
// across all rows), so that stays a set of props rather than local state here.
function CampaignRow({
  campaign,
  isRenaming,
  onStartRename,
  onRename,
  onCancelRename,
  onDelete,
}: {
  campaign: Campaign;
  isRenaming: boolean;
  onStartRename: () => void;
  onRename: (name: string) => Promise<void>;
  onCancelRename: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    // The warning names the campaign and is explicit that the delete cascades:
    // a campaign is not just a name, and removing it takes its whole table with
    // it. window.confirm, matching the recap delete — a real "cannot be undone"
    // gate rather than a bespoke dialog.
    if (
      !window.confirm(
        `Delete "${campaign.name}"? This permanently removes the campaign and ` +
          `everything in it — recaps, map notes, invites and members. This ` +
          `cannot be undone.`,
      )
    )
      return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(campaign.id);
      // No setState after this: a successful delete unmounts this row.
    } catch (err) {
      console.error("Problem deleting campaign:", err);
      setDeleteError(errorMessage(err, "Problem deleting campaign"));
      setDeleting(false);
    }
  }

  if (isRenaming) {
    return (
      <li className="campaign-row">
        {/* initialName only seeds state on mount, which is enough because the
            form lives inside this row: opening a different one mounts that
            row's own form rather than reusing this one with a stale draft. */}
        <CampaignNameForm
          initialName={campaign.name}
          submitLabel="Save name"
          savingLabel="Saving..."
          onSubmit={onRename}
          onCancel={onCancelRename}
        />
      </li>
    );
  }

  return (
    <li className="campaign-row">
      {/* A link, not a button with navigate(): this is a destination, so it
          should open in a new tab and show its URL on hover like any other.
          Same reasoning as the .btn anchors on Home. */}
      <Link className="campaign-row__open" to={`/campaign/${campaign.id}`}>
        {campaign.name}
      </Link>
      {/* campaign.isDm, not the global isDm on the page. "dms update campaigns"
          (012) and "dms delete campaigns" (020) are both scoped to
          is_campaign_dm, so a global DM acting on someone else's campaign
          matches no rows — Rename would surface updateCampaignName's "may not
          have permission", and Delete would silently no-op — both messages
          about buttons that should not have been there. Since the only DM of a
          campaign is its creator (014), this gate is also exactly "the DM who
          created it may delete it". */}
      {campaign.isDm && (
        <div className="campaign-row__actions">
          <button onClick={onStartRename}>Rename</button>
          <button onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      )}
      {deleteError && <p className="threshold__error">{deleteError}</p>}
    </li>
  );
}

// DM only — hidden for players at both call sites, and refused by the campaigns
// policies (010, 012) if anyone reaches the service functions another way.
//
// One form for naming a campaign, whether or not it exists yet: the difference
// between creating and renaming is the row it lands on, which is the caller's
// business, not the form's. It only knows how to hold a name, and what the
// button says while it does.
function CampaignNameForm({
  initialName = "",
  submitLabel,
  savingLabel,
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  submitLabel: string;
  savingLabel: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  // Generated rather than hard-coded: the create form and a row's rename form
  // can be open at once, and two labels pointing at the same id would leave one
  // of the inputs unlabelled.
  const inputId = useId();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      // Nothing after this on purpose: both callers unmount the form on success
      // — a create navigates into the new campaign, a rename closes the row's
      // editor — so there is no state left here to put back.
    } catch (err) {
      // Stay open holding the draft — closing would throw away a typed name
      // over something the DM can just retry.
      console.error("Problem saving campaign name:", err);
      setError(errorMessage(err, "Problem saving campaign name"));
      setSaving(false);
    }
  }

  return (
    <form className="campaign-name-form" onSubmit={handleSubmit}>
      <label htmlFor={inputId}>Campaign name</label>
      <input
        id={inputId}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={saving}
        autoFocus
      />
      <button type="button" onClick={onCancel} disabled={saving}>
        Cancel
      </button>
      <button type="submit" disabled={saving || !name.trim()}>
        {saving ? savingLabel : submitLabel}
      </button>
      {error && <p className="threshold__error">{error}</p>}
    </form>
  );
}
