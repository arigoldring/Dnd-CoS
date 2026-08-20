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
  // The purse. Rides along on every character read — Character.tsx, Party.tsx
  // and getPartyCharacters below all get it for free, the same way an entry's
  // price rides along on an item read.
  copper: number;
  silver: number;
  electrum: number;
  gold: number;
  platinum: number;
}

// 045's five columns, in the order every purse reads in (most to least
// valuable). Shared with party_currency, whose row has the same five columns
// under a different key — see services/currency.ts.
export type Denomination = "copper" | "silver" | "electrum" | "gold" | "platinum";

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
    copper: row.copper,
    silver: row.silver,
    electrum: row.electrum,
    gold: row.gold,
    platinum: row.platinum,
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

// Adds (positive delta) or spends (negative delta) one denomination in this
// character's purse. 045's adjust_character_currency does the read, the floor
// check and the write as one locked statement, so this is never a
// read-modify-write — the client never computes the new balance itself.
//
// Owner-only, the same line renameCharacter and deleteCharacter draw: the RPC
// runs SECURITY INVOKER against "owner updates own character", so there is no
// DM path onto a character's purse, unlike character_inventory.
//
// A null result covers two cases the RPC can't tell apart — an overdraw, and
// a target_character that isn't yours — the same ambiguity renameCharacter's
// zero-row check already lives with.
export async function adjustCharacterCurrency(
  characterId: string,
  denomination: Denomination,
  delta: number,
): Promise<number> {
  const { data, error } = await supabase.rpc("adjust_character_currency", {
    target_character: characterId,
    denomination,
    delta,
  });

  if (error) {
    console.error(error);
    throw error;
  }
  if (data === null) {
    throw new Error(
      delta < 0
        ? `Not enough ${denomination} in that purse`
        : "That character isn't yours to add to",
    );
  }

  return data;
}

// ---------------------------------------------------------------------------
// the party
// ---------------------------------------------------------------------------

// The gear travels with the character rather than in a second query per row:
// 028's SELECT policy on character_inventory is "can you see the character",
// which every member passes, so one request carries the whole table's worth.
// 037's SELECT policy on character_spells is the same predicate, so the spells
// ride along on the same request for free — a third embed, not a third round
// trip.
// One literal, not two concatenated: supabase-js parses this string at the type
// level to work out the row shape, and `"a" + "b"` widens to plain string, which
// costs the whole query its type.
const PARTY_SELECT =
  "*, character_inventory(quantity, items(name), addedBy:added_by(display_name)), character_spells(spells(name, level))";

export interface PartyCharacterItem {
  name: string;
  quantity: number;
  addedByName: string | null;
}

// Two columns, where the gear's embed takes one: a spell is read by level
// everywhere in this app, so the level is not decoration here — it is what the
// panel groups by. No entryId, deliberately: this page adds spells and never
// removes them, so nothing here needs the character_spells row id. The sheet is
// where a spell comes off a character, and it has CharacterSpellEntry for that.
export interface PartyCharacterSpell {
  name: string;
  level: number;
}

export interface PartyCharacter extends Character {
  // Null for addedByName's reason, plus one this type has of its own: a deleted
  // profile leaves the character behind, and (see getPartyCharacters) the names
  // arrive from a separate read that a stale row can simply be missing from.
  playerName: string | null;
  items: PartyCharacterItem[];
  stacks: number;
  carried: number;
  // Already sorted by level then name, the order every caller wants — unlike
  // items, which the page groups no further than the sort below. No `known`
  // count beside it: stacks and carried exist because they count different
  // things than items.length does, and a spell total would be exactly
  // spells.length under another name.
  spells: PartyCharacterSpell[];
}

// Typed the way the sibling files do it — a row intersection naming the embeds
// — rather than reaching for `any`. items is single and non-null (a NOT NULL
// item_id); addedBy is single but nullable, `on delete set null` again.
type PartyCharacterRow = Tables<"characters"> & {
  character_inventory: {
    quantity: number;
    items: Pick<Tables<"items">, "name">;
    addedBy: Pick<Tables<"profiles">, "display_name"> | null;
  }[];
  // spells is single and non-null for items' reason — a NOT NULL spell_id and
  // 037's FK. The one way it could read back null is the caveat 037 names: a
  // homebrew spell belonging to another campaign, filtered out by 022's SELECT
  // policy on the embed while its character_spells row still resolves. Not
  // reachable while spells has no INSERT policy, and typed the way
  // CHARACTER_SPELLS_SELECT types the same embed rather than being the one
  // place that guards against it.
  character_spells: {
    spells: Pick<Tables<"spells">, "name" | "level">;
  }[];
};

// The whole table's worth of one campaign, which getCharacter deliberately
// refuses to be: that one is "mine" and uses maybeSingle. Here the list IS the
// answer.
//
// Two round trips, not one, and the reason is a foreign key that doesn't exist.
// The obvious embed — `player:user_id(display_name)` — needs a FK from
// characters.user_id to profiles.id to resolve, and 028 gave the table a
// COMPOSITE FK to campaign_members (campaign_id, user_id) instead, so PostgREST
// has no single-column relationship to follow. The path that does exist,
// characters -> campaign_members -> profiles, is worse than useless here: 013's
// SELECT policy on campaign_members is `user_id = auth.uid()`, and RLS applies
// to embedded joins, so it would return a name for exactly one character —
// yours — and null for everyone else's.
//
// So the names come from profiles directly, which the "authenticated read
// profiles" policy in 007 opens to any signed-in reader — the same policy
// CHARACTER_INVENTORY_SELECT leans on to flatten added_by. Still two requests
// for any size of party rather than the N+1 an embed was avoiding.
export async function getPartyCharacters(
  campaignId: string,
): Promise<PartyCharacter[]> {
  const { data, error } = await supabase
    .from("characters")
    .select(PARTY_SELECT)
    .eq("campaign_id", campaignId)
    .order("name");

  if (error) {
    console.error(error);
    throw error;
  }

  const rows = data as PartyCharacterRow[];
  const names = await getPlayerNames(rows.map((row) => row.user_id));

  return rows.map((row) => {
    const items = row.character_inventory
      .map((entry) => ({
        name: entry.items.name,
        quantity: entry.quantity,
        addedByName: entry.addedBy?.display_name ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Level first, then name — the order a spell list is read in, and the one
    // the panel's group headers depend on being stable.
    const spells = row.character_spells
      .map((entry) => ({
        name: entry.spells.name,
        level: entry.spells.level,
      }))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

    return {
      ...toCharacter(row),
      playerName: names.get(row.user_id) ?? null,
      items,
      spells,
      stacks: items.length,
      // The count the dashboard band leads with: stacks is how many kinds of
      // thing, this is how many things.
      carried: items.reduce((sum, item) => sum + item.quantity, 0),
    };
  });
}

// Display names for a set of owners, as a lookup keyed by user id. Skips the
// request entirely for an empty party rather than sending `in.()`, and returns
// a Map so the caller's per-row lookup stays a hash rather than a scan.
async function getPlayerNames(
  userIds: string[],
): Promise<Map<string, string | null>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", unique);

  if (error) {
    console.error(error);
    throw error;
  }

  return new Map(data.map((row) => [row.id, row.display_name]));
}
