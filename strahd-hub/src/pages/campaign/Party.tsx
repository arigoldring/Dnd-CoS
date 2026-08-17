import { SubmitEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../services/AuthContext";
import { useCampaign } from "../../components/CampaignLayout";
import { useParty } from "../../hooks/useParty";
import { useItems } from "../../hooks/useItems";
import { useCharacterInventory } from "../../hooks/useCharacterInventory";
import { errorMessage } from "../../lib/errors";
import "./party.css";

/**
 * Every character in the campaign and what each of them is hauling — the page
 * Character.tsx is the single-seat version of.
 *
 * Nothing here is DM-only to read. 028's SELECT policy on characters is
 * is_campaign_member and the one on character_inventory is "can you see the
 * character", so this whole page is what any player at the table may already
 * see; the DM's Give control is the only thing gated, and that gate is for
 * honesty about whose control it is rather than enforcement. RLS is the
 * enforcement, through can_edit_character.
 *
 * The seats with no character behind them — a member who hasn't rolled anyone
 * up — are deliberately absent. Nothing in the app can list a campaign's
 * members: 013's SELECT policy on campaign_members is `user_id = auth.uid()`,
 * so the only membership row anyone can read is their own. .party-absent is in
 * the sheet, waiting on that policy.
 */
export function Party() {
  const campaign = useCampaign();
  const { profile } = useAuth();
  const { data: party = [], isLoading, error } = useParty(campaign.id);

  if (isLoading) return <p>Consulting the ledger...</p>;
  if (error) return <p>{error.message}</p>;

  // A copy, because `party` belongs to the query cache and sort() is in place.
  // Yours first: the page is a reference for the table, and the row you check
  // most is your own.
  const sorted = [...party].sort((a, b) => {
    const mine = Number(b.userId === profile?.id) - Number(a.userId === profile?.id);
    return mine !== 0 ? mine : a.name.localeCompare(b.name);
  });
  const total = party.reduce((n, c) => n + c.carried, 0);

  return (
    <div className="party">
      <div className="party__head">
        <div>
          <p className="party__eyebrow">Who Walks Barovia</p>
          <h1 className="party__title">The Party</h1>
        </div>
        <p className="party__tally">
          {party.length} characters · {total} things between them
        </p>
      </div>

      {party.length === 0 ? (
        <p className="party__empty">Nobody has rolled one up yet.</p>
      ) : (
        <div className="party__grid">
          {sorted.map((character) => (
            <section
              key={character.id}
              className={`party-sheet${character.userId === profile?.id ? " party-sheet--mine" : ""}`}
            >
              <div className="party-sheet__head">
                <h2 className="party-sheet__name">{character.name}</h2>
                <span className="party-sheet__player">
                  {character.playerName ?? "player unknown"}
                </span>
                <span className="party-sheet__count">
                  {character.stacks === 0
                    ? "nothing"
                    : `${character.stacks} stacks`}
                </span>
              </div>
              <div className="party-sheet__rule" />

              {character.items.length === 0 ? (
                <p className="party-sheet__empty">They carry nothing yet.</p>
              ) : (
                <ul className="party-sheet__list">
                  {/* Keyed by name, which is unique per character since 030:
                      one row per (character, item), with quantity carrying the
                      count. */}
                  {character.items.map((item) => (
                    <li className="party-sheet__row" key={item.name}>
                      <span className="party-sheet__item">
                        {item.name}
                        {item.addedByName && (
                          <span className="party-sheet__from">
                            {" "}
                            — from{" "}
                            {item.addedByName === profile?.displayName
                              ? "you"
                              : item.addedByName}
                          </span>
                        )}
                      </span>
                      <span className="party-sheet__qty">×{item.quantity}</span>
                    </li>
                  ))}
                </ul>
              )}

              {campaign.isDm && (
                <GiveForm
                  characterId={character.id}
                  characterName={character.name}
                />
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// The DM's per-character control: CharacterGear's add form at panel scale.
// Owns its own busy and error state, the shape every row in this app uses — a
// failure reports beside the panel it happened to rather than as one page-level
// message that can't say which character it meant.
//
// The write goes through useCharacterInventory, which already invalidates that
// character's own gear list. The party list is a second cache entry built from
// the same rows, and nothing else knows to refresh it, so this does.
//
// Reusing that hook has a cost worth naming: it is a query as well as three
// mutations, so a DM's party of six mounts six gear fetches this page never
// renders — useParty already carried the same items. It buys the repo's rule
// that a mutation lives in a hook rather than being wired up in a page, and the
// requests are small and cached. If the party grows enough to matter, the fix
// is a giveItem mutation on useParty, not a bare service call from here.
function GiveForm({
  characterId,
  characterName,
}: {
  characterId: string;
  characterName: string;
}) {
  const campaign = useCampaign();
  const queryClient = useQueryClient();
  const { addItem } = useCharacterInventory(characterId);
  const { data: items = [] } = useItems(campaign.id);

  const [itemId, setItemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGive(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!itemId) return;

    setBusy(true);
    setError(null);
    try {
      await addItem(itemId);
      await queryClient.invalidateQueries({
        queryKey: ["party", campaign.id],
      });
      setItemId("");
    } catch (err) {
      console.error("Problem giving an item to a character:", err);
      setError(errorMessage(err, "Couldn't give that item"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="party-give" onSubmit={handleGive}>
      <select
        value={itemId}
        onChange={(e) => setItemId(e.target.value)}
        disabled={busy}
        aria-label={`Give an item to ${characterName}`}
      >
        <option value="">Choose an item...</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={busy || !itemId}>
        {busy ? "Giving..." : "Give"}
      </button>
      {error && <span className="party-give__error">{error}</span>}
    </form>
  );
}
