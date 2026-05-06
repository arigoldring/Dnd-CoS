import { useState, useEffect } from 'react'
import './App.css'
import { signInWithGoogle } from './auth'
import { supabase } from './supabase'
import { HashRouter, Route, Routes } from "react-router-dom";
import { Home } from "./home";

function App() {
  //sets user to null, no one signed in yet
  const [user, setUser] = useState(null);
  useEffect(() => {
    // Listen for changes to the user's authentication state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    setUser(session?.user ?? null)
  })
  //Need to unsubscribe when component unmount to prevent memory leaks
    return () => subscription.unsubscribe()
  
}, [])

  if (!user) {
    return <button onClick={signInWithGoogle}>Sign in</button>
  }

  return (
    <div>
      You are signed in as {user.email}
    
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />}/>
      </Routes>
    </HashRouter>
    </div>
  )
}

export default App;