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
