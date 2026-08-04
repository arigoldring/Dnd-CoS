import { supabase } from "../lib/supabase";
import type { Tables } from "../types/database.types";

/**
 * Same split as locations.ts: the *Row type is exactly what Supabase returns,
 * Recap is how the rest of the app sees a session write-up.
 *
 * What the split earns here is the byline. A recap stores last_edited_by as a
 * uuid, which is useless to a component — so the query embeds the editor's
 * profile and the mapper flattens it to a plain name. Everything downstream
 * gets a string, never a foreign key it would have to resolve itself.
 */

// Every query uses this same shape so a recap is the same object no matter
// which function produced it — a save returns exactly what a fetch would.
// The embed is what makes the byline possible, and it only works because
// 007_recaps.sql widened the profiles SELECT policy: RLS applies to embedded
// joins too, so without that policy display_name comes back null for everyone
// except yourself, with no error to explain why.
const RECAP_SELECT = "*, editor:last_edited_by(display_name)";

// Postgres SQLSTATE for a unique violation — here, two recaps in one campaign
// claiming the same session number. Per campaign since 015: the constraint is
// on the pair, so every campaign gets its own Session 1.
const UNIQUE_VIOLATION = "23505";

// The row as RECAP_SELECT returns it: the table's own columns plus the
// embedded editor. `editor` is a single object (or null), not an array,
// because session_recaps is the side holding the FK — a recap has one editor.
// The key is `editor` rather than `profiles` because the select aliases it;
// embedding through the FK column name also means a second FK to profiles
// later wouldn't make this ambiguous.
type RecapRow = Tables<"session_recaps"> & {
  editor: Pick<Tables<"profiles">, "display_name"> | null;
};

export interface Recap {
  id: string;
  sessionNumber: number;
  // The DM's custom title, or null for "just call it by its number".
  title: string | null;
  // What to actually render. Derived on every read rather than stored, so a
  // recap with no title keeps tracking its session number instead of freezing
  // a string at insert time.
  displayTitle: string;
  body: string;
  // null means nobody has edited this since the DM created it.
  lastEditedAt: string | null;
  lastEditedByName: string | null;
}

function toRecap(row: RecapRow): Recap {
  return {
    id: row.id,
    sessionNumber: row.session_number,
    title: row.title,
    displayTitle: row.title ?? `Session ${row.session_number}`,
    body: row.body,
    lastEditedAt: row.last_edited_at,
    lastEditedByName: row.editor?.display_name ?? null,
  };
}

// A blank title is not an empty title — it's the DM declining to name the
// session, which the schema spells `null` so displayTitle can fall back to the
// number. Sending "" instead would store a real title that renders as nothing.
function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// Newest session first. Ordering by session_number rather than created_at so a
// backfilled older session sorts by which session it *was*, not when it was
// typed up.
//
// Scoped by campaignId, the getInvites case rather than the getCampaigns one:
// 016's is_campaign_member policy answers "may this viewer see this row", and a
// DM in two campaigns passes it for both — so an unfiltered read would merge two
// session logs onto one page. The filter is what narrows "every campaign I'm in"
// down to "the one I'm looking at". RLS is still the security boundary; this is
// only about which campaign's rows the page wants.
export async function getRecaps(campaignId: string): Promise<Recap[]> {
  const { data, error } = await supabase
    .from("session_recaps")
    .select(RECAP_SELECT)
    .eq("campaign_id", campaignId)
    .order("session_number", { ascending: false });

  if (error) {
    console.error(error);
    throw error;
  }

  return data.map(toRecap);
}

// DM only, enforced by the "dms create recaps" policy. session_number is the
// DM's to choose; last_edited_by/at are deliberately not sent — they stay null
// until someone actually edits, which is what makes "no edits yet" meaningful.
//
// campaignId leads, like the id on updateRecap and deleteRecap: it says which
// row this is about before it says what the row contains. It is a parameter
// rather than something derived here because this file has no idea which
// campaign the DM is looking at — only the page under /campaign/:campaignId
// does, and it is the one that passes it.
//
// It has to be sent explicitly, and there is no fallback if it isn't. 015 added
// campaign_id as NOT NULL and nothing fills it in: the stamp_session_recap
// trigger (007, rewritten by 016) is BEFORE UPDATE, so it pins campaign_id
// against an edit but never sees an insert. An insert without this column is a
// null violation, not a row landing in some default campaign.
export async function createRecap(
  campaignId: string,
  sessionNumber: number,
  title: string,
  body: string,
): Promise<Recap> {
  const { data, error } = await supabase
    .from("session_recaps")
    .insert({
      campaign_id: campaignId,
      session_number: sessionNumber,
      title: blankToNull(title),
      body: body.trim(),
    })
    .select(RECAP_SELECT)
    .single();

  if (error) {
    console.error(error);
    // The unique constraint on (campaign_id, session_number) is doing its job
    // here; it just says so as 'duplicate key value violates unique
    // constraint "..."'.
    if (error.code === UNIQUE_VIOLATION) {
      throw new Error(`Session ${sessionNumber} already exists`);
    }
    throw error;
  }

  return toRecap(data);
}

// Open to every authenticated player — the campaign log belongs to the table,
// not to whoever typed it first.
//
// Only title and body are sent, and that's not merely politeness: the trigger
// in 007 pins id, session_number and created_at back to their old values on
// every UPDATE, and overwrites last_edited_by from the JWT. RLS can't restrict
// columns, so that trigger — not the `using (true)` policy — is what keeps an
// open edit permission from meaning "rewrite any field you like".
export async function updateRecap(
  id: string,
  title: string,
  body: string,
): Promise<Recap> {
  const { data, error } = await supabase
    .from("session_recaps")
    .update({ title: blankToNull(title), body: body.trim() })
    .eq("id", id)
    .select(RECAP_SELECT)
    .maybeSingle();

  if (error) {
    console.error(error);
    throw error;
  }
  // An update that matches no rows is not an error — it comes back clean and
  // empty. Since every player passes this table's UPDATE policy, the realistic
  // cause is the row being deleted while someone had it open in the editor.
  if (!data) {
    throw new Error("That recap no longer exists — it may have been deleted");
  }

  return toRecap(data);
}

// DM only. Unlike a blocked INSERT (which Postgres rejects outright), a DELETE
// that RLS forbids simply matches nothing and returns success — so a player
// calling this directly would otherwise see the row vanish from the page while
// it sat untouched in the database. Hence .select() and the empty check.
export async function deleteRecap(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("session_recaps")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(error);
    throw error;
  }
  if (!data) throw new Error("You do not have permission to delete this recap");
}
