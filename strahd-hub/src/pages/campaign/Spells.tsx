import { useState } from "react";
import { useSearchBar } from "../../hooks/useSearchBar";
import { useSpells } from "../../hooks/useSpells";
import type { Spell } from "../../services/spells";

export function Spells() {
  const { spells, loading, error } = useSpells();
  const [levelFilter, setLevelFilter] = useState<number | null>(null);
  const { setSearch, filtered } = useSearchBar(
    spells,
    (spell) =>
      levelFilter === null || spell.level === levelFilter,
  );

  if (loading) return <p>Loading spells...</p>;
  if (error) return <p>Couldn't load spells: {error}</p>;

  function createSpellTable() {
    return (
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Level</th>
            <th>School</th>
            <th>Casting Time</th>
            <th>Duration</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((spell: Spell) => (
            <tr key={spell.id}>
              <td>{spell.name}</td>
              <td>{spell.level === 0 ? "Cantrip" : spell.level}</td>
              <td>{spell.school}</td>
              <td>{spell.castingTime}</td>
              <td>{spell.duration}</td>
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
      <div>
        <p>Level Filter</p>
        <button
          className={levelFilter === null ? "active" : ""}
          onClick={() => setLevelFilter(null)}
        >
          All
        </button>
        <button
          className={levelFilter === 0 ? "active" : ""}
          onClick={() => setLevelFilter(0)}
        >
          Cantrips
        </button>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => (
          <button
            key={level}
            className={levelFilter === level ? "active" : ""}
            onClick={() => setLevelFilter(level)}
          >
            {level}
          </button>
        ))}
      </div>
      <input
        type="text"
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search for a spell"
      />
      {createSpellTable()}
    </div>
  );
}
