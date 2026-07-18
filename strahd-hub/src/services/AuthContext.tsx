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

export interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    let ignore = false;
    setLoading(true);
    getOrCreateProfile(user.id)
      .then((p) => {
        if (!ignore) setProfile(p);
      })
      .catch((error) => {
        if (!ignore) console.error("Problem loading profile:", error.message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [user]);

  const value = { user, profile, loading };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
