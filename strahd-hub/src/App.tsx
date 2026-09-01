import { HashRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Home } from "./pages/campaign/Home";
import { Shop } from "./pages/campaign/Shop";
import { Maps } from "./pages/campaign/Maps";
import { MapView } from "./pages/campaign/MapView";
import { Spells } from "./pages/campaign/Spells";
import { Feats } from "./pages/campaign/Feats";
import { Layout } from "./components/Layout";
import { Npcs } from "./pages/campaign/NPC";
import { Recaps } from "./pages/campaign/Recaps";
import { Inventory } from "./pages/campaign/Inventory";
import { Character, CharacterDetail } from "./pages/campaign/Character";
// import { Party } from "./pages/campaign/Party";
import { CreateItem } from "./pages/campaign/CreateItem";
import { CreateFeat } from "./pages/campaign/CreateFeat";
import { AuthProvider, AuthGate } from "./services/AuthContext";
import { CampaignLayout } from "./components/CampaignLayout";
import { CampaignPicker } from "./pages/onboarding/CampaignPicker";
import { Claim } from "./pages/onboarding/Claim";
import { Demo } from "./pages/onboarding/Demo";
import { DmInvites } from "./pages/onboarding/DmInvites";
import { CampaignInvites } from "./pages/campaign/CampaignInvites";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <Routes>
            {/* Above AuthGate, and the only route that is. Signing in is what
              this route DOES, so a signed-out stranger following the link from
              Discord has to be able to reach it -- inside the gate they would
              get the Google button instead, which is the one thing the demo
              exists to skip. It signs in and redirects; it renders nothing of
              the campaign itself, so nothing below the gate is loosened.

              The gate moved from wrapping <Routes> to a pathless layout route
              rather than the routes moving, so the flat/nested split below is
              exactly as it was. */}
            <Route path="/demo" element={<Demo />} />

            <Route
              element={
                <AuthGate>
                  <Outlet />
                </AuthGate>
              }
            >
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
                  {/* Both inventories on one page: the viewer's pack and the
                    party's hoard, with the transfer between them. Same path as
                    the party-only page it replaces, so every existing link and
                    bookmark keeps working. */}
                  <Route path="Inventory" element={<Inventory />} />
                  {/* The viewer's own PC when a player — "mine", and 028's
                    policies make the owner the only one who can rename or
                    delete it regardless. A DM has no PC here, so Character
                    dispatches to a roster of the campaign's characters
                    instead; picking one goes to Character/:characterId,
                    Maps/:mapId's shape reused for the same reason: an index
                    that decides who may be reached, and a detail route that
                    only has to resolve one id already known to be valid. */}
                  <Route path="Character" element={<Character />} />
                  <Route
                    path="Character/:characterId"
                    element={<CharacterDetail />}
                  />
                  {/* The same read one level up: every character in the
                    campaign rather than only yours. Not DM-gated — 028 lets any
                    member read the whole table, and the page's one write is.

                    Temporarily off while we look at the app without it. The
                    catch-all below now swallows /campaign/:id/Party and sends
                    it to the picker. */}
                  {/* <Route path="Party" element={<Party />} /> */}
                  <Route path="CreateItem" element={<CreateItem />} />
                  {/* Both authoring pages guard themselves on campaign.isDm and
                    are refused by 025 and 039 behind that. Neither is in the
                    nav rail: each is linked from the catalogue it writes into,
                    which is where you are when you want one. */}
                  <Route path="CreateFeat" element={<CreateFeat />} />
                  {/* The app's first route with a second dynamic segment. Maps
                    is an index of map cards; Maps/:mapId is the viewer for
                    one. :mapId is a key from src/data/maps.ts, not a database
                    id — MapView sends you back here when it names no map this
                    viewer may open. Flat, not nested, so a bare
                    <Link to=".."> from the viewer can't climb past Maps to
                    campaign home; back-links use the absolute
                    `/campaign/${campaign.id}/Maps` instead. */}
                  <Route path="Maps" element={<Maps />} />
                  <Route path="Maps/:mapId" element={<MapView />} />
                  <Route path="Spells" element={<Spells />} />
                  {/* The grimoire's twin. Not DM-gated — 039's read policy is
                    shared-plus-your-campaign, the same as spells. */}
                  <Route path="Feats" element={<Feats />} />
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
            </Route>
          </Routes>
        </HashRouter>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
