import { Fragment, SubmitEvent, useState } from "react";
import { useCampaign } from "../../components/CampaignLayout";
import { useCharacter } from "../../hooks/useCharacter";
import { useCharacterSpells } from "../../hooks/useCharacterSpells";
import { useCharacterFeats } from "../../hooks/useCharacterFeats";
import { useSpells } from "../../hooks/useSpells";
import { useFeats } from "../../hooks/useFeats";
import { SpellDetailCard } from "../../components/SpellDetailCard";
import { FeatDetailCard } from "../../components/FeatDetailCard";
import type { Character as CharacterModel } from "../../services/characters";
import type { CharacterSpellEntry } from "../../services/characterSpells";
import type { CharacterFeatEntry } from "../../services/characterFeats";
import {
  spellLevelGroupLabel,
  spellLevelLine,
  spellsByLevel,
} from "../../services/spells";
import { featCategoryLabel, featsByCategory } from "../../services/feats";
import { errorMessage } from "../../lib/errors";
import "./character.css";

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
export function Character() {
  // Non-null by construction: this route sits under CampaignLayout, which has
  // already resolved :campaignId against the campaigns this user can see.
  const campaign = useCampaign();
  const {
    data: character,
    isLoading,
    error,
    createCharacter,
  } = useCharacter(campaign.id);

  if (isLoading) return <p>Consulting the ledger...</p>;
  if (error) return <p>Couldn't load your character: {error.message}</p>;

  return (
    // One wrapper, because character.css scopes its palette to `.ch` the same
    // way shop.css scopes its own to `.shop` — those custom properties are not
    // on :root, so a panel rendered outside this element would lose every colour.
    <div className="ch">
      <p className="ch-eyebrow">— Your Own Tale —</p>
      <h1 className="ch-title">Character</h1>
      {character ? (
        <CharacterSheet character={character} />
      ) : (
        <div className="ch-panel">
          <p className="ch-blurb">
            No one of yours walks Barovia yet. Name them, and the mists will
            take note.
          </p>
          <CharacterNameForm
            submitLabel="Create character"
            onSubmit={(name) => createCharacter(name)}
          />
        </div>
      )}
    </div>
  );
}

