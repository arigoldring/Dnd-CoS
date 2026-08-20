/**
 * The shape every reveal-gated table shares: a flag the DM flips when the party
 * learns of something, and DM-only notes that RLS leaves absent for players.
 */
interface RevealGated {
  isRevealed: boolean;
  dmNotes?: string;
}

/**
 * Re-render a DM's own rows the way a player's response would have arrived.
 *
 * Presentation, not permission — the distinction the reveal-gating rule turns
 * on. RLS is what stops a player ever receiving these rows; this runs only for
 * a DM who is already entitled to every one of them, so that DM can see what
 * has been revealed before a session starts. Nothing here is a boundary and
 * nothing may be built on it as one.
 *
 * Generic over the row so a third reveal-gated table costs a call, not a copy.
 */
export function asPlayerView<T extends RevealGated>(rows: T[]): T[] {
  return rows.filter((row) => row.isRevealed).map(stripDmNotes);
}

/**
 * The shape of a row that names a location it may not be allowed to name.
 */
interface LocationBound {
  locationId: string | null;
  locationName: string | null;
}

/**
 * Blank the denormalised location name on rows whose location this viewer
 * cannot see.
 *
 * asPlayerView is not enough on its own for NPCs, and the reason is that the
 * name does not come from the NPC. NPC_SELECT embeds `locations ( name )`, and
 * that embed answers to locations' own RLS — so for a real player, an NPC
 * standing somewhere unrevealed arrives with `locations: null` and therefore
 * `locationName: null`. Nothing filters isRevealed on the NPC row does that,
 * because the NPC itself may be perfectly revealed. Without this, a previewing
 * DM reads "Ismark Kolyanovich — Village of Barovia" on a page where the player
 * sees no home at all.
 *
 * Presentation, not permission, exactly as above: RLS already produced the null
 * for everyone who isn't the DM. This reproduces it for the DM who asked to be
 * shown what they would see.
 *
 * Takes the already-previewed location list rather than reading one, so the
 * caller decides what "visible" means and this stays a pure function of its
 * arguments — the same reason useNpcs takes asPlayer instead of reaching for
 * the context.
 */
export function hideUnseenLocationNames<T extends LocationBound>(
  rows: T[],
  visibleLocations: readonly { id: string }[],
): T[] {
  const visible = new Set(visibleLocations.map((location) => location.id));
  return rows.map((row) => {
    // Already nameless — either it has no home, or RLS took the name off
    // before this ever ran. Returning the row itself keeps the identity stable
    // for the common case.
    if (row.locationName === null) return row;
    if (row.locationId !== null && visible.has(row.locationId)) return row;
    return { ...row, locationName: null };
  });
}

// The note is removed rather than left unrendered: a key that isn't on the
// object can't leak into a component written later. Absent, not
// present-and-undefined, so the result is the same shape the services build for
// a player and `"dmNotes" in row` agrees with the optional type either way.
function stripDmNotes<T extends RevealGated>(row: T): T {
  // Most rows carry no note at all, so the copy is only worth making when
  // there is something to take off it.
  if (!("dmNotes" in row)) return row;
  const stripped = { ...row };
  delete stripped.dmNotes;
  return stripped;
}
