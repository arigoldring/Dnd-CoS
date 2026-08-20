import { supabase } from "../lib/supabase";
import type { Denomination } from "./characters";

export type { Denomination };

/**
 * The shape a purse is in wherever one appears: a character's own (part of
 * Character, in characters.ts, since it rides along on that row) and the
 * party's shared pool (this file, since party_currency is its own table).
 * Same five columns as 045 put on both.
 */
export interface Purse {
  copper: number;
  silver: number;
  electrum: number;
  gold: number;
  platinum: number;
}

// Exported for callers that soft-fetch this (Home.tsx's dashboard band, the
// same treatment `party` already gets there) and need a default before the
// first read lands or if it fails — an empty purse, not a loading state.
export const EMPTY_PURSE: Purse = { copper: 0, silver: 0, electrum: 0, gold: 0, platinum: 0 };

// Most to least valuable, the order every purse reads in, and the table
// formatPurse and purseEntries both walk.
const DENOMINATION_UNITS: [Denomination, string][] = [
  ["platinum", "pp"],
  ["gold", "gp"],
  ["electrum", "ep"],
  ["silver", "sp"],
  ["copper", "cp"],
];

export interface PurseEntry {
  denomination: Denomination;
  amount: number;
  unit: string;
}

// Denominations at 0 are left out — a purse of "12 gp" should not also carry
// "0 pp · 0 ep · 0 sp · 0 cp" alongside it. Exported (not just used by
// formatPurse below) for Home.tsx's dashboard, which renders each
// denomination in its own colour rather than one flat string.
export function purseEntries(purse: Purse): PurseEntry[] {
  return DENOMINATION_UNITS.map(([denomination, unit]) => ({
    denomination,
    amount: purse[denomination],
    unit,
  })).filter((entry) => entry.amount > 0);
}

// A wholly empty purse says so in words instead of five zeroes.
export function formatPurse(purse: Purse): string {
  const entries = purseEntries(purse);
  return entries.length === 0
    ? "empty"
    : entries.map(({ amount, unit }) => `${amount} ${unit}`).join(" · ");
}

// The fixed 5e rates KNOWN_ISSUES.md's currency entry already names as the
// numbers a real convert_currency RPC would use (1 sp = 10 cp, 1 ep = 5 sp,
// 1 gp = 2 ep, 1 pp = 10 gp) — reused here for a display-only total, not a
// stored conversion. Nothing about the purse's five columns changes.
const COPPER_PER_UNIT: Record<Denomination, number> = {
  copper: 1,
  silver: 10,
  electrum: 50,
  gold: 100,
  platinum: 1000,
};

// The purse's worth as one number, in gold pieces. Summed in copper — an
// integer — rather than in gold-piece fractions, so the division to gold
// happens once at the end instead of accumulating float error over five
// additions.
export function goldValue(purse: Purse): number {
  const totalCopper = (Object.keys(COPPER_PER_UNIT) as Denomination[]).reduce(
    (sum, denomination) => sum + purse[denomination] * COPPER_PER_UNIT[denomination],
    0,
  );
  return totalCopper / 100;
}

// A purse's gold value is always a whole number of copper, i.e. a multiple of
// 0.01 gp, so two decimal places always represent it exactly; trimmed so "12
// gp" reads as "12 gp" rather than "12.00 gp".
export function formatGoldValue(purse: Purse): string {
  const trimmed = goldValue(purse).toFixed(2).replace(/\.?0+$/, "");
  return `${trimmed} gp`;
}

// campaignId is a parameter and the read is filtered by it for getRecaps'
// reason, not RLS's: 045's SELECT policy on party_currency is
// is_campaign_member, and a DM of two campaigns passes it for both rows —
// .eq() is what narrows "every campaign I'm in" down to the one on screen.
//
// maybeSingle rather than single: every campaign gets its row from
// create_campaign or 045's backfill, but defaulting to an empty purse here
// costs nothing and means a page reading this never has to branch on "no row
// yet" as a state distinct from "nothing in the pool".
export async function getPartyCurrency(campaignId: string): Promise<Purse> {
  const { data, error } = await supabase
    .from("party_currency")
    .select("copper, silver, electrum, gold, platinum")
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) {
    console.error(error);
    throw error;
  }

  return data ?? EMPTY_PURSE;
}

// adjustCharacterCurrency's twin over the shared pool. Every campaign member
// may call this — 045's "members update party currency" policy has no DM
// carve-out, matching party_inventory's own add/remove policies — so a DM
// giving the party gold and a player chipping in are the same call.
export async function adjustPartyCurrency(
  campaignId: string,
  denomination: Denomination,
  delta: number,
): Promise<number> {
  const { data, error } = await supabase.rpc("adjust_party_currency", {
    target_campaign: campaignId,
    denomination,
    delta,
  });

  if (error) {
    console.error(error);
    throw error;
  }
  if (data === null) {
    throw new Error(`Not enough ${denomination} in the party's hoard`);
  }

  return data;
}
