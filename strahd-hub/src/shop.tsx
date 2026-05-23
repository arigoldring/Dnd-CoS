import { useState } from "react";
export function Shop() {
  const [panel, setPanel] = useState<string | null>(null);
  const ITEMS = [
    { name: "Sword", price: 10 },
    { name: "Shield", price: 15 },
    { name: "Potion", price: 5 },
  ];
  function createTable() {
    return (
      <table>
        <tbody>
          {ITEMS.map((item: { name: string; price: number }) => (
            <tr key={item.name}>
              <td>{item.name}</td>
              <td>{item.price} gold</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return <div>{createTable()}</div>;
}
