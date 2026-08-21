import { Fragment, ReactNode, SubmitEvent, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useCampaign } from "../../components/CampaignLayout";
import { useAuth } from "../../services/AuthContext";
import { useCharacter } from "../../hooks/useCharacter";
import { useParty } from "../../hooks/useParty";
import { useCharacterSpells } from "../../hooks/useCharacterSpells";
import { useCharacterFeats } from "../../hooks/useCharacterFeats";
import { useCharacterInventory } from "../../hooks/useCharacterInventory";
import { useSpells } from "../../hooks/useSpells";
import { useFeats } from "../../hooks/useFeats";
import { useItems } from "../../hooks/useItems";
import { SpellDetailCard } from "../../components/SpellDetailCard";
import { FeatDetailCard } from "../../components/FeatDetailCard";
import { CharacterRoster } from "./CharacterRoster";
import type { Character as CharacterModel } from "../../services/characters";
import type { CharacterSpellEntry } from "../../services/characterSpells";
import type { CharacterFeatEntry } from "../../services/characterFeats";
import { formatGoldValue, formatPurse } from "../../services/currency";
import {
  spellLevelGroupLabel,
  spellLevelLine,
  spellsByLevel,
} from "../../services/spells";
import { featCategoryLabel, featsByCategory } from "../../services/feats";
import { errorMessage } from "../../lib/errors";
import "./character.css";

/**
 * The nav rail's "Character" destination. A DM has no PC of their own in the
 * campaign, so for them this is the roster of every player's character
 * (CharacterRoster) rather than the create/own-sheet flow below — isDm is the
 * whole branch, unaffected by player preview, the same as the nav rail's own
 * DM-only links (New Item, Invites) already are: this is a fact about who is
 * signed in, not something preview puts away.
 */
export function Character() {
  const campaign = useCampaign();
  return campaign.isDm ? <CharacterRoster /> : <OwnCharacter />;
}

/**
 * The viewer's own character in this campaign: a create form when they have
 * none, the sheet when they do. Two states, one query — the same shape
 * AuthGate uses for the display name, one level down.
 *
 * Deliberately not styled through shop.css, which the old PartyInventory page
 * was: it inherited the Shop's positional nth-of-type contract, a real
 * constraint on the order of its children. This page has its own stylesheet so
 * a sheet is free to grow sections without counting siblings. Inventory.tsx,
 * which replaced that page, made the same choice for the same reason.
 */
function OwnCharacter() {
  // Non-null by construction: this route sits under CampaignLayout, which has
  // already resolved :campaignId against the campaigns this user can see.
  const campaign = useCampaign();
  const { profile } = useAuth();
  const {
    data: character,
    isLoading,
    error,
    createCharacter,
  } = useCharacter(campaign.id);

  if (isLoading) return <p>Consulting the ledger...</p>;
  if (error) return <p>Couldn't load your character: {error.message}</p>;

  return (
    // One wrapper, the way shop.css has its own .shop: it is the page's column
    // — width, measure and body type — and every rule in character.css hangs
    // off it. The colours it uses are theme.css's, read off :root, so this
    // element scopes layout rather than a palette.
    <div className="ch">
      {character ? (
        <CharacterSheet
          character={character}
          isOwn
          playerName={profile?.displayName ?? null}
        />
      ) : (
        // The create state is the same frame with nothing yet to divide: a
        // header and the form, and no bands at all. There are no sections to
        // rule off until there is a character to hang them on.
        <article className="ch-sheet">
          <header className="ch-head">
            <p className="ch-eyebrow">— Your Own Tale —</p>
            <p className="ch-blurb">
              No one of yours walks Barovia yet. Name them, and the mists will
              take note.
            </p>
            <CharacterNameForm
              submitLabel="Create character"
              onSubmit={(name) => createCharacter(name)}
            />
          </header>
        </article>
      )}
    </div>
  );
}

/**
 * The DM's view of one picked player's character, reached from
 * CharacterRoster. Reuses useParty rather than a query of its own: the
 * roster just populated the same ["party", campaignId] cache entry, so
 * following a card into here is a cache hit, and there is no owner-filtered
 * "mine" read that would apply to someone else's character anyway.
 *
 * isOwn is computed from userId rather than hardcoded false — a DM who has
 * also rolled up their own character (an edge case, not the norm) still gets
 * the owner controls when they land on their own row.
 */
