import { User } from "@supabase/supabase-js";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { Profile, getOrCreateProfile } from "./profiles";
import { NamePrompt } from "../components/NamePrompt";
import { signInWithGoogle } from "./auth";
import { errorMessage } from "../lib/errors";

export interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  refetchProfile: () => Promise<void>;
  //Used to force a re-read of the profile after mutating it
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
function useSession() {
  const [user, setUser] = useState<User | null>(null);
  // "Signed out" and "haven't read the session yet" both leave user null, so
  // this is the only thing that tells them apart. onAuthStateChange fires
  // INITIAL_SESSION once the client has read storage — session or not — which
  // is the moment null becomes a real answer.
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      setResolved(true);
    });
    //Need to unsubscribe when component unmount to prevent memory leaks
    return () => subscription.unsubscribe();
  }, []);
  return { user, resolved };
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, resolved } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Nothing to decide until the session is known. Without this the first pass
    // runs with user still null and drops loading, so a signed-in user gets a
    // flash of the sign-in button before INITIAL_SESSION arrives.
    if (!resolved) return;
    if (!user) {
      setProfile(null);
      setLoading(false);
      setError(null);
      return;
    }
    let ignore = false;
    setLoading(true);
    setError(null);
    getOrCreateProfile(user.id)
      .then((p) => {
        if (ignore) return;
        setProfile(p);
        setLoading(false);
      })
      .catch((err) => {
        if (ignore) return;
        console.error("Problem loading profile:", err);
        setError(errorMessage(err, "Problem loading profile"));
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [user, resolved]);

  async function refetchProfile() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const p = await getOrCreateProfile(user.id);
      setProfile(p);
    } catch (err) {
      console.error("Problem loading profile:", err);
      setError(errorMessage(err, "Problem loading profile"));
    } finally {
      setLoading(false);
    }
  }

  const value = { user, profile, loading, error, refetchProfile };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, profile, loading, error, refetchProfile } = useAuth();

  if (loading)
    return (
      <div>
        <p>Loading...</p>
      </div>
    );
  if (!user)
    return (
      <div>
        <button onClick={() => signInWithGoogle()}>Sign in with Google</button>
      </div>
    );
  if (error)
    return (
      <div>
        <p>{error}</p>
        <button onClick={() => refetchProfile()}>Retry</button>
      </div>
    );
  if (!profile?.displayName) return <NamePrompt />;
  return <>{children}</>;
}
