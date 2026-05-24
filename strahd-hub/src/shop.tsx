import { useState } from "react";
import { ITEMS, Item } from "./utilities/items";

export function Shop() {
  const [panel, setPanel] = useState<Item | null>(null);
  function displayPanel(item: Item) {
    setPanel(item);
  }
  function createTable() {
    return (
      <table>
        <tbody>
          {ITEMS.map((item: Item) => (
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
        <p>Converstion Ratio</p>
      </div>
      <div>
        {createTable()}
        {panel && (
          <div>
            Item selected: {panel.name}
            <p>{panel.description}</p>
          </div>
        )}
      </div>
    </>
  );
}
