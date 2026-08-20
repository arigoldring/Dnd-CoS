import { supabase } from "../lib/supabase";
import type { Tables } from "../types/database.types";

// Same two-type split as locations.ts: MapRevealRow is exactly what Supabase
// returns; MapReveal is how the rest of the app talks about one row.
type MapRevealRow = Tables<"campaign_map_reveals">;

export interface MapReveal {
  mapKey: string;
  isRevealed: boolean;
}

// Scoped to campaignId for the reason locations.ts gives getLocations: RLS
// decides what may be seen, this filter decides what was asked for -- a DM in
// two campaigns passes membership for both, so an unfiltered read would merge
// both campaigns' reveal rows into one map shelf.
export async function getMapReveals(campaignId: string): Promise<MapReveal[]> {
  const { data, error } = await supabase
    .from("campaign_map_reveals")
    .select("*")
    .eq("campaign_id", campaignId);

  if (error) {
    console.error(error);
    throw error;
  }

  const rows: MapRevealRow[] = data;
  return rows.map((row) => ({
    mapKey: row.map_key,
    isRevealed: row.is_revealed,
  }));
}

// No onConflict: the composite primary key (campaign_id, map_key) is already
// the default conflict target, the same reliance saveNpcDmNotes documents.
// Not ignoreDuplicates -- unlike addFeatToCharacter, a re-toggle must actually
// change the stored value, which is why 042 ships the UPDATE policy this
// depends on.
export async function updateMapReveal(
  campaignId: string,
  mapKey: string,
  isRevealed: boolean,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("campaign_map_reveals")
    .upsert({ campaign_id: campaignId, map_key: mapKey, is_revealed: isRevealed })
    .select("is_revealed")
    .maybeSingle();

  if (error) {
    console.error(error);
    throw error;
  }
  // No row back means RLS refused the write, not that nothing changed --
  // updateLocationVisibility's reasoning, unchanged.
  if (!data) {
    throw new Error("You do not have permission to change map visibility");
  }

  return data.is_revealed;
}
