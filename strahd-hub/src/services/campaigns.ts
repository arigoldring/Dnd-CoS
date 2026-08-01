import { supabase } from "../lib/supabase";
import type { Tables } from "../types/database.types";

type CampaignRow = Tables<"campaigns">;

// camelCase like Profile and Item, so a consumer can tell from the shape which
// side of the boundary it's holding. created_at is dropped rather than carried:
// nothing renders it — it exists to order the list, and that happens in SQL.
export interface Campaign {
  id: string;
  name: string;
}

function toCampaign(row: CampaignRow): Campaign {
  return { id: row.id, name: row.name };
}

/**
 * Every campaign the signed-in user can see — which is already the membership
 * list, not something filtered here. "read campaigns you can see" (010) answers
 * this per user: a DM gets every campaign, a player gets only the ones
 * campaign_players joins them to. Hence no .eq() below; adding one would
 * restate the policy in the one place that can't enforce it.
 *
 * Ordered so the picker's list doesn't reshuffle between loads — Postgres makes
 * no promise about row order without it.
 */
export async function getCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at");
  if (error) throw error;
  return data.map(toCampaign);
}

/**
 * DM only, enforced by "dm inserts campaigns" (010) rather than by a role check
 * here — the UI hides the button, but this is what actually stops a player.
 *
 * .select().single() is what makes the insert hand back the row it wrote, and
 * that row is the whole point: the caller navigates straight into the campaign
 * it just created, which it can't do without the id Postgres generated.
 */
export async function createCampaign(name: string): Promise<Campaign> {
  const { data, error } = await supabase
    .from("campaigns")
    .insert({ name: name.trim() })
    .select("*")
    .single();
  if (error) throw error;
  return toCampaign(data);
}

/**
 * DM only, enforced by "dms update campaigns" (012). Like every other mutation
 * here, no role check in this file — the hidden button is a courtesy, the
 * policy is the rule.
 *
 * Returns the saved row so the caller updates from what the database actually
 * stored rather than from its own draft.
 */
export async function updateCampaignName(
  id: string,
  name: string,
): Promise<Campaign> {
  const { data, error } = await supabase
    .from("campaigns")
    .update({ name: name.trim() })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  // maybeSingle, not single: an update RLS blocked is not an error — it matches
  // no rows and comes back clean, and single() would report that as a confusing
  // "0 rows" failure. Both causes end here — a player who called this anyway,
  // or a campaign deleted while the DM had the form open — because from the
  // client they are the same empty response.
  if (!data) {
    throw new Error(
      "That campaign could not be renamed — it may have been deleted, or you may not have permission",
    );
  }
  return toCampaign(data);
}
