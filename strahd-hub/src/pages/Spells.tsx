import { useSearchBar } from "../Hooks/Searchbar";
import { SPELLS } from "../services/spells";
import { Spell } from "../services/spells";

export function Spells() {
  const { setSearch, filtered } = useSearchBar(SPELLS);
  function createSpellTable() {
    return (
      <table>
        <tbody>
          {filtered.map((spell: Spell) => (
            <tr key={spell.name}>
              <td>{spell.name}</td>
              <td>{spell.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <div>
      <h1>Spells</h1>
      <textarea
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search for an spell"
      ></textarea>
      {createSpellTable()}
    </div>
  );
}
