import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useItems } from "../../hooks/useItems";
import { Item } from "../../services/items";
import { useCampaign } from "../../components/CampaignLayout";
import { addToPartyInventory } from "../../services/partyInventory";
import { errorMessage } from "../../lib/errors";
import { ItemDetailCard } from "../../components/ItemDetailCard";
import { useSearchBar } from "../../hooks/useSearchBar";
import "./shop.css";

export function Shop() {
  const { data: items = [], isLoading: loading, error } = useItems();
  // The campaign in the URL, resolved by CampaignLayout above this route. The
  // catalog itself is global (useItems), but adding to a party's inventory is
  // scoped to one campaign — this is where that scope comes from.
  const campaign = useCampaign();
  // The open item is held by id, not as the Item itself — same as Maps holds a
  // location id. Storing the object would leave `panel` pointing at whichever
  // object was in the list at click time, so a later edit or refetch (which
  // replaces the row with a new object) would show a stale card beside a fresh
  // table row, and a delete would leave a card for an item that's gone.
  const [panelId, setPanelId] = useState<string | null>(null);
  const { filter, setFilter, setSearch, filtered } = useSearchBar(
    items,
    (item, filter) => item.kind === filter,
  );
  if (loading) return <p>Loading Items...</p>;
  if (error) return <p>Couldn't load items: {error.message}</p>;
  const panel = items.find((item) => item.id === panelId) ?? null;

  function createTable() {
    return (
      <table>
        <tbody>
          {filtered.map((item: Item) => (
            <tr key={item.id}>
              <td>
                <button onClick={() => setPanelId(item.id)}>{item.name}</button>
              </td>
              <td>{item.price} gold</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <>
      <p className="shop-eyebrow">— Village of Barovia —</p>
      <h1 className="shop-title">Bildrath's Mercantile</h1>
      {/* shop.css styles these children positionally, not by class:
          .shop > div:nth-of-type(1) is the filter row, (2) the detail overlay,
          (3) the item list, and .shop > input is the search box. Reordering,
          wrapping, or inserting a sibling div silently restyles the page. */}
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
          placeholder="Search for an item"
        ></input>
        {/* Click-outside backdrop. shop.css only promotes this to a fixed
            full-screen overlay while it actually has a child (:has(> div)), so
            with no item selected it stays an inert empty div. The card itself
            stops propagation so clicking inside it doesn't dismiss itself. */}
        <div onClick={() => setPanelId(null)}>
          {panel && (
            <ItemDetailCard
              // key by id so switching items remounts the card, which resets the
              // Add button's per-item state instead of carrying "Added" across.
              key={panel.id}
              item={panel}
              onClose={() => setPanelId(null)}
              footer={
                <AddToPartyInventory
                  campaignId={campaign.id}
                  itemId={panel.id}
                />
              }
            />
          )}
        </div>
        {!panel && (
          <p className="item-detail-empty">
            "Looking to arm yourself, are you? Mind the mist on your way out."
            <span className="sub">— select an item to inspect it —</span>
          </p>
        )}
        <div>{createTable()}</div>
      </div>
    </>
  );
}

// The one place a Shop item crosses into a campaign's shared loot. Calls the
// service directly rather than usePartyInventory — Shop neither owns nor shows
// that list, and mounting the list hook here would fetch it for nobody — but
// it must still invalidate the list's cache entry: useQueryClient reaches the
// cache without mounting a query, and invalidating an inactive query only
// marks it stale (no fetch), so an add here costs nothing yet still shows up
// in Inventory even once partyInventory gets a nonzero staleTime.
function AddToPartyInventory({
  campaignId,
  itemId,
}: {
  campaignId: string;
  itemId: string;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setAdding(true);
    setError(null);
    try {
      await addToPartyInventory(campaignId, itemId);
      queryClient.invalidateQueries({
        queryKey: ["partyInventory", campaignId],
      });
      setAdded(true);
    } catch (err) {
      console.error("Problem adding to party inventory:", err);
      setError(errorMessage(err, "Couldn't add this to the party's inventory"));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="item-detail-add-row">
      <button className="item-detail-add" onClick={handleAdd} disabled={adding}>
        {adding
          ? "Adding..."
          : added
            ? "Add another"
            : "Add to party inventory"}
      </button>
      {/* "Add another" and a note, rather than a disabled button, because a
          second add is a real if uncommon action: there's no unique constraint
          on (campaign, item), so each click files another stack. This label is
          honest about what the service does today — see addToPartyInventory. */}
      {added && !error && (
        <span className="item-detail-add-note">
          Added to the party's inventory.
        </span>
      )}
      {error && <span className="item-detail-add-error">{error}</span>}
    </div>
  );
}
