import "./App.css";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { Shop } from "./pages/Shop";
import { Maps } from "./pages/Maps";
import { Spells } from "./pages/Spells";
import { Layout } from "./components/Layout";
import { Npcs } from "./pages/NPC";
import { Recaps } from "./pages/Recaps";
import { AuthProvider, AuthGate } from "./services/AuthContext";
import { CampaignLayout } from "./components/CampaignLayout";
import { CampaignPicker } from "./pages/CampaignPicker";

function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AuthGate>
          <Routes>
            {/* Flat on purpose. Everything above the campaign line is something
                you do before you have one — pick a campaign, claim a code, hand
                one out — so none of it can sit under :campaignId.

                /claim and /invites belong here, beside "/", once those pages
                exist; the invite RPCs (010) are already in place. */}
            <Route path="/" element={<CampaignPicker />} />

            {/* One param carries the campaign for every page below it.
                CampaignLayout validates it and puts the campaign on the outlet;
                Layout is the chrome, and re-provides it on the way down. */}
            <Route path="/campaign/:campaignId" element={<CampaignLayout />}>
              <Route element={<Layout />}>
                {/* index, not path="/": the campaign's own landing page is the
                    bare /campaign/:campaignId URL. */}
                <Route index element={<Home />} />
                <Route path="Shop" element={<Shop />} />
                <Route path="Maps" element={<Maps />} />
                <Route path="Spells" element={<Spells />} />
                <Route path="NPC" element={<Npcs />} />
                <Route path="Recaps" element={<Recaps />} />
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
