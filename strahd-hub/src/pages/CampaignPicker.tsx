import { SubmitEvent, useId, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../services/AuthContext";
import { useCampaigns } from "../hooks/useCampaigns";

export function CampaignPicker() {
  const { profile } = useAuth();
  const isDm = profile?.role === "dm";
  const { campaigns, loading, error, addCampaign, renameCampaign } =
    useCampaigns();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  // Which row is in edit mode, by id rather than a boolean per campaign — one
  // open editor at a time, and clicking Rename on another row moves it there.
  const [renamingId, setRenamingId] = useState<string | null>(null);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

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
    <div>
      <h1>Campaigns</h1>

      {isDm &&
        (creating ? (
          <CampaignNameForm
            submitLabel="Create campaign"
            savingLabel="Creating..."
            onSubmit={handleCreate}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <button onClick={() => setCreating(true)}>New campaign</button>
        ))}

      {campaigns.length === 0 ? (
        <p>
          {isDm
            ? "No campaigns yet. Start one above."
            : "You're not in a campaign yet. Ask your DM for an invite."}
        </p>
      ) : (
        <ul>
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              {renamingId === campaign.id ? (
                // initialName only seeds state on mount, which is enough
                // because the form lives inside this row: opening a different
                // one mounts that row's own form rather than reusing this one
                // with a stale draft.
                <CampaignNameForm
                  initialName={campaign.name}
                  submitLabel="Save name"
                  savingLabel="Saving..."
                  onSubmit={(name) => handleRename(campaign.id, name)}
                  onCancel={() => setRenamingId(null)}
                />
              ) : (
                <>
                  {/* A link, not a button with navigate(): this is a
                      destination, so it should open in a new tab and show its
                      URL on hover like any other. Same reasoning as the .btn
                      anchors on Home. */}
                  <Link className="btn" to={`/campaign/${campaign.id}`}>
                    {campaign.name}
                  </Link>
                  {/* DM only here, and refused by "dms update campaigns" (012)
                      if a player reaches updateCampaignName another way. */}
                  {isDm && (
                    <button onClick={() => setRenamingId(campaign.id)}>
                      Rename
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
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
      setError(
        err instanceof Error ? err.message : "Problem saving campaign name",
      );
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
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
      {error && <p>{error}</p>}
    </form>
  );
}
