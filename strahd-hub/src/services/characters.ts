import { supabase } from "../lib/supabase";
import type { Tables } from "../types/database.types";

/**
 * A character is one player's PC in one campaign — at most one per player per
 * campaign, enforced by the unique constraint in 028. Same *Row/app-type split
 * as recaps.ts and locations.ts.
 *
 * The permission shape is the thing to keep in mind reading this file: 028
 * makes the characters row the OWNER's alone. Every player in the campaign can
 * read it, but only the owner may rename or delete it — the DM cannot. (The
 * DM's write access is over character_inventory, and lives in the sibling
 * file.) So unlike recaps, where "who may do this" varies per function, every
 * mutation here is owner-only.
 */

export interface Character {
  id: string;
  campaignId: string;
  userId: string;
  name: string;
  createdAt: string;
}

// Two of Postgres' SQLSTATEs surface here as things a user can cause by typing,
// so both get turned into sentences rather than shown raw.
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

function toCharacter(row: Tables<"characters">): Character {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
  };
}

// 028's name check rejects untrimmed input outright (`name = trim(name)`)
// rather than storing the padding, so trimming here is not politeness — it is
// what keeps a stray space from coming back as a check violation. Every write
// path goes through this.
function normalizeName(name: string): string {
  return name.trim();
}

// userId is a parameter, and it has to be, which is worth stating because the
// signature looks redundant next to getRecaps(campaignId).
//
// 028's SELECT policy is is_campaign_member: every player at the table can read
// every character in it, which is deliberate — the party sheet needs it. So
// "the campaign's characters" is a LIST, and filtering by campaign alone would
// hand maybeSingle two rows the moment a second player rolls one up. The user
// filter is what makes this "mine", and RLS can't express that for us because
// RLS is answering a different question.
//
// maybeSingle, not single: having no character yet is the state every new
// member is in and the state a reset passes through. It is a branch the caller
// renders (the create form), not an error.
export async function getCharacter(
  campaignId: string,
  userId: string,
): Promise<Character | null> {
  const { data, error } = await supabase
    .from("characters")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error(error);
    throw error;
  }

  return data ? toCharacter(data) : null;
}

// user_id is sent explicitly rather than defaulted: the column has no default,
// and 028's INSERT policy checks `user_id = auth.uid()`, so a mismatched id is
// an RLS denial rather than a row filed under the wrong player.
export async function createCharacter(
  campaignId: string,
  userId: string,
  name: string,
): Promise<Character> {
  const { data, error } = await supabase
    .from("characters")
    .insert({
      campaign_id: campaignId,
      user_id: userId,
      name: normalizeName(name),
    })
    .select("*")
    .single();

  if (error) {
    console.error(error);
    // The unique constraint on (campaign_id, user_id) doing its job. Reachable
    // in normal use: two tabs open on the create form, or a reset that raced.
    if (error.code === UNIQUE_VIOLATION) {
      throw new Error("You already have a character in this campaign");
    }
    if (error.code === CHECK_VIOLATION) {
      throw new Error("A character name must be 1 to 50 characters");
    }
    throw error;
  }

  return toCharacter(data);
}

// Only `name` is sent, and the pin_character_row trigger is why that is safe
// rather than merely tidy: RLS cannot restrict columns, so without the trigger
// an owner could carry their character into another campaign they belong to —
// `user_id = auth.uid()` passes on both sides of that update. The trigger pins
// id, campaign_id, user_id and created_at, which leaves name as the only field
// an UPDATE can actually change.
export async function renameCharacter(
  id: string,
  name: string,
): Promise<Character> {
  const { data, error } = await supabase
    .from("characters")
    .update({ name: normalizeName(name) })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error(error);
    if (error.code === CHECK_VIOLATION) {
      throw new Error("A character name must be 1 to 50 characters");
    }
    throw error;
  }
  // Zero rows means the UPDATE policy matched nothing. Unlike updateRecap —
  // where every player passes the policy, so an empty result means the row was
  // deleted — here the policy is owner-only, so this covers both "it is gone"
  // and "it was never yours". The message has to admit both.
  if (!data) {
    throw new Error(
      "That character no longer exists, or it isn't yours to rename",
    );
  }

  return toCharacter(data);
}

// The destructive half of "reset": deleting the character cascades to its
// inventory (028's FK), and nothing recovers it. The confirm belongs at the
// call site; this function is the part that cannot ask.
//
// .select().maybeSingle() for deleteRecap's reason: a DELETE that RLS forbids
// matches nothing and returns success, so without the check a non-owner would
// watch the sheet vanish from their screen while the row sat untouched.
export async function deleteCharacter(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("characters")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(error);
    throw error;
  }
  if (!data) {
    throw new Error("That character is not yours to delete");
  }
}
