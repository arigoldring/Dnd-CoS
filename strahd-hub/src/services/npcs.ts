import { supabase } from "../lib/supabase";
import type { QueryData } from "@supabase/supabase-js";
import type { TablesUpdate } from "../types/database.types";

/**
 * Two types, same split as locations.ts:
 *  - NpcRow is exactly what Supabase returns, derived from the query itself so
 *    there is no hand-written shape to drift out of sync with the schema.
 *  - Npc is how the rest of the app sees an NPC: camelCase, with both joins
 *    flattened onto the object.
 *
 * The split earns its keep here twice over — the column names change case, and
 * two embedded tables collapse into two plain fields.
 */

// One embedded select rather than three round trips. The location is a
// many-to-one through the composite key, so it comes back as one object or
// null; the notes are one-to-one on npc_dm_notes' primary key, so they come
// back the same way.
//
// The foreign key is named explicitly. There is only one between these two
// tables today, so PostgREST would resolve it either way — but it spans two
// columns, and naming it is how the next reader learns that the join carries
// the campaign along with the location rather than matching on location alone.
const NPC_SELECT = `
  id,
  name,
  description,
  location_id,
  portrait_key,
  is_revealed,
  locations!npcs_campaign_id_location_id_fkey ( name ),
  npc_dm_notes ( notes )
`;

// Scoped by campaign for the reason locations.ts gives: is_campaign_member
// answers "may this viewer see this row", and a DM who runs two campaigns
// passes it for both, so an unfiltered read would merge two rosters into one
// list. RLS decides what may be seen; the filter decides what was asked for.
function npcQuery(campaignId: string) {
  return supabase
    .from("npcs")
    .select(NPC_SELECT)
    .eq("campaign_id", campaignId)
    .order("name");
}

type NpcRow = QueryData<ReturnType<typeof npcQuery>>[number];

export interface Npc {
  id: string;
  name: string;
  description: string | null;
  locationId: string | null;
  // Denormalised out of the join for display. Null covers both "this NPC has no
  // known home" and "the home is a location this viewer cannot see" — the same
  // absence either way, and nothing on the page needs to tell them apart.
  locationName: string | null;
  portraitKey: string | null;
  isRevealed: boolean;
  // Present only for DMs, and only where a note has actually been written.
  // Missing notes are the normal case rather than an error, so this is optional
  // and never a throw.
  dmNotes?: string;
}

function toNpc(row: NpcRow): Npc {
  const npc: Npc = {
    id: row.id,
    name: row.name,
    description: row.description,
    locationId: row.location_id,
    locationName: row.locations?.name ?? null,
    portraitKey: row.portrait_key,
    isRevealed: row.is_revealed,
  };
  // Only attached when a note exists, so the key is genuinely ABSENT otherwise
  // rather than present-but-undefined. That keeps the object honest to the
  // optional type: `"dmNotes" in npc`, key iteration and JSON.stringify all
  // agree there is no note.
  const notes = row.npc_dm_notes?.notes;
  if (notes !== undefined) npc.dmNotes = notes;
  return npc;
}

// No isDm branch anywhere in here. RLS has already decided what comes back:
// players get revealed NPCs and no notes at all, the campaign's DM gets
// everything. The client stays dumb and renders the response.
export async function getNpcs(campaignId: string): Promise<Npc[]> {
  const { data, error } = await npcQuery(campaignId);

  if (error) {
    console.error(error);
    throw error;
  }

  return data.map(toNpc);
}

// Exactly the columns the update trigger leaves writable. id, campaign_id,
// created_at and portrait_key are pinned to their old values in the database,
// so a patch naming one of them would be accepted, silently discarded, and
// reported as a success. The type refuses it instead.
export type NpcEdit = Pick<
  TablesUpdate<"npcs">,
  "name" | "description" | "location_id" | "is_revealed"
>;

/**
 * Save one or more editable fields. The DM-only rule lives in RLS, not in a
 * role check here.
 *
 * Returns what the database stored rather than what was sent: the trigger trims
 * the name on the way in, so those two are not always the same string.
 */
export async function updateNpc(id: string, fields: NpcEdit): Promise<Npc> {
  const { data, error } = await supabase
    .from("npcs")
    .update(fields)
    .eq("id", id)
    .select(NPC_SELECT)
    .maybeSingle();

  if (error) {
    console.error(error);
    throw error;
  }
  // An update RLS blocked is not an error — it matches no rows and comes back
  // clean. Without this the caller would treat a silently discarded save as a
  // success and leave the unsaved draft on screen as if it had stuck.
  if (!data) {
    throw new Error("You do not have permission to edit this NPC");
  }

  return toNpc(data);
}

// Trimmed, and an all-whitespace description stored as null rather than as a
// string of spaces — the page renders null as "No description yet", and a blank
// string would render as nothing at all with no sign anything was wrong.
export async function updateNpcDescription(
  id: string,
  description: string,
): Promise<Npc> {
  const trimmed = description.trim();
  return updateNpc(id, { description: trimmed === "" ? null : trimmed });
}

/**
 * Write the DM's private notes.
 *
 * An upsert because the first save on an NPC lands in an empty table and every
 * save after it updates a row — one button, two statements, which is why the
 * policies cover INSERT and UPDATE separately. npc_id is the primary key, so
 * the default conflict target is the right one.
 *
 * An empty string is stored as an empty string. There is no sentinel for "no
 * notes" to recognise, and clearing a note is a save like any other.
 */
export async function saveNpcDmNotes(
  npcId: string,
  notes: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("npc_dm_notes")
    .upsert({ npc_id: npcId, notes })
    .select("notes")
    .maybeSingle();

  if (error) {
    console.error(error);
    throw error;
  }
  if (!data) {
    throw new Error("You do not have permission to edit these notes");
  }

  return data.notes;
}
