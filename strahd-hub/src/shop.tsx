import { useState } from "react";
export function Shop() {
  const [panel, setPanel] = useState<string | null>(null);

  return (
    <div>
      <h1>Shop</h1>
      <table>
        <tr>
          <th>Item</th>
          <th>Price</th>
        </tr>
        <tr>
          <td>
            <a href="">Sword</a>
          </td>
          <td>10 gold</td>
        </tr>
        <tr>
          <td>Shield</td>
          <td>15 gold</td>
        </tr>
      </table>
    </div>
  );
}
