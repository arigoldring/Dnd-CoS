import { SubmitEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useCampaign } from "../../components/CampaignLayout";
import { usePlayerPreview } from "../../components/PlayerPreviewContext";
import { useCharacter } from "../../hooks/useCharacter";
import { useCharacterInventory } from "../../hooks/useCharacterInventory";
import { usePartyInventory } from "../../hooks/usePartyInventory";
import { usePartyCurrency } from "../../hooks/usePartyCurrency";
import { useInventoryTransfer } from "../../hooks/useInventoryTransfer";
import { useItems } from "../../hooks/useItems";
import { useSearchBar } from "../../hooks/useSearchBar";
import { ItemDetailCard } from "../../components/ItemDetailCard";
import type { Character as CharacterModel, Denomination } from "../../services/characters";
import type { CharacterInventoryEntry } from "../../services/characterInventory";
import type { PartyInventoryEntry } from "../../services/partyInventory";
import {
  EMPTY_PURSE,
  formatGoldValue,
  formatPurse,
  purseEntries,
  type Purse,
} from "../../services/currency";
import { errorMessage } from "../../lib/errors";
import "./inventory.css";

/**
 * One page holding both inventories: the viewer's own pack as the main table,
 * the party's hoard as a rail beside it, and the one operation neither list
 * could do on its own — moving a stack from one to the other.
 *
 * Replaces PartyInventory, at the same route, and takes the gear panel off the
 * character sheet on the way. The sheet keeps identity and spells; what you
 * carry is now half of a page about carrying things rather than a panel three
 * scrolls down a page about who you are.
 *
 * Both halves are Take and Stow away from each other and nothing else: no
 * quantity picker (one stack at a time — 038 argues it), no drag and drop, and
 * no give-to-another-player, which is the Party page's control and already
 * exists.
 */
export function Inventory() {
  // Non-null by construction — this route sits under CampaignLayout, which has
  // already resolved :campaignId against the campaigns this user can see.
  const campaign = useCampaign();
  const { data: character, isLoading, error, adjustCurrency } = useCharacter(campaign.id);

  // Only the character query gates the page. The two lists below carry their own
  // loading and error states, so a slow hoard does not hold up the pack and a
  // failed one costs the rail rather than the page — the same split Home makes
  // for its bands.
  if (isLoading) return <p>Consulting the ledger...</p>;
  if (error) return <p>Couldn't load your character: {error.message}</p>;

  return (
    // One wrapper, because inventory.css scopes its palette to `.inv` the way
    // character.css scopes its own to `.ch` — those custom properties are not on
    // :root, so a panel rendered outside this element would lose every colour.
    <div className="inv">
      <p className="inv-eyebrow">— What You Carry —</p>
      <h1 className="inv-title">Inventory</h1>
      <p className="inv-sub">
        {character
          ? `${character.name}'s pack. Yours to spend — and the DM's to fill.`
          : "The party's hoard is below. Your own pack begins with a character."}
      </p>

      {/* Pack first in the DOM as well as on screen, so the page reads "yours,
          then the party's" to a screen reader too. */}
      <div className="inv-columns">
        {character ? (
          <MyPack character={character} adjustCurrency={adjustCurrency} />
        ) : (
          <NoCharacter />
        )}
        <Hoard campaignId={campaign.id} characterId={character?.id} />
      </div>
    </div>
  );
}

