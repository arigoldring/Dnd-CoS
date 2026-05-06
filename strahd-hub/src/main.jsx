import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { signInWithGoogle } from './auth.js'

createRoot(document.getElementById('root')).render(
  
  <StrictMode>
    <button onClick={signInWithGoogle}>Sign in with Google</button>
    <App />
  </StrictMode>,
)
