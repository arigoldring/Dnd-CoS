import { supabase } from "../lib/supabase";
export interface Profile {
  id: string;
  display_name: string | null;
  created_at: string;
  role: "dm" | "player";
}

export async function getOrCreateProfile(userId: string): Promise<Profile> {
  const { data: existing, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (existing) return existing;

  // Two calls can race here (e.g. onAuthStateChange firing twice, or two tabs).
  // ignoreDuplicates makes a losing insert no-op instead of throwing a unique-constraint error.
  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();

  if (insertError) throw insertError;
  if (created) return created;

  // Lost the race — another call already created the row, so fetch it.
  const { data: winner, error: refetchError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (refetchError) throw refetchError;
  return winner;
}