// One purse control, used at the head of both columns: a total plus a
// denomination picker, an amount, and Add/Spend. `onAdjust` is the only thing
// that differs between the two calls — MyPack passes useCharacter's
// adjustCurrency (owner-only, enforced by RLS, not by this component), Hoard
// passes usePartyCurrency's (any campaign member) — so the control itself
// doesn't know or care which purse it's spending from.
//
// `colored` is the one other difference, and it's cosmetic, not behavioral:
// Home.tsx's dashboard already breaks the party's hoard out by denomination
// colour, and Hoard passes true so this rail's total matches it. MyPack
// leaves it off — an individual purse reads fine as one flat gold line, the
// same way Character.tsx and Party.tsx still show it.
//
// Add and Spend are two buttons rather than one signed amount, matching this
// page's other verbs (Take/Stow, +/−1): the amount field only ever holds a
// positive number, and which button was pressed decides the sign.
function PurseWidget({
  purse,
  onAdjust,
  colored = false,
}: {
  purse: Purse;
  onAdjust: (denomination: Denomination, delta: number) => Promise<number>;
  colored?: boolean;
}) {
  const [denomination, setDenomination] = useState<Denomination>("gold");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = Number.parseInt(amount, 10);
  const validAmount = Number.isInteger(parsedAmount) && parsedAmount > 0;

  async function handleAdjust(sign: 1 | -1) {
    if (!validAmount) return;

    setBusy(true);
    setError(null);
    try {
      await onAdjust(denomination, sign * parsedAmount);
      setAmount("");
    } catch (err) {
      console.error("Problem adjusting currency:", err);
      setError(errorMessage(err, "Couldn't update the purse"));
    } finally {
      setBusy(false);
    }
  }

  const entries = purseEntries(purse);

  return (
    <div className="inv-purse">
      <p className="inv-purse__total">
        {!colored
          ? formatPurse(purse)
          : entries.length === 0
            ? <span className="inv-purse__coins-empty">empty</span>
            : entries.map(({ denomination, amount, unit }, i) => (
                <span key={denomination}>
                  {i > 0 && <span className="inv-purse__coins-sep"> · </span>}
                  <span className={`inv-coin inv-coin--${denomination}`}>
                    {amount} {unit}
                  </span>
                </span>
              ))}
      </p>
      <p className="inv-purse__value">Gold Value: {formatGoldValue(purse)}</p>
      <div className="inv-purse__form">
        <select
          value={denomination}
          onChange={(e) => setDenomination(e.target.value as Denomination)}
          disabled={busy}
          aria-label="Denomination"
        >
          <option value="platinum">pp</option>
          <option value="gold">gp</option>
          <option value="electrum">ep</option>
          <option value="silver">sp</option>
          <option value="copper">cp</option>
        </select>
        <input
          className="inv-purse__amount"
          type="number"
          min="1"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={busy}
          placeholder="amount"
          aria-label="Amount"
        />
        <button
          className="inv-button"
          type="button"
          onClick={() => handleAdjust(1)}
          disabled={busy || !validAmount}
        >
          Add
        </button>
        <button
          className="inv-button"
          type="button"
          onClick={() => handleAdjust(-1)}
          disabled={busy || !validAmount}
        >
          Spend
        </button>
      </div>
      {error && <span className="inv-error">{error}</span>}
    </div>
  );
}

