import { Outlet, Link } from "react-router-dom";
import { signOut } from "../services/auth";
import { NamePrompt } from "./NamePrompt";
import { useAuth } from "../services/AuthContext";
import { useCampaign } from "./CampaignLayout";
import { useState } from "react";

export function Layout() {
  const { profile } = useAuth();
  // Read back off the outlet only to hand it down again. A bare <Outlet /> is
  // not a pass-through: it provides context={undefined}, which would blank out
  // the campaign CampaignLayout set. Every layout between the provider and the
  // page has to re-provide it.
  const campaign = useCampaign();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div>
      {/* Relative targets, so the nav stays inside whatever campaign is in the
          URL without a single link spelling the id out.

          They resolve against the route that RENDERS them, not the page
          showing beneath it — a Link only sees the match chain down to its own
          component. This one is pathless, so it contributes no segment and
          every link below resolves from /campaign/:campaignId: "." is the
          campaign index from anywhere, and "Shop" can't stack onto /Maps.

          That's a property of living in the layout, not of the strings. The
          same "Maps" inside Shop.tsx resolves from /campaign/abc/Shop and
          gives you /campaign/abc/Shop/Maps, which matches nothing. A page that
          owns a path segment has to link absolutely. */}
      <Link to=".">Home</Link>
      <Link to="Shop">Shop</Link>
      <Link to="Inventory">Inventory</Link>
      <Link to="Maps">Maps</Link>
      <Link to="Spells">Spells</Link>
      <Link to="NPC">NPCs</Link>
      <Link to="Recaps">Recaps</Link>
      {/* campaign.isDm, not profile.role — the per-campaign question 018 made
          this, and the same gate CampaignInvites redirects on. A global DM who
          plays in someone else's campaign is not the DM here, and the page
          behind this link would give them an empty list and a refused mint.

          Relative like its neighbours, which is safe for the reason above: this
          layout is pathless, so "Invites" resolves from /campaign/:campaignId
          rather than stacking onto whatever page is showing. */}
      {campaign.isDm && <Link to="Invites">Invites</Link>}
      {/* Absolute: the one link that's meant to leave the campaign. */}
      <Link to="/">Campaigns</Link>
      <span>{campaign.name}</span>
      <button onClick={() => signOut()}>Sign out</button>
      {!isEditing ? (
        <span>
          {profile?.displayName} Role: {profile?.role}
          <button onClick={() => setIsEditing(true)}>Edit</button>
        </span>
      ) : (
        <NamePrompt
          initialName={profile?.displayName ?? ""}
          heading="Name:"
          onSuccess={() => setIsEditing(false)}
        />
      )}
      <Outlet context={campaign} />
    </div>
  );
}
