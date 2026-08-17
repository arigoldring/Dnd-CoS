import { Outlet, NavLink } from "react-router-dom";
import { signOut } from "../services/auth";
import { NamePrompt } from "./NamePrompt";
import { useAuth } from "../services/AuthContext";
import { useCampaign } from "./CampaignLayout";
import { useState } from "react";
import "./layout.css";

export function Layout() {
  const { profile } = useAuth();
  // Read back off the outlet only to hand it down again. A bare <Outlet /> is
  // not a pass-through: it provides context={undefined}, which would blank out
  // the campaign CampaignLayout set. Every layout between the provider and the
  // page has to re-provide it.
  const campaign = useCampaign();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="app-shell">
      <nav className="app-rail">
        <div className="app-rail__campaign">
          <p className="app-rail__eyebrow">Campaign</p>
          <p className="app-rail__name">{campaign.name}</p>
          <span
            className={`app-rail__role${campaign.isDm ? " app-rail__role--dm" : ""}`}
          >
            {campaign.isDm ? "Dungeon Master" : "Player"}
          </span>
        </div>

        <div className="app-nav">
          <NavLink to="." end>Home</NavLink>
          <NavLink to="Character">Character</NavLink>
          {/* Not DM-gated: a player sees the same page, without the Give
              controls on each panel. */}
          <NavLink to="Party">The Party</NavLink>
          <NavLink to="Shop">Shop</NavLink>
          <NavLink to="Inventory">Inventory</NavLink>
          {campaign.isDm && (
            <NavLink to="CreateItem" className="app-nav__dm">New Item</NavLink>
          )}
          <NavLink to="Maps">Maps</NavLink>
          <NavLink to="Spells">Spells</NavLink>
          <NavLink to="NPC">NPCs</NavLink>
          <NavLink to="Recaps">Recaps</NavLink>
          <div className="app-nav__rule" />
          {campaign.isDm && (
            <NavLink to="Invites" className="app-nav__dm">Invites</NavLink>
          )}
          <NavLink to="/">Campaigns</NavLink>
        </div>

        <div className="app-rail__you">
          {!isEditing ? (
            <p>
              {profile?.displayName}
              <button onClick={() => setIsEditing(true)}>Edit</button>
            </p>
          ) : (
            <NamePrompt
              initialName={profile?.displayName ?? ""}
              heading="Name:"
              onSuccess={() => setIsEditing(false)}
            />
          )}
          <p className="app-rail__signout">
            <button onClick={() => signOut()}>Sign out</button>
          </p>
        </div>
      </nav>

      <main className="app-main">
        <Outlet context={campaign} />
      </main>
    </div>
  );
}