// The pack: what this character is carrying. Writable by the owner OR the
// campaign's DM — the widening 028's can_edit_character exists for. Nothing here
// checks which one you are: RLS is the enforcement layer, and a forbidden write
// comes back as an error the row reports, exactly as everywhere else in this app.
//
// Character.tsx's CharacterGear, moved here with a search over the entries and a
// Stow button on each row.
function MyPack({
  character,
  adjustCurrency,
}: {
  character: CharacterModel;
  adjustCurrency: (denomination: Denomination, delta: number) => Promise<number>;
}) {
  const campaign = useCampaign();
  const {
    data: entries = [],
    isLoading,
    error,
    addItem,
    decrementItem,
    removeItem,
  } = useCharacterInventory(character.id);
  const { data: items = [] } = useItems(campaign.id);
  const { stow } = useInventoryTransfer(campaign.id, character.id);

  const [itemId, setItemId] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // No matchesFilter: a pack has no kinds worth filtering, and the hook defaults
  // to "everything matches", so the filter half simply goes unused.
  const { setSearch, filtered } = useSearchBar(entries);

  async function handleAdd(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!itemId) return;

    setAdding(true);
    setAddError(null);
    try {
      await addItem(itemId);
      setItemId("");
    } catch (err) {
      console.error("Problem adding item to character:", err);
      setAddError(errorMessage(err, "Couldn't add that item"));
    } finally {
      setAdding(false);
    }
  }

  if (isLoading) return <p className="inv-panel">Loading your pack...</p>;
  if (error)
    return <p className="inv-panel">Couldn't load your pack: {error.message}</p>;

  return (
    <div className="inv-panel">
      {/* The count is entries.length, not filtered.length: it says how much this
          character carries, which a search should not change. */}
      <h3 className="inv-section">
        Carried
        <span className="inv-section__count">{entries.length} stacks</span>
      </h3>

      <PurseWidget purse={character} onAdjust={adjustCurrency} />

      <form className="inv-add" onSubmit={handleAdd}>
        <select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          disabled={adding}
        >
          <option value="">Choose an item...</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button className="inv-button" type="submit" disabled={adding || !itemId}>
          {adding ? "Adding..." : "Add"}
        </button>
        {/* Enter is swallowed here, and it has to be. The search shares the
            .inv-add row with the picker, so it is inside the <form>, and a text
            input in a form with a submit button means Enter implicitly submits
            — typing a name and pressing Enter to "search" would silently add
            whatever the select happened to be holding. Filtering is live on
            change, so Enter has nothing to do and losing it costs nothing. */}
        <input
          className="inv-search"
          type="text"
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          placeholder="Search your pack"
        />
        {addError && <span className="inv-error">{addError}</span>}
      </form>

      {entries.length === 0 ? (
        <p className="inv-empty">They carry nothing yet.</p>
      ) : (
        <table className="inv-table">
          <tbody>
            {filtered.map((entry) => (
              <PackRow
                key={entry.entryId}
                entry={entry}
                onStow={stow}
                onDecrement={decrementItem}
                onRemove={removeItem}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// One row owning its own action state, the shape every list in this app uses: a
// failure reports beside the stack it happened to rather than as one page-level
// message that can't say which. `busy` covers all three buttons — you only do
// one thing to a row at a time, and it stops a double-click firing two transfers
// at one stack, which is the write where that would actually cost something.
function PackRow({
  entry,
  onStow,
  onDecrement,
  onRemove,
}: {
  entry: CharacterInventoryEntry;
  onStow: (entryId: string) => Promise<void>;
  onDecrement: (entryId: string) => Promise<void>;
  onRemove: (entryId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No confirm on Stow. window.confirm on a reversible move is noise, and the
  // button facing it across the page is the undo — Take puts it straight back.
  async function handleStow() {
    setBusy(true);
    setError(null);
    try {
      await onStow(entry.entryId);
      // On success the hook invalidates both lists: this row either re-renders
      // at quantity - 1, or — at the last one — unmounts, since the database
      // deletes the stack at zero. setBusy in `finally` re-enables the first
      // case; on the second it's a harmless no-op.
    } catch (err) {
      console.error("Problem stowing item to the party:", err);
      setError(errorMessage(err, "Couldn't stow this item"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDecrement() {
    setBusy(true);
    setError(null);
    try {
      await onDecrement(entry.entryId);
    } catch (err) {
      console.error("Problem updating character item:", err);
      setError(errorMessage(err, "Couldn't update this item"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    // Confirm here and nowhere else on this row: this trashes the whole stack at
    // once and nothing on the page puts it back.
    if (!window.confirm(`Remove ${entry.name} from this character?`)) return;

    setBusy(true);
    setError(null);
    try {
      await onRemove(entry.entryId);
    } catch (err) {
      console.error("Problem removing character item:", err);
      setError(errorMessage(err, "Couldn't remove this item"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>
        {entry.name}
        {/* The reason added_by is written at all: on a shared sheet it is the
            difference between what a player picked up and what the DM handed
            them. Null for entries whose adder's profile is gone. */}
        {entry.addedByName && (
          <span className="inv-byline">from {entry.addedByName}</span>
        )}
      </td>
      <td className="inv-qty">×{entry.quantity}</td>
      <td className="inv-actions">
        <button
          className="inv-move"
          onClick={handleStow}
          disabled={busy}
          title="Move one to the party's hoard"
          aria-label={`Stow one ${entry.name} in the party's hoard`}
        >
          Stow
        </button>
        <button
          className="inv-button"
          onClick={handleDecrement}
          disabled={busy}
          title="Use one"
          aria-label={`Use one ${entry.name}`}
        >
          −1
        </button>
        <button
          className="inv-button inv-button--danger"
          onClick={handleRemove}
          disabled={busy}
          title="Remove from this character"
          aria-label={`Remove ${entry.name} from this character`}
        >
          Remove
        </button>
        {error && <span className="inv-error">{error}</span>}
      </td>
    </tr>
  );
}

// The party's shared pile, at rail scale. No isDm gate on the list itself: 021's
// policies are is_campaign_member for read and for every mutation, so every
// player at the table shares this hoard.
//
// What did NOT survive the narrowing from the old full-width page: the four
// filter chips and the "select an item to inspect it" quote. Both need width
// this column does not have, and the search covers the chips' job on a list this
// size. If the chips come back they belong behind the "Open the full hoard"
// link, not squeezed in here.
function Hoard({
  campaignId,
  characterId,
}: {
  campaignId: string;
  characterId?: string;
}) {
  const campaign = useCampaign();
  const { previewing } = usePlayerPreview();
  // Nothing else on this page is reveal-gated — gear has no is_revealed and
  // never has — so this exists for exactly one line: the forge link at the foot
  // of the rail. Maps and NPC define it the same way for the same reason.
  const showDmUi = campaign.isDm && !previewing;
  const {
    data: entries = [],
    isLoading,
    error,
    decrementItem,
    removeItem,
  } = usePartyInventory(campaignId);
  const { take } = useInventoryTransfer(campaignId, characterId);
  // Soft-fetched, Home.tsx's `party` treatment: not in the isLoading/error gate
  // below, so a slow or failed currency read costs only the widget, not the
  // whole rail — the rest of the hoard has nothing to do with the pool's gold.
  const { data: currency = EMPTY_PURSE, adjustCurrency } = usePartyCurrency(campaignId);

  // Held by entryId, not the entry object — the list refetches after every
  // decrement, remove and transfer, replacing every entry object, so a card
  // pinned to one would show a stale stack (or one that has since been emptied).
  // entryId rather than the item's id because the two are only one-to-one since
  // 031, and this outliving that would be a silent bug.
  const [panelId, setPanelId] = useState<string | null>(null);
  const { setSearch, filtered } = useSearchBar(entries);

  if (isLoading) return <p className="inv-panel inv-rail">Loading the hoard...</p>;
  if (error)
    return (
      <p className="inv-panel inv-rail">Couldn't load the hoard: {error.message}</p>
    );

  const panel = entries.find((entry) => entry.entryId === panelId) ?? null;

  return (
    <aside className="inv-panel inv-rail">
      <h3 className="inv-rail__head">
        The Party's Hoard
        <span className="inv-rail__count">{entries.length}</span>
      </h3>

      <PurseWidget purse={currency} onAdjust={adjustCurrency} colored />

      <input
        className="inv-search"
        type="text"
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search the hoard"
      />

      {/* Click-outside backdrop, the same shape Shop and the spell panel use.
          inventory.css only promotes it to a fixed overlay while it has a child,
          so with nothing selected it stays an inert empty div; the card itself
          stops propagation so clicking inside doesn't dismiss it. */}
      <div className="inv-backdrop" onClick={() => setPanelId(null)}>
        {panel && (
          // No footer: an item already in the party's hoard has nothing to add.
          // Shop is the page that passes the Add button; here the card is
          // read-only and the controls live on the rows.
          <ItemDetailCard
            key={panel.entryId}
            item={panel}
            onClose={() => setPanelId(null)}
          />
        )}
      </div>

      {entries.length === 0 ? (
        <p className="inv-empty">The party carries nothing yet.</p>
      ) : (
        <div>
          {filtered.map((entry) => (
            <HoardRow
              key={entry.entryId}
              entry={entry}
              canTake={!!characterId}
              onInspect={() => setPanelId(entry.entryId)}
              onTake={take}
              onDecrement={decrementItem}
              onRemove={removeItem}
            />
          ))}
        </div>
      )}

      {/* The only place New Item still surfaces from this page — the old full
          page had no link to it either, but the rail is where a DM now stands
          when they notice the hoard is missing something.

          showDmUi, not campaign.isDm: an authoring door is a DM affordance, and
          preview hides those. CreateItem's own route guard stays on bare isDm,
          so a DM already standing on that page is not thrown off it mid-draft. */}
      {showDmUi && (
        <p className="inv-rail__foot">
          <Link to="../CreateItem">Forge a new item</Link>
        </p>
      )}
    </aside>
  );
}

// PackRow's shape at rail scale, with Take where Stow sits on the other side.
// The name is a button because reading what an item does is most of why the pile
// is on screen — the row is a link into the card, not just a label with controls
// beside it.
function HoardRow({
  entry,
  canTake,
  onInspect,
  onTake,
  onDecrement,
  onRemove,
}: {
  entry: PartyInventoryEntry;
  canTake: boolean;
  onInspect: () => void;
  onTake: (entryId: string) => Promise<void>;
  onDecrement: (entryId: string) => Promise<void>;
  onRemove: (entryId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTake() {
    setBusy(true);
    setError(null);
    try {
      await onTake(entry.entryId);
    } catch (err) {
      console.error("Problem taking item from the hoard:", err);
      setError(errorMessage(err, "Couldn't take this item"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDecrement() {
    setBusy(true);
    setError(null);
    try {
      await onDecrement(entry.entryId);
    } catch (err) {
      console.error("Problem updating party item:", err);
      setError(errorMessage(err, "Couldn't update this item"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm(`Remove ${entry.name} from the party's inventory?`))
      return;

    setBusy(true);
    setError(null);
    try {
      await onRemove(entry.entryId);
    } catch (err) {
      console.error("Problem removing party item:", err);
      setError(errorMessage(err, "Couldn't remove this item"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inv-rail__row">
      <div className="inv-rail__line">
        <button className="inv-rail__name" onClick={onInspect}>
          {entry.name}
        </button>
        <span className="inv-rail__qty">×{entry.quantity}</span>
      </div>
      <span className="inv-rail__kind">{entry.kind}</span>
      <div className="inv-rail__actions">
        {/* Disabled rather than hidden when there is no character: the control
            is the answer to "how do I get this", and hiding it would leave the
            question unasked. useInventoryTransfer throws on the same condition,
            so this is the courtesy and not the guard. */}
        <button
          className="inv-move"
          onClick={handleTake}
          disabled={busy || !canTake}
          title={canTake ? "Move one to your pack" : "Roll up a character first"}
          aria-label={`Take one ${entry.name} into your pack`}
        >
          Take
        </button>
        <button
          className="inv-button"
          onClick={handleDecrement}
          disabled={busy}
          title="Use one"
          aria-label={`Use one ${entry.name}`}
        >
          −1
        </button>
        <button
          className="inv-button inv-button--danger"
          onClick={handleRemove}
          disabled={busy}
          title="Remove from inventory"
          aria-label={`Remove ${entry.name} from inventory`}
        >
          Remove
        </button>
        {error && <span className="inv-error">{error}</span>}
      </div>
    </div>
  );
}

// The pack column with nothing in it: the Character page's own invitation rather
// than an empty table, so the two pages say the same thing about the same state.
//
// This is also what a DM sees, and it is honest — a DM has no character in this
// campaign, so they have no pack. Giving a DM a player-picker here is a real
// design question and deliberately not answered yet.
function NoCharacter() {
  return (
    <div className="inv-panel inv-none">
      <p>
        No one of yours walks Barovia yet. Name them, and the mists will take
        note.
      </p>
      <Link to="../Character">Roll one up</Link>
    </div>
  );
}