export function CharacterDetail() {
  const campaign = useCampaign();
  const { profile } = useAuth();
  const { characterId } = useParams();
  const { data: party, isLoading, error } = useParty(campaign.id);

  if (isLoading) return <p>Consulting the ledger...</p>;
  if (error) return <p>{error.message}</p>;

  // No character in this campaign matches the id — a stale link, a typo, or a
  // character the DM no longer has read access to. MapView's fallback for an
  // unresolved :mapId is the same shape: send the viewer back to the index
  // rather than rendering a page about nothing.
  const character = party?.find((c) => c.id === characterId);
  if (!character) {
    return <Navigate to={`/campaign/${campaign.id}/Character`} replace />;
  }

  const isOwn = character.userId === profile?.id;

  return (
    <div className="ch">
      <CharacterSheet
        character={character}
        isOwn={isOwn}
        playerName={character.playerName}
      />
    </div>
  );
}

// The sheet: one framed page rather than three plates that happen to be
// stacked. Identity heads it (owner-only writes), then Known Magic, Feats and
// what they are carrying, each introduced by a ruled band. The bands are the
// only dividers — nothing inside the frame draws a border of its own, which is
// the whole of the redraw.
//
// 028's permission split is unchanged and still one section per child table:
// the name is the owner's alone, the two lists are the owner's or the DM's
// through can_edit_character. What changed is that the page no longer says so
// by boxing them apart — a permission boundary was never what a border between
// two parts of one character means to the reader.
//
// Gear itself still lives on the Inventory page, beside the party's hoard: the
// two lists a stack can move between belong on one screen. What comes back
// here is a count and a door, not a control.
function CharacterSheet({
  character,
  isOwn,
  playerName,
}: {
  character: CharacterModel;
  isOwn: boolean;
  playerName: string | null;
}) {
  const campaign = useCampaign();
  // Fetched regardless of isOwn — hooks can't be conditional — but the
  // rename/reset mutations below are only ever invoked from the isOwn
  // branch. When a DM is viewing someone else's sheet this is a harmless
  // extra read of the DM's own (usually absent) character.
  const { renameCharacter, resetCharacter } = useCharacter(campaign.id);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  return (
    <article className="ch-sheet">
      <header className="ch-head">
        {/* Small, and inside the frame. The rail already says which page this
            is, so the loudest type on it goes to the name — a sheet whose
            largest words are "Character" spends it on what the reader knew
            before they arrived. */}
        <p className="ch-eyebrow">— Your Own Tale —</p>

        {isOwn && isRenaming ? (
          <CharacterNameForm
            initialName={character.name}
            submitLabel="Save"
            onSubmit={async (name) => {
              await renameCharacter(character.id, name);
              setIsRenaming(false);
            }}
            onCancel={() => setIsRenaming(false)}
          />
        ) : (
          <>
            <div className="ch-identity">
              <h1 className="ch-name">{character.name}</h1>
              {/* Rename/Reset are owner-only at 028's UPDATE and DELETE
                  policies — a DM's rename or delete would match zero rows at
                  the database — so they render only for isOwn rather than
                  being offered and left to silently no-op. */}
              {isOwn && (
                <>
                  <button
                    className="ch-button"
                    onClick={() => setIsRenaming(true)}
                  >
                    Rename
                  </button>
                  <button
                    className="ch-button ch-button--danger"
                    onClick={() => setIsResetting(true)}
                    disabled={isResetting}
                  >
                    Reset
                  </button>
                </>
              )}
            </div>
            <p className="ch-byline">
              Played by {playerName ?? "their player"} · rolled up{" "}
              {new Date(character.createdAt).toLocaleDateString()}
              {isOwn && " · yours alone to rename or unmake"}.
            </p>
          </>
        )}

        {/* Stays in the header, and deliberately not a band: a destructive
            confirm is a thing that happened to the identity above it, not a
            fourth section of the sheet. */}
        {isOwn && isResetting && (
          <div className="ch-reset">
            <p className="ch-warning">
              Resetting deletes {character.name} and everything they carry. This
              cannot be undone.
            </p>
            <CharacterNameForm
              submitLabel="Delete and start over"
              danger
              // The confirm sits here, immediately before the destructive call,
              // rather than on the button that opened this form — so the last
              // thing dismissed is the warning, not a dialog two steps back.
              confirmMessage={`Permanently delete ${character.name} and all of their gear?`}
              onSubmit={async (name) => {
                await resetCharacter(name);
                setIsResetting(false);
              }}
              onCancel={() => setIsResetting(false)}
            />
          </div>
        )}
      </header>

      {/* Each of these renders a band and a body into the frame, and none of
          them an <article> of its own — they are sections of this sheet, not
          three sheets in a row. Their queries and their state stay theirs. */}
      <CharacterSpells characterId={character.id} isOwn={isOwn} />
      <CharacterFeats characterId={character.id} isOwn={isOwn} />
      <CharacterCarried characterId={character.id} isOwn={isOwn} />
      <CharacterPurse character={character} />
    </article>
  );
}

