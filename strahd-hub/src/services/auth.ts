import { supabase } from "../lib/supabase";
import { queryClient } from "../lib/queryClient";

export async function signInWithGoogle() {
  // Supabase's signInWithOAuth method handles the entire OAuth flow, including redirecting to Google's login page and back to our app
  const { error: AuthError } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });

  if (AuthError) {
    console.error("Problem authenticating with Google:", AuthError.message);
  }
}
export async function signOut() {
  const { error: AuthError } = await supabase.auth.signOut();

  if (AuthError) {
    console.error("Problem signing out:", AuthError.message);
    return;
  }
  // The client outlives the session; without this the next account could be
  // shown the previous user's cached data until its refetches land.
  queryClient.clear();
}
