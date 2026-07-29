import { supabase } from "../lib/supabase";
import { parseOneOf } from "../lib/parse";
import type { Tables } from "../types/database.types";

type ProfileRow = Tables<"profiles">;

// Mirrors the check constraint on profiles.role. The array drives the type, so
// adding a role here is the only edit needed to accept it.
export const roles = ["player", "dm"] as const;
export type Role = (typeof roles)[number];

// camelCase like Item/Location/Recap, so a consumer can tell from the shape
// which side of the boundary it's holding. created_at is dropped rather than
// carried: nothing renders it, and the row type still has it if that changes.
export interface Profile {
  id: string;
  displayName: string | null;
  role: Role;
}

// The DB types `role` as plain `text`, but the app only ever expects a Role.
// Narrow it at the boundary rather than trusting the string — an unexpected
// value fails loud here instead of flowing through as a bogus role, which is
// the one narrowing that decides what a DM can do.
function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    role: parseOneOf(row.role, roles, "role", `Profile ${row.id}`),
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