// The divider between two parts of the sheet, and the home of that part's one
// control. Shared by all three sections because they differ only in what sits
// at its right end — a picker, a picker, and nothing, Carried's door being a
// line in its body rather than a button on the strip.
function Band({
  label,
  count,
  children,
}: {
  label: string;
  count?: string;
  children?: ReactNode;
}) {
  return (
    <div className="ch-band">
      <h2 className="ch-band__label">{label}</h2>
      {count && <span className="ch-band__count">{count}</span>}
      {children}
    </div>
  );
}

// The character's spell list. Writable by the owner OR the campaign's DM,
// through 028's can_edit_character — the same predicate that governs their gear
// over on the Inventory page. Nothing here checks which one you are: RLS is the
// enforcement layer, and a forbidden write comes back as an error the row
// reports.
//
// No slots, no prepared/known split, no per-day usage — 037 records that a
// character has a spell and nothing else, and this panel shows exactly that
// plus a way to read what the spell does.
//
// isOwn drives canEdit here rather than reading campaign.isDm alone, because
// this component is also mounted for a player browsing someone else's sheet
// by URL — can_edit_character is owner-or-DM, and canEdit mirrors that
// exactly.
function CharacterSpells({
  characterId,
  isOwn,
}: {
  characterId: string;
  isOwn: boolean;
}) {
  const campaign = useCampaign();
  const canEdit = isOwn || campaign.isDm;
  const {
    data: entries = [],
    isLoading,
    error,
    addSpell,
    removeSpell,
  } = useCharacterSpells(characterId);
  const { data: spells = [] } = useSpells(campaign.id);

  const [spellId, setSpellId] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // Held by entryId, not the entry itself — Shop's reasoning for panelId: a
  // refetch replaces the object, so storing it would leave the card showing a
  // stale spell beside a fresh row, and a remove would strand a card for a row
  // that no longer exists.
  const [panelId, setPanelId] = useState<string | null>(null);

  async function handleAdd(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!spellId) return;

    setAdding(true);
    setAddError(null);
    try {
      await addSpell(spellId);
      setSpellId("");
    } catch (err) {
      console.error("Problem adding spell to character:", err);
      setAddError(errorMessage(err, "Couldn't add that spell"));
    } finally {
      setAdding(false);
    }
  }

  // Both of these keep the band, so a slow or broken spell read leaves a hole
  // in the sheet rather than a section that vanished: the frame still says
  // Known Magic, and the body below it says why there is nothing under it.
  if (isLoading)
    return (
      <>
        <Band label="Known Magic" />
        <div className="ch-body">
          <p className="ch-empty">Loading spells...</p>
        </div>
      </>
    );
  if (error)
    return (
      <>
        <Band label="Known Magic" />
        <div className="ch-body">
          <p className="ch-error">Couldn't load spells: {error.message}</p>
        </div>
      </>
    );

  const panel = entries.find((entry) => entry.entryId === panelId) ?? null;

  return (
    <>
      {/* The picker rides the band rather than taking a row of its own above
          the table. It is used a few times a level and cost ~50px of the sheet
          every time it wasn't. */}
      <Band label="Known Magic" count={`${entries.length} known`}>
        {canEdit && (
          <form className="ch-add" onSubmit={handleAdd}>
            <select
              value={spellId}
              onChange={(e) => setSpellId(e.target.value)}
              disabled={adding}
            >
              <option value="">Choose a spell...</option>
              {spellsByLevel(spells).map((group) => (
                <optgroup
                  key={group.level}
                  label={spellLevelGroupLabel(group.level)}
                >
                  {group.spells.map((spell) => (
                    <option key={spell.id} value={spell.id}>
                      {spell.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              className="ch-button"
              type="submit"
              disabled={adding || !spellId}
            >
              {adding ? "Adding..." : "Add"}
            </button>
          </form>
        )}
      </Band>

      <div className="ch-body">
        {/* Out of the form and into the body, because a 44px strip cannot grow
            a sentence without becoming a different shape. It still reports
            under the control that failed, which is what the message is for. */}
        {addError && <span className="ch-error">{addError}</span>}

        {/* Click-outside backdrop, the same shape Shop and PartyInventory use.
            spells.css only promotes it to a fixed overlay while it has a child,
            so with nothing selected it stays an inert empty div; the card
            itself stops propagation so clicking inside doesn't dismiss it. */}
        <div className="spell-detail-backdrop" onClick={() => setPanelId(null)}>
          {panel && (
            <SpellDetailCard
              key={panel.entryId}
              spell={panel}
              onClose={() => setPanelId(null)}
              footer={
                canEdit && (
                  <RemoveSpellFooter
                    entry={panel}
                    onRemove={removeSpell}
                    onRemoved={() => setPanelId(null)}
                  />
                )
              }
            />
          )}
        </div>

        {/* Group headers are rows inside the same table as the spells, not a
            table per level: that is what keeps a heading and the rows under it
            sharing one column structure, so the Remove buttons stay on a single
            right edge down the section. colSpan matches SpellRow's two cells. */}
        {entries.length === 0 ? (
          <p className="ch-empty">They know no magic yet.</p>
        ) : (
          <table className="ch-table">
            <tbody>
              {spellsByLevel(entries).map((group) => (
                <Fragment key={group.level}>
                  <tr className="ch-spell-group">
                    <td colSpan={2}>
                      <span className="ch-spell-group__label">
                        {spellLevelGroupLabel(group.level)}
                      </span>
                    </td>
                  </tr>
                  {group.spells.map((entry) => (
                    <SpellRow
                      key={entry.entryId}
                      entry={entry}
                      showRemove={canEdit}
                      onInspect={() => setPanelId(entry.entryId)}
                      onRemove={removeSpell}
                    />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// One row owning its own action state, GearRow's shape: a failure reports beside
// the spell it happened to rather than as one page-level message that can't say
// which. The name is a button because reading what a spell does is the point of
// the list — the row is a link into the card, not just a label with a delete
// beside it.
function SpellRow({
  entry,
  showRemove,
  onInspect,
  onRemove,
}: {
  entry: CharacterSpellEntry;
  showRemove: boolean;
  onInspect: () => void;
  onRemove: (entryId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove() {
    if (!window.confirm(`Remove ${entry.name} from this character?`)) return;

    setBusy(true);
    setError(null);
    try {
      await onRemove(entry.entryId);
    } catch (err) {
      console.error("Problem removing character spell:", err);
      setError(errorMessage(err, "Couldn't remove this spell"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>
        <button className="ch-spell-name" onClick={onInspect}>
          {entry.name}
        </button>
        {entry.concentration && <span className="ch-tag">conc</span>}
        {entry.ritual && <span className="ch-tag">ritual</span>}
        <span className="ch-spell-meta">{spellLevelLine(entry)}</span>
      </td>
      <td className="ch-actions">
        {showRemove && (
          <button
            className="ch-button ch-button--danger"
            onClick={handleRemove}
            disabled={busy}
            title="Remove from this character"
            aria-label={`Remove ${entry.name} from this character`}
          >
            Remove
          </button>
        )}
        {error && <span className="ch-error">{error}</span>}
      </td>
    </tr>
  );
}

// The card's footer slot, which is where the Shop puts its one page-specific
// action too. Removing from inside the card closes it, because the row it
// described is gone the moment this succeeds.
function RemoveSpellFooter({
  entry,
  onRemove,
  onRemoved,
}: {
  entry: CharacterSpellEntry;
  onRemove: (entryId: string) => Promise<void>;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      await onRemove(entry.entryId);
      onRemoved();
    } catch (err) {
      console.error("Problem removing character spell:", err);
      setError(errorMessage(err, "Couldn't remove this spell"));
      setBusy(false);
    }
  }

  return (
    <div className="ch-card-footer">
      <button
        className="ch-button ch-button--danger"
        onClick={handleRemove}
        disabled={busy}
      >
        {busy ? "Removing..." : "Remove from this character"}
      </button>
      {error && <span className="ch-error">{error}</span>}
    </div>
  );
}

// The character's feats. CharacterSpells one table over, with category doing
// the job level does there — it groups the picker, heads the rows, and is the
// line under the name on the card.
//
// No prerequisite checking and no cap on how many a character may take: 041
// records that a character has a feat and nothing else, and there is nothing on
// characters to check "Strength 13 or higher" against. The prerequisite is text
// the table shows the reader.
//
// isOwn drives canEdit the same way CharacterSpells does — can_edit_character
// is owner-or-DM, and this component is also mounted read-only for a player
// browsing someone else's sheet.
function CharacterFeats({
  characterId,
  isOwn,
}: {
  characterId: string;
  isOwn: boolean;
}) {
  const campaign = useCampaign();
  const canEdit = isOwn || campaign.isDm;
  const {
    data: entries = [],
    isLoading,
    error,
    addFeat,
    removeFeat,
  } = useCharacterFeats(characterId);
  const { data: feats = [] } = useFeats(campaign.id);

  const [featId, setFeatId] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // Held by entryId, not the entry itself — CharacterSpells' reasoning: a
  // refetch replaces the object, so storing it would leave the card showing a
  // stale feat beside a fresh row, and a remove would strand a card for a row
  // that no longer exists.
  const [panelId, setPanelId] = useState<string | null>(null);

  async function handleAdd(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!featId) return;

    setAdding(true);
    setAddError(null);
    try {
      await addFeat(featId);
      setFeatId("");
    } catch (err) {
      console.error("Problem adding feat to character:", err);
      setAddError(errorMessage(err, "Couldn't add that feat"));
    } finally {
      setAdding(false);
    }
  }

  // CharacterSpells' reasoning: keep the band so a slow or broken read leaves a
  // labelled hole in the sheet rather than a section that quietly vanished.
  if (isLoading)
    return (
      <>
        <Band label="Feats" />
        <div className="ch-body">
          <p className="ch-empty">Loading feats...</p>
        </div>
      </>
    );
  if (error)
    return (
      <>
        <Band label="Feats" />
        <div className="ch-body">
          <p className="ch-error">Couldn't load feats: {error.message}</p>
        </div>
      </>
    );

  const panel = entries.find((entry) => entry.entryId === panelId) ?? null;

  return (
    <>
      <Band label="Feats" count={`${entries.length} taken`}>
        {canEdit && (
          <form className="ch-add" onSubmit={handleAdd}>
            <select
              value={featId}
              onChange={(e) => setFeatId(e.target.value)}
              disabled={adding}
            >
              <option value="">Choose a feat...</option>
              {featsByCategory(feats).map((group) => (
                <optgroup
                  key={group.category}
                  label={featCategoryLabel(group.category)}
                >
                  {group.feats.map((feat) => (
                    <option key={feat.id} value={feat.id}>
                      {feat.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              className="ch-button"
              type="submit"
              disabled={adding || !featId}
            >
              {adding ? "Adding..." : "Add"}
            </button>
          </form>
        )}
      </Band>

      <div className="ch-body">
        {/* In the body rather than the band, for the reason CharacterSpells
            gives: the strip is 44px and a sentence is not. */}
        {addError && <span className="ch-error">{addError}</span>}

        {/* Its own backdrop class rather than the spell section's, so the two
            cards can never end up sharing an overlay: feats.css only promotes
            this div while it has a child, and both sit in the flow otherwise. */}
        <div className="feat-detail-backdrop" onClick={() => setPanelId(null)}>
          {panel && (
            <FeatDetailCard
              key={panel.entryId}
              feat={panel}
              onClose={() => setPanelId(null)}
              footer={
                canEdit && (
                  <RemoveFeatFooter
                    entry={panel}
                    onRemove={removeFeat}
                    onRemoved={() => setPanelId(null)}
                  />
                )
              }
            />
          )}
        </div>

        {/* Group headers are rows inside the same table as the feats, not a
            table per category — what keeps a heading and the rows under it
            sharing one column structure, so the Remove buttons stay on a single
            right edge down the section. colSpan matches FeatRow's two cells. */}
        {entries.length === 0 ? (
          <p className="ch-empty">They have taken no feats yet.</p>
        ) : (
          <table className="ch-table">
            <tbody>
              {featsByCategory(entries).map((group) => (
                <Fragment key={group.category}>
                  <tr className="ch-feat-group">
                    <td colSpan={2}>
                      <span className="ch-feat-group__label">
                        {featCategoryLabel(group.category)}
                      </span>
                    </td>
                  </tr>
                  {group.feats.map((entry) => (
                    <FeatRow
                      key={entry.entryId}
                      entry={entry}
                      showRemove={canEdit}
                      onInspect={() => setPanelId(entry.entryId)}
                      onRemove={removeFeat}
                    />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// SpellRow's shape: one row owning its own action state, so a failure reports
// beside the feat it happened to rather than as one page-level message that
// can't say which. The meta line is the prerequisite rather than a restatement
// of the category, which the group header above already gave.
function FeatRow({
  entry,
  showRemove,
  onInspect,
  onRemove,
}: {
  entry: CharacterFeatEntry;
  showRemove: boolean;
  onInspect: () => void;
  onRemove: (entryId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove() {
    if (!window.confirm(`Remove ${entry.name} from this character?`)) return;

    setBusy(true);
    setError(null);
    try {
      await onRemove(entry.entryId);
    } catch (err) {
      console.error("Problem removing character feat:", err);
      setError(errorMessage(err, "Couldn't remove this feat"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>
        <button className="ch-feat-name" onClick={onInspect}>
          {entry.name}
        </button>
        {entry.repeatable && <span className="ch-tag">repeatable</span>}
        {entry.prerequisite && (
          <span className="ch-feat-meta">{entry.prerequisite}</span>
        )}
      </td>
      <td className="ch-actions">
        {showRemove && (
          <button
            className="ch-button ch-button--danger"
            onClick={handleRemove}
            disabled={busy}
            title="Remove from this character"
            aria-label={`Remove ${entry.name} from this character`}
          >
            Remove
          </button>
        )}
        {error && <span className="ch-error">{error}</span>}
      </td>
    </tr>
  );
}

// The card's footer slot, RemoveSpellFooter's twin. Removing from inside the
// card closes it, because the row it described is gone the moment this
// succeeds.
function RemoveFeatFooter({
  entry,
  onRemove,
  onRemoved,
}: {
  entry: CharacterFeatEntry;
  onRemove: (entryId: string) => Promise<void>;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      await onRemove(entry.entryId);
      onRemoved();
    } catch (err) {
      console.error("Problem removing character feat:", err);
      setError(errorMessage(err, "Couldn't remove this feat"));
      setBusy(false);
    }
  }

  return (
    <div className="ch-card-footer">
      <button
        className="ch-button ch-button--danger"
        onClick={handleRemove}
        disabled={busy}
      >
        {busy ? "Removing..." : "Remove from this character"}
      </button>
      {error && <span className="ch-error">{error}</span>}
    </div>
  );
}

// What the character is hauling, as a fact rather than a control: two counts,
// the first few things by name, and a door to the page where any of it can be
// changed. No Remove, no quantity, no transfer — everything you can *do* to a
// stack stays on the Inventory page, beside the hoard it moves to and from —
// EXCEPT for the DM case below, which has no Inventory path onto someone
// else's pack at all (Inventory.tsx is always "mine"), so it gets a Give form
// here instead rather than a link that would dead-end.
//
// Read with useCharacterInventory, the hook Inventory.tsx already uses, on the
// same query key — so following the link finds this list in the cache.
//
// It gates nothing. Home.tsx makes exactly this argument for the At the Table
// band: a slow read should let the rest of the page paint and fill in after,
// and a failed one should cost the strip, not the page. Hence no isLoading
// branch and no error line — only the `[]` default, which is what makes that
// safe.
function CharacterCarried({
  characterId,
  isOwn,
}: {
  characterId: string;
  isOwn: boolean;
}) {
  const campaign = useCampaign();
  const { data: entries = [], error } = useCharacterInventory(characterId);

  const stacks = entries.length;
  const things = entries.reduce((n, entry) => n + entry.quantity, 0);
  // Sorted, because getCharacterInventory has no ORDER BY: "the first four"
  // needs to mean something the reader can predict twice running, and
  // Postgres' row order is not that. Quantities print the way the Hoard rail
  // writes them, so ×3 means the same thing on both pages.
  const named = [...entries]
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 4);

  return (
    <>
      <Band label="Carried" count="on the Inventory page" />
      <div className="ch-body ch-carried">
        {stacks > 0 ? (
          <>
            <p className="ch-carried__counts">
              <span className="ch-carried__num">{stacks}</span>
              <span className="ch-carried__unit">
                {stacks === 1 ? "stack" : "stacks"}
              </span>
              <span className="ch-carried__num">{things}</span>
              <span className="ch-carried__unit">
                {things === 1 ? "thing" : "things"}
              </span>
            </p>
            <p className="ch-carried__names">
              {named
                .map((entry) =>
                  entry.quantity > 1
                    ? `${entry.name} ×${entry.quantity}`
                    : entry.name,
                )
                .join(", ")}
              {stacks > named.length && " …"}
            </p>
          </>
        ) : (
          // A failed read and an empty pack both arrive here as an empty list,
          // and they are not the same fact — so the failure says nothing at
          // all rather than claiming the pack is empty. The link stays either
          // way: it is the one thing this strip can always be sure of.
          !error && <p className="ch-carried__empty">Nothing in the pack yet.</p>
        )}

        {isOwn ? (
          <Link className="ch-carried__link" to="../Inventory">
            Open the pack →
          </Link>
        ) : (
          campaign.isDm && <GiveItemForm characterId={characterId} />
        )}
      </div>
    </>
  );
}

// The DM's Give control for a picked character's pack, Party.tsx's GiveForm
// moved onto this sheet: same shape (a picker, a busy/error pair, a Give
// button), add-only like every other DM-writes-to-someone-else's-gear control
// in this app — full pack management (Stow/Take/−1/Remove) stays exclusively
// on Inventory.tsx, which is self-service and untouched by this feature.
//
// useCharacterInventory's own addItem already invalidates this character's
// gear list; the extra invalidate here is for ["party", campaignId], a
// second cache entry built from the same rows that only CharacterRoster
// reads — Party.tsx's GiveForm carries the identical comment for the
// identical reason.
function GiveItemForm({ characterId }: { characterId: string }) {
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
    <form className="ch-add ch-carried__give" onSubmit={handleGive}>
      <select
        value={itemId}
        onChange={(e) => setItemId(e.target.value)}
        disabled={busy}
        aria-label="Give an item"
      >
        <option value="">Choose an item...</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <button
        className="ch-button"
        type="submit"
        disabled={busy || !itemId}
      >
        {busy ? "Giving..." : "Give"}
      </button>
      {error && <span className="ch-error">{error}</span>}
    </form>
  );
}

// The purse: CharacterCarried's shape reused for money instead of gear, and a
// fact for the same reason — everything you can *do* to it (add, spend, move
// it to or from the party's pool) stays on the Inventory page, beside the
// hoard a coin moves to and from.
//
// Reads straight off `character` rather than a hook of its own: 045's five
// columns ride along on every character fetch, the same way price rides along
// on an item, so there is nothing here to load or fail.
function CharacterPurse({ character }: { character: CharacterModel }) {
  return (
    <>
      <Band label="Purse" count="on the Inventory page" />
      <div className="ch-body ch-purse">
        <p className="ch-purse__total">{formatPurse(character)}</p>
        <span className="ch-purse__value">Gold Value: {formatGoldValue(character)}</span>
        <Link className="ch-purse__link" to="../Inventory">
          Open the pack →
        </Link>
      </div>
    </>
  );
}

// One form for create, rename and reset — NamePrompt's shape, with the pieces
// those three cases actually differ on made into props. Trimming here matches
// the service (and 028's `name = trim(name)` check, which rejects padding
// rather than storing it), so the disabled-submit state agrees with what the
// database would accept.
function CharacterNameForm({
  initialName,
  submitLabel,
  danger = false,
  confirmMessage,
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  submitLabel: string;
  danger?: boolean;
  confirmMessage?: string;
  onSubmit: (name: string) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      // No setSubmitting(false) on the success path here — the caller usually
      // unmounts this form (create swaps in the sheet, reset closes itself), so
      // `finally` would be a write to an unmounted component's state. It is
      // harmless in React 19, but the failure path is the one that needs the
      // flag cleared, and that is what the catch below does: the plan's "don't
      // leave a spinner up if the insert throws".
    } catch (err) {
      console.error("Problem saving character:", err);
      setError(errorMessage(err, "Couldn't save this character"));
      setSubmitting(false);
    }
  }

  return (
    <form className="ch-form" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Character name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={50}
        disabled={submitting}
      />
      <button
        className={`ch-button${danger ? " ch-button--danger" : ""}`}
        type="submit"
        disabled={submitting || !name.trim()}
      >
        {submitting ? "Saving..." : submitLabel}
      </button>
      {onCancel && (
        <button
          className="ch-button"
          type="button"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
      )}
      {error && <span className="ch-error">{error}</span>}
    </form>
  );
}
