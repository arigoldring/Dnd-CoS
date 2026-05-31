import { useState } from "react";
import { ITEMS, Item } from "./services/items";
import "./shop.css";
import { Link } from "react-router-dom";
import { useSearchBar } from "./Hooks/Searchbar";

export function Shop() {
  const [panel, setPanel] = useState<Item | null>(null);
  const { filter, setFilter, setSearch, filtered } = useSearchBar(ITEMS);
  function displayPanel(item: Item) {
    setPanel(item);
  }

  function createTable() {
    return (
      <table>
        <tbody>
          {filtered.map((item: Item) => (
            <tr key={item.name}>
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
      <Link to="/">
        <button>Home</button>
      </Link>
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
      <textarea
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search for an item"
      ></textarea>
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
