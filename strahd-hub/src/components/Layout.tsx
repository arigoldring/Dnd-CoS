import { Outlet, NavLink } from "react-router-dom";
import { signOut } from "../services/auth";
import { NamePrompt } from "./NamePrompt";
import { useAuth } from "../services/AuthContext";
import { useCampaign } from "./CampaignLayout";
import { usePlayerPreview } from "./PlayerPreviewContext";
import { useState } from "react";
import "./layout.css";

export function Layout() {
  const { profile } = useAuth();
  const { previewing, setPreviewing } = usePlayerPreview();
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
          {/* campaign.isDm, never the previewing-aware gate the pages use: this
              control has to survive its own effect, or switching it on would
              take away the only way to switch it back off. The rail itself is
              not part of what preview hides — the badge above and the DM links
              below stay exactly as they are. */}
          {campaign.isDm && (
            <button
              className={`app-rail__preview${previewing ? " is-on" : ""}`}
              onClick={() => setPreviewing(!previewing)}
            >
              {previewing ? "Exit player view" : "View as player"}
            </button>
          )}
        </div>

        <div className="app-nav">
          <NavLink to="." end>Home</NavLink>
          <NavLink to="Character">Character</NavLink>
          {/* Directly after Character, because Inventory is now half a personal
              page — your own pack, with the party's hoard beside it — rather
              than the shared pile alone. */}
          <NavLink to="Inventory">Inventory</NavLink>
          {/* Not DM-gated: a player sees the same page, without the Give
              controls on each panel.

              Temporarily hidden while we look at the app without The Party. */}
          {/* <NavLink to="Party">The Party</NavLink> */}
          <NavLink to="Shop">Shop</NavLink>
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
