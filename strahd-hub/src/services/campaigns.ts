import { supabase } from "../lib/supabase";
import type { Tables } from "../types/database.types";

type CampaignRow = Tables<"campaigns">;

export interface Campaign {
  id: string;
  name: string;
}

// same camelCase / drop-created_at convention as toRecap, toProfile
function toCampaign(row: CampaignRow): Campaign {
  return { id: row.id, name: row.name };
}

export async function getCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase.from("campaigns").select("*");
  if (error) throw error;
  return data.map(toCampaign);
}

export async function createCampaign(name: string): Promise<Campaign> {
  const { data, error } = await supabase
    .from("campaigns")
    .insert({ name: name.trim() })
    .select("*") // <- the part setDisplayName doesn't need
    .single(); // <- exactly one row back, not an array
  if (error) throw error;
  return toCampaign(data);
}
