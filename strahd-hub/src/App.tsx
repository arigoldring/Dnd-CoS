import "./App.css";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { Shop } from "./pages/Shop";
import { Maps } from "./pages/Maps";
import { Spells } from "./pages/Spells";
import { Layout } from "./components/Layout";
import { Npcs } from "./pages/NPC";
import { Recaps } from "./pages/Recaps";
import { Combat } from "./pages/Combat";
import { AuthProvider, AuthGate } from "./services/AuthContext";

function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AuthGate>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/Shop" element={<Shop />} />
              <Route path="/Maps" element={<Maps />} />
              <Route path="/Spells" element={<Spells />} />
              <Route path="/NPC" element={<Npcs />} />
              <Route path="/Recaps" element={<Recaps />} />
              <Route path="/Combat" element={<Combat />} />
            </Route>
          </Routes>
        </AuthGate>
      </HashRouter>
    </AuthProvider>
  );
}

export default App;
