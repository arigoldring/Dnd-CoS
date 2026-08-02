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
 * list, not something filtered here. "read campaigns you can see" (013) answers
 * this per user: a DM gets every campaign, a player gets only the ones
 * campaign_members joins them to. Hence no .eq() below; adding one would
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
 * A function call rather than an insert because two rows have to land together:
 * the campaign, and the campaign_members row that makes its creator the DM of
 * it. From the client those are two round trips, and the second one can fail —
 * leaving a campaign nobody is a member of, which nothing in the app can then
 * open. Inside create_campaign (014) they share one transaction.
 *
 * DM only, but not by the insert policy: the function is security definer, so
 * it runs past RLS. Its own `if not is_dm()` gate is what stops a player.
 *
 * The key below is spelled the way 014 spells its parameter, campaign_name, and
 * has to be — these object keys become named SQL arguments, so a mismatch isn't
 * a type error, it's "function does not exist" at runtime.
 */
export async function createCampaign(name: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_campaign", {
    campaign_name: name.trim(),
  });
  // Where the is_dm() gate arrives: a raise exception comes back as an ordinary
  // Postgres error carrying 014's message, not as a separate refused branch.
  if (error) throw error;
  // The bare id, not a row and not a row array — the function returns uuid, so
  // this is already the string. A caller wanting the rest re-reads the table.
  return data;
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
