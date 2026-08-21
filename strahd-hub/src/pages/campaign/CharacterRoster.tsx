import { Link } from "react-router-dom";
import { useCampaign } from "../../components/CampaignLayout";
import { useParty } from "../../hooks/useParty";
import type { PartyCharacter } from "../../services/characters";
import "./character.css";

/**
 * The DM's "Character" destination: every player's character in the
 * campaign, picked from rather than shown at once. Character.tsx dispatches
 * here instead of the create/own-sheet flow whenever campaign.isDm, since a
 * DM has no PC of their own to land on.
 *
 * Reads useParty, the same query Party.tsx (route currently disabled) reads
 * — no new service or hook. Each card is a plain Link into
 * Character/:characterId, which reads the same cache entry back out to find
 * the character it names, so the click is a cache hit rather than a second
 * round trip.
 */
export function CharacterRoster() {
  const campaign = useCampaign();
  const { data: party = [], isLoading, error } = useParty(campaign.id);

  if (isLoading) return <p>Consulting the ledger...</p>;
  if (error) return <p>{error.message}</p>;

  // Alphabetical rather than Party.tsx's "mine first": the DM has no row of
  // their own on this page to privilege.
  const sorted = [...party].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="ch">
      <header className="page-head">
        <p className="page-head__eyebrow">— Who Walks Barovia —</p>
        <h1>Characters</h1>
        <p className="page-head__sub">
          Pick a player to see their sheet — spells, feats and gear can all be
          added from there.
        </p>
      </header>

      {sorted.length === 0 ? (
        <p className="ch-roster__empty">
          Nobody has rolled a character up yet.
        </p>
      ) : (
        <div className="ch-roster">
          {sorted.map((character) => (
            <Link
              key={character.id}
              to={character.id}
              className="ch-roster__card"
            >
              <span className="ch-roster__name">{character.name}</span>
              <span className="ch-roster__player">
                {character.playerName ?? "player unknown"}
              </span>
              <span className="ch-roster__tally">{sheetTally(character)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Party.tsx's sheetTally, unchanged: what they haul and what they know, with
// the empty half left out rather than printed as a zero.
function sheetTally(character: PartyCharacter): string {
  const parts: string[] = [];
  if (character.stacks > 0) parts.push(`${character.stacks} stacks`);
  if (character.spells.length > 0) {
    parts.push(`${character.spells.length} spells`);
  }

  return parts.length === 0 ? "nothing yet" : parts.join(" · ");
}
