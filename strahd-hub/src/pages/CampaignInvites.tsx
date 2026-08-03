import { Link, Navigate } from "react-router-dom";
import { useCampaign } from "../components/CampaignLayout";
import { useInvites } from "../hooks/useInvites";
import { InvitePanel } from "../components/InvitePanel";
import { Campaign } from "../services/campaigns";

/**
 * Player invites for the campaign in the URL — codes that make someone a member
 * of this one campaign and nothing else.
 *
 * Lives under /campaign/:campaignId because that is what the invites are scoped
 * to. Both halves of the screen need a campaign id and neither can guess one:
 * getInvites filters by it, and generate_player_invite takes it as the argument
 * it checks permission against. Putting this page above the campaign line would
 * mean adding a campaign picker to a route that already had one in its path.
 *
 * Its opposite number is DmInvites, which is top-level for the mirror-image
 * reason — a DM invite has no campaign to belong to.
 */
export function CampaignInvites() {
  const campaign = useCampaign();

  // Split gate-then-render, like CampaignLayout: decide who is allowed here
  // before the hook that fetches for them exists, so a redirect costs no query.
  //
  // campaign.isDm, and NOT profile.role — this is the whole reason that field
  // was added. After 019 both halves of this page ask is_campaign_dm: the list
  // comes back empty for anyone else ("dms can view invites"), and the mint
  // raises "Only the DM of this campaign can generate invites". A global DM
  // sitting in someone else's campaign as a player passes the old global check
  // and fails both of these, so gating on it would have offered them a page that
  // can only disappoint.
  if (!campaign.isDm)
    return <Navigate to={`/campaign/${campaign.id}`} replace />;

  return <CampaignInviteList campaign={campaign} />;
}

function CampaignInviteList({ campaign }: { campaign: Campaign }) {
  const { invites, loading, error, addInvite } = useInvites(campaign.id);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div>
      <h1>Invite players to {campaign.name}</h1>
      <p>
        Each code works once and adds whoever claims it to this campaign only.
        Send the link and they can sign in and claim it themselves.
      </p>

      <InvitePanel
        kind="player"
        invites={invites}
        onMint={(label) => addInvite(label)}
        mintLabel="Generate player invite"
        emptyText="No invites yet. Generate one above and send it to a player."
      />

      {/* Absolute, unlike the nav's relative links. This route owns a path
          segment, so a relative target would resolve from
          /campaign/:campaignId/Invites — the trap Layout.tsx documents. */}
      <Link to={`/campaign/${campaign.id}`}>Back to {campaign.name}</Link>
    </div>
  );
}
