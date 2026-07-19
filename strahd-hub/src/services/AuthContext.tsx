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
import { NamePrompt } from "../assets/components/NamePrompt";
import { signInWithGoogle } from "./auth";

export interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  refetchProfile: () => Promise<void>;
  //refetchProfile is a property that contains a function *(its value is a function)
  //Will be used to force a re-read of the profile after mutating it
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
  return user;
}
// Fetches (or creates) a profile. Rejects on failure — callers decide how
// to log/surface the error.
async function loadProfile(userId: string): Promise<Profile> {
  return getOrCreateProfile(userId);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      setError(null);
      return;
    }
    let ignore = false;
    setLoading(true);
    setError(null);
    loadProfile(user.id)
      .then((p) => {
        if (ignore) return;
        setProfile(p);
        setLoading(false);
      })
      .catch((err) => {
        if (ignore) return;
        console.error("Problem loading profile:", err);
        setError(
          err instanceof Error ? err.message : "Problem loading profile",
        );
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [user]);

  async function refetchProfile() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const p = await loadProfile(user.id);
      setProfile(p);
    } catch (err) {
      console.error("Problem loading profile:", err);
      setError(err instanceof Error ? err.message : "Problem loading profile");
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
  if (!profile?.display_name) return <NamePrompt />;
  return <>{children}</>;
}
