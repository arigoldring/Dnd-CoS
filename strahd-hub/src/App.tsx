import { useState, useEffect } from "react";
import "./App.css";
import { signInWithGoogle } from "./services/auth";
import { supabase } from "./lib/supabase";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { Shop } from "./pages/Shop";
import { User } from "@supabase/supabase-js";

function App() {
  //sets user to null, no one signed in yet
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    // Listen for changes to the user's authentication state
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    //Need to unsubscribe when component unmount to prevent memory leaks
    return () => subscription.unsubscribe();
  }, []);

  if (!user) {
    return <button onClick={signInWithGoogle}>Sign in</button>;
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/Shop" element={<Shop />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
