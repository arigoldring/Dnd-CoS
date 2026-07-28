import { supabase } from "../lib/supabase";
import type { Tables } from "../types/database.types";

/**
 * Two types on purpose, same split as items.ts:
 *  - the *Row types are exactly what Supabase returns (generated from the DB
 *    schema, so no hand-written cast to keep in sync).
 *  - Location is how the rest of the app sees a location: the two tables
 *    (locations + location_dm_notes) merged into one object.
 *
 * The merge is the whole reason the split earns its keep here — we're
 * folding a second table's row into the first as an optional field.
 */
type LocationRow = Tables<"locations">;
type LocationNoteRow = Tables<"location_dm_notes">;

export interface Location {
  id: string;
  name: string;
  x: number;
  y: number;
  description: string | null;
  isRevealed: boolean;
  // Present only for DMs, and only for locations that actually have a note.
  // Missing notes are the normal case, not an error — so this is optional,
  // never a requireField throw.
  dmNotes?: string;
}

// Fetch locations and DM notes, then merge notes onto their location.
//
// Note that we do NOT branch on isDm here. RLS already decides what each
// caller can see:
//   - locations: players get revealed rows only; DMs get all rows.
//   - location_dm_notes: players get zero rows; DMs get all of them.
// So we can query both unconditionally and merge whatever comes back. The
// database is the single source of "who's allowed"; the client stays dumb.
export async function getLocations(): Promise<Location[]> {
  const [locationsResult, notesResult] = await Promise.all([
    supabase.from("locations").select("*"),
    supabase.from("location_dm_notes").select("*"),
  ]);

  if (locationsResult.error) {
    console.error(locationsResult.error);
    throw locationsResult.error;
  }
  if (notesResult.error) {
    console.error(notesResult.error);
    throw notesResult.error;
  }

  const rows: LocationRow[] = locationsResult.data;
  const noteRows: LocationNoteRow[] = notesResult.data;

  // Index notes by location_id so the merge is a lookup, not a nested scan.
  // For a player this map is empty (RLS returned no note rows), so every
  // location simply comes back without dmNotes — the left-join, missing-is-fine
  // shape, not a throw.
  const notesById = new Map(noteRows.map((n) => [n.location_id, n.notes]));

  return rows.map((row) => {
    const location: Location = {
      id: row.id,
      name: row.name,
      x: row.x,
      y: row.y,
      description: row.description,
      isRevealed: row.is_revealed,
    };
    // Only attach dmNotes when a note actually exists, so the key is genuinely
    // ABSENT otherwise — never present-but-undefined. That keeps the object
    // honest to the optional type: `"dmNotes" in loc`, key iteration, and
    // JSON.stringify all agree there's no note, instead of carrying an
    // explicit dmNotes:undefined on every location.
    const notes = notesById.get(row.id);
    if (notes !== undefined) location.dmNotes = notes;
    return location;
  });
}

// Edit the player-facing description. Same division of labour as the reads:
// the DM-only rule lives in RLS ("dms update locations" in 006_location_edit),
// not in a role check here.
//
// Returns the saved value so the caller updates from what the DB actually
// stored rather than from its own draft.
export async function updateLocationDescription(
  id: string,
  description: string,
): Promise<string | null> {
  const trimmed = description.trim();

  const { data, error } = await supabase
    .from("locations")
    .update({ description: trimmed === "" ? null : trimmed })
    .eq("id", id)
    .select("description")
    .maybeSingle();

  if (error) {
    console.error(error);
    throw error;
  }
  // An update RLS blocked is not an error — it simply matches no rows and
  // comes back clean. Without this the caller would treat a silently discarded
  // save as a success and show the unsaved draft as if it had stuck.
  if (!data) {
    throw new Error("You do not have permission to edit this location");
  }

  return data.description;
}
