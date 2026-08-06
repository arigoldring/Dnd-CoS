import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { Shop } from "./pages/Shop";
import { Maps } from "./pages/Maps";
import { Spells } from "./pages/Spells";
import { Layout } from "./components/Layout";
import { Npcs } from "./pages/NPC";
import { Recaps } from "./pages/Recaps";
import { PartyInventory } from "./pages/PartyInventory";
import { AuthProvider, AuthGate } from "./services/AuthContext";
import { CampaignLayout } from "./components/CampaignLayout";
import { CampaignPicker } from "./pages/onboarding/CampaignPicker";
import { Claim } from "./pages/onboarding/Claim";
import { DmInvites } from "./pages/onboarding/DmInvites";
import { CampaignInvites } from "./pages/CampaignInvites";

function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AuthGate>
          <Routes>
            {/* Flat on purpose. Everything above the campaign line is something
                you do before you have one — pick a campaign, claim a code, hand
                one out — so none of it can sit under :campaignId.

                /claim takes a code and has no idea which campaign it is for
                until the server resolves one; /invites hands out the DM flag,
                which is not a campaign's to grant. Player invites are the
                exception and live below, at /campaign/:campaignId/Invites,
                because they are scoped to exactly one campaign. */}
            <Route path="/" element={<CampaignPicker />} />
            <Route path="/claim" element={<Claim />} />
            <Route path="/invites" element={<DmInvites />} />

            {/* One param carries the campaign for every page below it.
                CampaignLayout validates it and puts the campaign on the outlet;
                Layout is the chrome, and re-provides it on the way down. */}
            <Route path="/campaign/:campaignId" element={<CampaignLayout />}>
              <Route element={<Layout />}>
                {/* index, not path="/": the campaign's own landing page is the
                    bare /campaign/:campaignId URL. */}
                <Route index element={<Home />} />
                <Route path="Shop" element={<Shop />} />
                <Route path="Inventory" element={<PartyInventory />} />
                <Route path="Maps" element={<Maps />} />
                <Route path="Spells" element={<Spells />} />
                <Route path="NPC" element={<Npcs />} />
                <Route path="Recaps" element={<Recaps />} />
                {/* DM of THIS campaign only, enforced by the page itself and
                    by 019 behind it. Down here rather than beside /invites
                    because generate_player_invite takes the campaign as its
                    argument, and the URL is where that comes from. */}
                <Route path="Invites" element={<CampaignInvites />} />
              </Route>
            </Route>

            {/* Old bookmarks point at the pre-campaign paths (#/Shop and
                friends), which now match nothing and would render a blank page.
                Send them to the picker, which knows where they should go. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthGate>
      </HashRouter>
    </AuthProvider>
  );
}

export default App;
