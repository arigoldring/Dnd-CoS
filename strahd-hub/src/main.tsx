import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme.css";
import "./index.css";
import App from "./App.js";
import { stashPendingClaim } from "./lib/claimLink";

// Before render, and it has to be: an invitee following a link while signed out
// gets sent through Google and back to the bare origin, which drops the fragment
// their code was in. This is the last moment that fragment exists. See
// claimLink.ts for the whole round trip, and for why the redirect target cannot
// simply be changed to keep it.
stashPendingClaim();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
