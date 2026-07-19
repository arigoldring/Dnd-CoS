import "./App.css";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { Shop } from "./pages/Shop";
import { Maps } from "./pages/Maps";
import { Spells } from "./pages/Spells";
import { Layout } from "./assets/components/Layout";
import { AuthProvider, AuthGate } from "./services/AuthContext";
import { signOut } from "./services/auth";

function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/Shop" element={<Shop />} />
              <Route path="/Maps" element={<Maps />} />
              <Route path="/Spells" element={<Spells />} />
            </Route>
          </Routes>
          <div>
            <button onClick={() => signOut()}>Sign out</button>
          </div>
        </HashRouter>
      </AuthGate>
    </AuthProvider>
  );
}

export default App;
