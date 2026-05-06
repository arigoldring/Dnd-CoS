import { supabase } from "./supabase";


export async function signInWithGoogle() {
    // Supabase's signInWithOAuth method handles the entire OAuth flow, including redirecting to Google's login page and back to our app
    const { error: AuthError} = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + "/group-project-red/"} })
    
    // Error handling
    if (AuthError) {
    console.error("Problem authenticating with Google:", AuthError.message);
}
} 