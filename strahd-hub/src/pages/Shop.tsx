import { useState } from "react";
import { useItems } from "../Hooks/useItems";
import { Item } from "../services/items";
import "./shop.css";
import { useSearchBar } from "../Hooks/Searchbar";

export function Shop() {
  const { items, loading, error } = useItems();
  const [panel, setPanel] = useState<Item | null>(null);
  const { filter, setFilter, setSearch, filtered } = useSearchBar(items);
  if (loading) return <p>Loading Items...</p>;
  if (error) return <p>Couldn't load items: {error}</p>;
  function displayPanel(item: Item) {
    setPanel(item);
  }

  function createTable() {
    return (
      <table>
        <tbody>
          {filtered.map((item: Item) => (
            <tr key={item.id}>
              <td>
                <button onClick={() => displayPanel(item)}>{item.name}</button>
              </td>
              <td>{item.price} gold</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <div className="shop">
      <div>
        <p>Filters</p>
        <button
          className={filter === "" ? "active" : ""}
          onClick={() => setFilter("")}
        >
          All
        </button>
        <button onClick={() => setFilter("armor")}>Armor</button>
        <button onClick={() => setFilter("weapon")}>Weapons</button>
      </div>
      <input
        type="text"
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search for an item"
      ></input>
      <div>
        {panel && (
          <div>
            Item selected: {panel.name}
            <p>{panel.description}</p>
          </div>
        )}
      </div>
      <div>{createTable()}</div>
    </div>
  );
}
