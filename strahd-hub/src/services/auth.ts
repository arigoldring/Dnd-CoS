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
/**
 * Password sign-in, for the public demo link and nothing else.
 *
 * Every human account here arrives through Google (above), and that stays true:
 * the demo seat is a password account precisely so it is not one of them --
 * created in the dashboard, holding no Google identity, and posted in public on
 * purpose. Its credentials reach this function from import.meta.env, so they are
 * in the bundle rather than the repo; see Demo.tsx for why that is the accepted
 * shape and not an oversight.
 *
 * Throws rather than logging and returning, unlike signInWithGoogle. That one
 * swallows because it hands off to a redirect and has no screen left to report
 * on; this one is awaited by a page that stays mounted and has an error state to
 * fill, so the error has to survive the call. Same reason every mutation in
 * services/ rejects.
 */
export async function signInWithDemo(email: string, password: string) {
  const { error: AuthError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (AuthError) throw AuthError;

  // The same clear signOut does, for the same reason and one more. The client
  // outlives the session, so without this the demo visitor is shown whatever the
  // previous account cached until their own refetches land -- and here that
  // previous account is routinely the DM, whose cache holds unrevealed
  // locations and NPCs that RLS would never have sent this user. Reaching /demo
  // while signed in as the DM is a documented case, not a hypothetical one, so
  // this is load-bearing rather than tidy.
  queryClient.clear();
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
