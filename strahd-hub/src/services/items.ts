import { supabase } from "../lib/supabase";

/**
 * Using 2 interfaces on purpose
 * ItemRow: what the item table from supabase returns
 * Item: How the rest of the application sees an item
 * Biggest Change in the conversation from price in copper to price in gold
 */
interface ItemRow {
  id: string;
  name: string;
  description: string;
  price_cp: number;
  tags: string[];
  created_at: string;
}
export interface Item {
  id: string;
  name: string;
  price: number;
  description: string;
  tags: string[];
}

// `as ItemRow[]` is a promise YOU make about the columns, not a check TS runs.
// Swap for Supabase-generated types later to make this genuinely safe. --> look into this later
// Explicit fields (vs `...row`) intentionally drop price_cp and created_at.
export async function getItems() {
  const { data: items, error: retrievalError } = await supabase
    .from("items")
    .select("*");
  if (retrievalError) {
    console.error(retrievalError);
    throw retrievalError;
  }
  //Returns the row in supabase as an item used in the UI
  return (items as ItemRow[]).map(
    (row): Item => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price: row.price_cp / 100,
      tags: row.tags,
    }),
  );
}
