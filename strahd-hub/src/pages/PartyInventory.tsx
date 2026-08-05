import { useState } from "react";
import { useCampaign } from "../components/CampaignLayout";
import { usePartyInventory } from "../hooks/usePartyInventory";
import { PartyInventoryEntry } from "../services/partyInventory";
import { ItemDetailCard } from "../components/ItemDetailCard";
import { useSearchBar } from "../hooks/useSearchBar";
import { errorMessage } from "../lib/errors";
import "./shop.css";
import "./partyInventory.css";

export function PartyInventory() {
  // Non-null by construction — this route sits under CampaignLayout, which has
  // already resolved :campaignId against the campaigns this user can see. The
  // loot list is scoped to it. No isDm gate: 021's policies are is_campaign_member
  // for read and every mutation, so every player at the table shares this pile.
  const campaign = useCampaign();
  const { entries, loading, error, decrementItem, removeItem } =
    usePartyInventory(campaign.id);

  // Held by entryId, not the entry object — same reason Shop holds panelId, and
  // it bites harder here: the list refetches after every decrement/remove,
  // replacing every entry object, so a panel pinned to an object would show a
  // stale card (or one for a stack that's since been emptied). entryId, not the
  // item's id, because the same item can appear as several stacks.
  const [panelId, setPanelId] = useState<string | null>(null);
  const { filter, setFilter, setSearch, filtered } = useSearchBar(
    entries,
    (entry, filter) => entry.kind === filter,
  );

  if (loading) return <p>Loading inventory...</p>;
  if (error) return <p>Couldn't load party inventory: {error}</p>;

  const panel = entries.find((entry) => entry.entryId === panelId) ?? null;

  return (
    <>
      <p className="shop-eyebrow">— The Party's Hoard —</p>
      <h1 className="shop-title">Party Inventory</h1>
      {/* Same positional-CSS contract as Shop: shop.css styles .shop's children
          by nth-of-type, NOT by class — (1) filter row, (2) detail overlay, (3)
          the list, plus the search input. Keep these four in this order. The
          decrement/remove controls live inside the table cells, so they add no
          top-level sibling and don't shift that counting. */}
      <div className="shop">
        <div>
          <p>Filters</p>
          <button
            className={filter === "" ? "active" : ""}
            onClick={() => setFilter("")}
          >
            All
          </button>
          <button
            className={filter === "general" ? "active" : ""}
            onClick={() => setFilter("general")}
          >
            general
          </button>
          <button
            className={filter === "armor" ? "active" : ""}
            onClick={() => setFilter("armor")}
          >
            Armor
          </button>
          <button
            className={filter === "weapon" ? "active" : ""}
            onClick={() => setFilter("weapon")}
          >
            Weapons
          </button>
        </div>
        <input
          type="text"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search the hoard"
        ></input>
        {/* Click-outside backdrop, same as Shop: shop.css only promotes this to
            a full-screen overlay while it has a child, so an empty selection
            leaves it inert. The card stops propagation so a click inside it
            doesn't dismiss itself. */}
        <div onClick={() => setPanelId(null)}>
          {panel && (
            // No footer: an item already in the party's inventory has nothing to
            // add. Shop is the page that passes the Add button; here the card is
            // read-only and the decrement/remove controls live on the rows.
            <ItemDetailCard
              key={panel.entryId}
              item={panel}
              onClose={() => setPanelId(null)}
            />
          )}
        </div>
        {!panel && (
          <p className="item-detail-empty">
            "What the party has hauled out of the mists — spend it wisely."
            <span className="sub">— select an item to inspect it —</span>
          </p>
        )}
        <div>
          {entries.length === 0 ? (
            <p className="pi-empty">The party carries nothing yet.</p>
          ) : (
            <table>
              <tbody>
                {filtered.map((entry) => (
                  <InventoryRow
                    key={entry.entryId}
                    entry={entry}
                    onInspect={() => setPanelId(entry.entryId)}
                    onDecrement={decrementItem}
                    onRemove={removeItem}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

// One row, owning its own action state the way RecapCard owns its delete state:
// a failed decrement or remove reports next to the stack it happened on, not as
// one page-level message that can't say which. `busy` disables both buttons —
// one flag, because you only ever do one thing to a row at a time, and it stops
// a double-click firing two writes at the same entry.
function InventoryRow({
  entry,
  onInspect,
  onDecrement,
  onRemove,
}: {
  entry: PartyInventoryEntry;
  onInspect: () => void;
  onDecrement: (entryId: string, currentQuantity: number) => Promise<void>;
  onRemove: (entryId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDecrement() {
    setBusy(true);
    setError(null);
    try {
      await onDecrement(entry.entryId, entry.quantity);
      // On success the hook refetches: this row either re-renders at
      // quantity - 1, or — at the last one — unmounts, since the service deletes
      // the stack at zero. setBusy in `finally` re-enables the first case; on
      // the second it's a harmless no-op (React 19 doesn't warn on unmount).
    } catch (err) {
      console.error("Problem updating party item:", err);
      setError(errorMessage(err, "Couldn't update this item"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    // Confirm here but not on decrement: this trashes the whole stack at once,
    // the destructive sibling of "used one". Matches RecapCard's delete guard.
    if (!window.confirm(`Remove ${entry.name} from the party's inventory?`))
      return;

    setBusy(true);
    setError(null);
    try {
      await onRemove(entry.entryId);
      // Success unmounts this row when the refetch lands; nothing to reset that
      // the user will see.
    } catch (err) {
      console.error("Problem removing party item:", err);
      setError(errorMessage(err, "Couldn't remove this item"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>
        <button onClick={onInspect}>{entry.name}</button>
      </td>
      <td className="pi-qty">×{entry.quantity}</td>
      <td className="pi-actions">
        <button
          className="pi-action"
          onClick={handleDecrement}
          disabled={busy}
          title="Use one"
          aria-label={`Use one ${entry.name}`}
        >
          −1
        </button>
        <button
          className="pi-action pi-action--danger"
          onClick={handleRemove}
          disabled={busy}
          title="Remove from inventory"
          aria-label={`Remove ${entry.name} from inventory`}
        >
          Remove
        </button>
        {error && <span className="pi-error">{error}</span>}
      </td>
    </tr>
  );
}
