import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../services/AuthContext";
import { useDmInvites } from "../../hooks/useInvites";
import { InvitePanel } from "../../components/InvitePanel";

/**
 * DM invites — codes that set profiles.role = 'dm', which since 018 means
 * exactly one thing: the claimer may create campaigns of their own.
 *
 * Top-level rather than under /campaign/:campaignId, and that is not a layout
 * preference. There is no campaign for one of these to belong to; this is the
 * code you hand someone who has none and wants to start one. Nesting it would
 * attach a campaign id to a grant that ignores it.
 */
export function DmInvites() {
  const { profile } = useAuth();

  // profiles.role, and here that IS the right question — the one place in the
  // app where it still is. generate_dm_invite (000) checks the global flag
  // inline, and "dms can view invites" on dm_invites gates the read the same
  // way. 019's closing note calls this out permanently: dm_invites has no
  // campaign_id to ask about, and what is being handed out is the flag itself,
  // so it is the one place is_dm() guards is_dm(). Do not "fix" this to
  // campaign.isDm the way CampaignInvites was — there is no campaign here.
  if (profile?.role !== "dm") return <Navigate to="/" replace />;

  return <DmInviteList />;
}

function DmInviteList() {
  const { invites, loading, error, addInvite } = useDmInvites();

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div>
      <h1>Invite a DM</h1>
      <p>
        A DM code works once and lets whoever claims it create campaigns of their
        own. It does not add them to any of yours — for that, use the Invites
        page inside the campaign.
      </p>

      <InvitePanel
        kind="dm"
        invites={invites}
        onMint={(label) => addInvite(label)}
        mintLabel="Generate DM invite"
        emptyText="No DM invites yet."
      />

      <Link to="/">Back to campaigns</Link>
    </div>
  );
}
