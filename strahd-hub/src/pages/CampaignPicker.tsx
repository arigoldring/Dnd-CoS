import { SubmitEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../services/AuthContext";
import { useCampaigns } from "../hooks/useCampaigns";

export function CampaignPicker() {
  const { profile } = useAuth();
  const isDm = profile?.role === "dm";
  const { campaigns, loading, error, addCampaign } = useCampaigns();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

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
    const created = await addCampaign(name);
    // The payoff of createCampaign returning its row: one click makes the
    // campaign and drops you into it, with no trip back through the list.
    navigate(`/campaign/${created.id}`);
  }

  return (
    <div>
      <h1>Campaigns</h1>

      {isDm &&
        (creating ? (
          <NewCampaignForm
            onCreate={handleCreate}
            onClose={() => setCreating(false)}
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
              {/* A link, not a button with navigate(): this is a destination,
                  so it should open in a new tab and show its URL on hover like
                  any other. Same reasoning as the .btn anchors on Home. */}
              <Link className="btn" to={`/campaign/${campaign.id}`}>
                {campaign.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// DM only — hidden for players here, and refused by "dm inserts campaigns"
// (010) if anyone reaches createCampaign another way.
function NewCampaignForm({
  onCreate,
  onClose,
}: {
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    setError(null);
    try {
      await onCreate(trimmed);
      // No onClose() and no setState after this: a successful create navigates
      // into the new campaign, which unmounts the form on its way out.
    } catch (err) {
      // Stay open holding the draft — closing would throw away a typed name
      // over something the DM can just retry.
      console.error("Problem creating campaign:", err);
      setError(err instanceof Error ? err.message : "Problem creating campaign");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="new-campaign-name">Campaign name</label>
      <input
        id="new-campaign-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={saving}
        autoFocus
      />
      <button type="button" onClick={onClose} disabled={saving}>
        Cancel
      </button>
      <button type="submit" disabled={saving || !name.trim()}>
        {saving ? "Creating..." : "Create campaign"}
      </button>
      {error && <p>{error}</p>}
    </form>
  );
}
