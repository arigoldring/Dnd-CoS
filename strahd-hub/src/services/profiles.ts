import { supabase } from "../lib/supabase";
import type { Tables } from "../types/database.types";

type ProfileRow = Tables<"profiles">;

export interface Profile {
  id: string;
  display_name: string | null;
  created_at: string;
  role: "dm" | "player";
}

// The DB types `role` as plain `text` (string), but the app only ever expects
// 'dm' or 'player'. Narrow it at the boundary instead of trusting the string —
// same idea as items.ts's parseOneOf. An unexpected value fails loud here
// rather than silently flowing through as a bogus role.
function toProfile(row: ProfileRow): Profile {
  if (row.role !== "dm" && row.role !== "player") {
    throw new Error(`Profile ${row.id}: invalid role "${row.role}"`);
  }
  return {
    id: row.id,
    display_name: row.display_name,
    created_at: row.created_at,
    role: row.role,
  };
}

export async function getOrCreateProfile(userId: string): Promise<Profile> {
  const { data: existing, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (existing) return toProfile(existing);

  // Two calls can race here (e.g. onAuthStateChange firing twice, or two tabs).
  // ignoreDuplicates makes a losing insert no-op instead of throwing a unique-constraint error.
  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();

  if (insertError) throw insertError;
  if (created) return toProfile(created);

  // Lost the race — another call already created the row, so fetch it.
  const { data: winner, error: refetchError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (refetchError) throw refetchError;
  return toProfile(winner);
}

export async function setDisplayName(newDisplayName: string): Promise<void> {
  const { error } = await supabase.rpc("set_display_name", {
    new_display_name: newDisplayName,
  });
  if (error) throw error;
}