// The sheet: identity at the top (owner-only writes), then known magic and
// feats below it (owner or DM). The split in this component mirrors the split
// in 028's policies exactly — one section per child table, each governed by
// can_edit_character, all of them under a name only its owner can change.
//
// Gear used to sit between the two and now lives on the Inventory page, beside
// the party's hoard — the two lists a stack can move between belong on one
// screen more than what you carry belongs under your name.
function CharacterSheet({ character }: { character: CharacterModel }) {
  const campaign = useCampaign();
  const { renameCharacter, resetCharacter } = useCharacter(campaign.id);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  return (
    <>
      <div className="ch-panel">
        {isRenaming ? (
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
          <div className="ch-identity">
            <h2 className="ch-name">{character.name}</h2>
            <button className="ch-button" onClick={() => setIsRenaming(true)}>
              Rename
            </button>
            {/* The DM cannot reach this control, and not because it is hidden:
                028's UPDATE and DELETE policies on characters are owner-only,
                so a DM's rename matches zero rows at the database. */}
            <button
              className="ch-button ch-button--danger"
              onClick={() => setIsResetting(true)}
              disabled={isResetting}
            >
              Reset
            </button>
          </div>
        )}

        {isResetting && (
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
      </div>

      <CharacterSpells characterId={character.id} />
      <CharacterFeats characterId={character.id} />
    </>
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
function CharacterSpells({ characterId }: { characterId: string }) {
  const campaign = useCampaign();
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

  if (isLoading) return <p className="ch-panel">Loading spells...</p>;
  if (error)
    return <p className="ch-panel">Couldn't load spells: {error.message}</p>;

  const panel = entries.find((entry) => entry.entryId === panelId) ?? null;

  return (
    <div className="ch-panel">
      <h3 className="ch-section">
        Known Magic
        <span className="ch-section__count">{entries.length} known</span>
      </h3>

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
        <button className="ch-button" type="submit" disabled={adding || !spellId}>
          {adding ? "Adding..." : "Add"}
        </button>
        {addError && <span className="ch-error">{addError}</span>}
      </form>

      {/* Click-outside backdrop, the same shape Shop and PartyInventory use.
          spells.css only promotes it to a fixed overlay while it has a child, so
          with nothing selected it stays an inert empty div; the card itself
          stops propagation so clicking inside doesn't dismiss it. */}
      <div className="spell-detail-backdrop" onClick={() => setPanelId(null)}>
        {panel && (
          <SpellDetailCard
            key={panel.entryId}
            spell={panel}
            onClose={() => setPanelId(null)}
            footer={
              <RemoveSpellFooter
                entry={panel}
                onRemove={removeSpell}
                onRemoved={() => setPanelId(null)}
              />
            }
          />
        )}
      </div>

      {/* Group headers are rows inside the same table as the spells, not a
          table per level: that is what keeps a heading and the rows under it
          sharing one column structure, so the Remove buttons stay on a single
          right edge down the whole panel. colSpan matches SpellRow's two cells. */}
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
  );
}

// One row owning its own action state, GearRow's shape: a failure reports beside
// the spell it happened to rather than as one page-level message that can't say
// which. The name is a button because reading what a spell does is the point of
// the list — the row is a link into the card, not just a label with a delete
// beside it.
function SpellRow({
  entry,
  onInspect,
  onRemove,
}: {
  entry: CharacterSpellEntry;
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
        <button
          className="ch-button ch-button--danger"
          onClick={handleRemove}
          disabled={busy}
          title="Remove from this character"
          aria-label={`Remove ${entry.name} from this character`}
        >
          Remove
        </button>
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
function CharacterFeats({ characterId }: { characterId: string }) {
  const campaign = useCampaign();
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

  if (isLoading) return <p className="ch-panel">Loading feats...</p>;
  if (error)
    return <p className="ch-panel">Couldn't load feats: {error.message}</p>;

  const panel = entries.find((entry) => entry.entryId === panelId) ?? null;

  return (
    <div className="ch-panel">
      <h3 className="ch-section">
        Feats
        <span className="ch-section__count">{entries.length} taken</span>
      </h3>

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
        <button className="ch-button" type="submit" disabled={adding || !featId}>
          {adding ? "Adding..." : "Add"}
        </button>
        {addError && <span className="ch-error">{addError}</span>}
      </form>

      {/* Its own backdrop class rather than the spell panel's, so the two cards
          above can never end up sharing an overlay: feats.css only promotes
          this div while it has a child, and both sit in the flow otherwise. */}
      <div className="feat-detail-backdrop" onClick={() => setPanelId(null)}>
        {panel && (
          <FeatDetailCard
            key={panel.entryId}
            feat={panel}
            onClose={() => setPanelId(null)}
            footer={
              <RemoveFeatFooter
                entry={panel}
                onRemove={removeFeat}
                onRemoved={() => setPanelId(null)}
              />
            }
          />
        )}
      </div>

      {/* Group headers are rows inside the same table as the feats, not a table
          per category — what keeps a heading and the rows under it sharing one
          column structure, so the Remove buttons stay on a single right edge
          down the whole panel. colSpan matches FeatRow's two cells. */}
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
  );
}

// SpellRow's shape: one row owning its own action state, so a failure reports
// beside the feat it happened to rather than as one page-level message that
// can't say which. The meta line is the prerequisite rather than a restatement
// of the category, which the group header above already gave.
function FeatRow({
  entry,
  onInspect,
  onRemove,
}: {
  entry: CharacterFeatEntry;
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
        <button
          className="ch-button ch-button--danger"
          onClick={handleRemove}
          disabled={busy}
          title="Remove from this character"
          aria-label={`Remove ${entry.name} from this character`}
        >
          Remove
        </button>
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
