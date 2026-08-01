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
          URL without a single link spelling the id out. They resolve against
          this route's place in the tree (/campaign/:campaignId), not against
          the current URL — so "Shop" means the same thing from every page. */}
      <Link to=".">Home</Link>
      <Link to="Shop">Shop</Link>
      <Link to="Maps">Maps</Link>
      <Link to="Spells">Spells</Link>
      <Link to="NPC">NPCs</Link>
      <Link to="Recaps">Recaps</Link>
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
