import { useState } from "react";
import { ITEMS, Item } from "./utilities/items";

export function Shop() {
  const [panel, setPanel] = useState<Item | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  function displayPanel(item: Item) {
    setPanel(item);
  }
  function handleSearch(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setSearch(e.target.value);
  }
  function createTable(items: Item[]) {
    const filtered = items
      .filter((item: Item) => filter === "" || item.tags.includes(filter))
      .filter((item: Item) =>
        item.name.toLowerCase().includes(search.toLowerCase()),
      );

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
    <>
      <div>
        <p>Filters</p>
        <button onClick={() => setFilter("")}>All</button>
        <button onClick={() => setFilter("armor")}>Armor</button>
        <button onClick={() => setFilter("weapon")}>Weapons</button>
      </div>
      <textarea
        onChange={handleSearch}
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
      <div>{createTable(ITEMS)}</div>
    </>
  );
}
