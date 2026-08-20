import { SubmitEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../services/AuthContext";
import { useCampaign } from "../../components/CampaignLayout";
import { usePlayerPreview } from "../../components/PlayerPreviewContext";
import { useParty } from "../../hooks/useParty";
import { useItems } from "../../hooks/useItems";
import { useSpells } from "../../hooks/useSpells";
import { useCharacterInventory } from "../../hooks/useCharacterInventory";
import { useCharacterSpells } from "../../hooks/useCharacterSpells";
import { spellLevelGroupLabel, spellsByLevel } from "../../services/spells";
import type { PartyCharacter } from "../../services/characters";
import { formatGoldValue, formatPurse } from "../../services/currency";
import { errorMessage } from "../../lib/errors";
import "./party.css";

/**
 * Every character in the campaign and what each of them is hauling — the page
 * Character.tsx is the single-seat version of.
 *
 * Nothing here is DM-only to read. 028's SELECT policy on characters is
 * is_campaign_member, the one on character_inventory is "can you see the
 * character", and 037 gives character_spells the same predicate — so this whole
 * page is what any player at the table may already see; the DM's Give and Teach
 * controls are the only things gated, and that gate is for honesty about whose
 * controls they are rather than enforcement. RLS is the enforcement, through
 * can_edit_character, which 028 wrote as "the owner OR this campaign's DM" and
 * both tables' policies call unchanged.
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
  const { previewing } = usePlayerPreview();
  // Nothing on this page is reveal-gated — every character is visible to every
  // member — so this gates the Give and Teach footers and nothing else. Defined
  // even though the route is currently commented out in App.tsx: the file is
  // still typechecked, and a page that comes back with the old gate is a
  // regression nobody would be looking for.
  const showDmUi = campaign.isDm && !previewing;
  const { data: party = [], isLoading, error } = useParty(campaign.id);

  if (isLoading) return <p>Consulting the ledger...</p>;
  if (error) return <p>{error.message}</p>;

  // A copy, because `party` belongs to the query cache and sort() is in place.
  // Yours first: the page is a reference for the table, and the row you check
  // most is your own.
  const sorted = [...party].sort((a, b) => {
    const mine =
      Number(b.userId === profile?.id) - Number(a.userId === profile?.id);
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
                  {sheetTally(character)}
                </span>
                {/* Visible to the whole table, same rule as the gear list below
                    it: 028's SELECT policy on characters is is_campaign_member,
                    so every purse on this page is already something any player
                    could read. Read-only — adding or spending happens on the
                    Inventory page, this character's own or (for the DM) not at
                    all; there is no Give-style control for currency. */}
                <span className="party-sheet__purse">
                  {formatPurse(character)}
                </span>
                <span className="party-sheet__value">
                  Total Gold Value: {formatGoldValue(character)}
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

              {/* Shown only when there is magic to show, which is the one place
                  this list deliberately parts company with the gear above it.
                  The gear prints "They carry nothing yet." because every
                  character is meant to be carrying something; most of a Barovian
                  party casts nothing at all, so an empty spell block on every
                  fighter's panel would be a line of noise repeated down the
                  page. Absence reads as "not a caster" here. */}
              {character.spells.length > 0 && (
                <>
                  <p className="party-sheet__label">Known Magic</p>
                  <ul className="party-sheet__spells">
                    {/* Grouped and inlined rather than one row per spell: a
                        caster knows far more spells than they carry items, and
                        at panel width the names wrapping under a level label
                        stay readable where twenty rows would bury the gear.
                        Keyed by level, which spellsByLevel makes unique. */}
                    {spellsByLevel(character.spells).map((group) => (
                      <li
                        className="party-sheet__spell-group"
                        key={group.level}
                      >
                        <span className="party-sheet__level">
                          {spellLevelGroupLabel(group.level)}
                        </span>
                        <span className="party-sheet__spell-names">
                          {group.spells.map((spell) => spell.name).join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {/* One rule over both controls rather than one apiece: they are
                  the same permission (can_edit_character) spent on two tables,
                  and reading as two separate footers would suggest otherwise. */}
              {showDmUi && (
                <div className="party-dm">
                  <GiveForm
                    characterId={character.id}
                    characterName={character.name}
                  />
                  <TeachForm
                    characterId={character.id}
                    characterName={character.name}
                  />
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// The line under a character's name: what they haul and what they know, with
// the empty half left out rather than printed as a zero. "nothing" only when
// both are empty — a character just rolled up, which is the state the word is
// actually describing.
function sheetTally(character: PartyCharacter): string {
  const parts: string[] = [];
  if (character.stacks > 0) parts.push(`${character.stacks} stacks`);
  if (character.spells.length > 0) {
    parts.push(`${character.spells.length} spells`);
  }

  return parts.length === 0 ? "nothing" : parts.join(" · ");
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
// Reusing that hook has a cost worth naming, and TeachForm below doubles it:
// each is a query as well as its mutations, so a DM's party of six mounts six
// gear fetches and six spell fetches this page never renders — useParty already
// carried both. It buys the repo's rule that a mutation lives in a hook rather
// than being wired up in a page, and the requests are small and cached. If the
// party grows enough to matter, the fix is giveItem and teachSpell mutations on
// useParty, not bare service calls from here.
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

// GiveForm's twin over character_spells — the same permission, the same panel,
// the same invalidate-the-party-list-afterwards. Two components rather than one
// parameterised by "kind": they differ in the hook they write through, the shape
// of their picker (spells need <optgroup>s, items do not) and every string, so
// the shared part would be the four lines of busy/error state that every form in
// this app already repeats on purpose.
//
// One behaviour to know, and it is the database's rather than this form's:
// addSpell upserts with ignoreDuplicates, so granting a spell the character
// already knows succeeds and changes nothing. That is the intended no-op — the
// DM's aim was "make sure they have this" — and it is why this form does not
// filter the picker down to spells they lack. Filtering would also mean holding
// this character's list twice, once through useParty and once through
// useCharacterSpells, and the two can disagree mid-refetch.
function TeachForm({
  characterId,
  characterName,
}: {
  characterId: string;
  characterName: string;
}) {
  const campaign = useCampaign();
  const queryClient = useQueryClient();
  const { addSpell } = useCharacterSpells(characterId);
  const { data: spells = [] } = useSpells(campaign.id);

  const [spellId, setSpellId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTeach(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!spellId) return;

    setBusy(true);
    setError(null);
    try {
      await addSpell(spellId);
      await queryClient.invalidateQueries({
        queryKey: ["party", campaign.id],
      });
      setSpellId("");
    } catch (err) {
      console.error("Problem teaching a spell to a character:", err);
      setError(errorMessage(err, "Couldn't grant that spell"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="party-give party-teach" onSubmit={handleTeach}>
      <select
        value={spellId}
        onChange={(e) => setSpellId(e.target.value)}
        disabled={busy}
        aria-label={`Grant a spell to ${characterName}`}
      >
        <option value="">Choose a spell...</option>
        {/* The sheet's picker, unchanged: a flat select over the whole grimoire
            is a couple hundred options with nothing to navigate by. */}
        {spellsByLevel(spells).map((group) => (
          <optgroup key={group.level} label={spellLevelGroupLabel(group.level)}>
            {group.spells.map((spell) => (
              <option key={spell.id} value={spell.id}>
                {spell.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button type="submit" disabled={busy || !spellId}>
        {busy ? "Granting..." : "Grant"}
      </button>
      {error && <span className="party-give__error">{error}</span>}
    </form>
  );
}
