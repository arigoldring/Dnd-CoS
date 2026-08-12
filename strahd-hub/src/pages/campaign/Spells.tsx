import { useState } from "react";
import { useSearchBar } from "../../hooks/useSearchBar";
import { useSpells } from "../../hooks/useSpells";
import { useCampaign } from "../../components/CampaignLayout";
import type { Spell } from "../../services/spells";
import "./spells.css";

export function Spells() {
  // Resolved by CampaignLayout above this route; scopes the grimoire to shared
  // SRD plus this campaign's homebrew, same as the Shop's catalog.
  const campaign = useCampaign();
  const { data: spells = [], isLoading: loading, error } = useSpells(campaign.id);
  const [levelFilter, setLevelFilter] = useState<number | null>(null);
  const { setSearch, filtered: searchFiltered } = useSearchBar(spells);
  const filtered = searchFiltered.filter(
    (spell) => levelFilter === null || spell.level === levelFilter,
  );

  if (loading) return <p>Loading spells...</p>;
  if (error) return <p>Couldn't load spells: {error.message}</p>;

  function createSpellTable() {
    return (
      <table className="spells">
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
              <td>
                {spell.name}
                {spell.concentration && <span className="spell-tag">conc</span>}
                {spell.ritual && <span className="spell-tag">ritual</span>}
              </td>
              <td className="spell-level">{spell.level === 0 ? "–" : spell.level}</td>
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
    <div className="spells">
      <div className="spells__head">
        <div>
          <p className="spells__eyebrow">🔮 The Grimoire 🔮</p>
          <h1>Spells</h1>
        </div>
        <input
          className="spells__search"
          type="text"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search for a spell"
        />
      </div>

      <div className="spells__filters">
        <p className="spells__filters-label">Level</p>
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
        <span className="spells__count">
          {filtered.length} of {spells.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="spells__empty">Nothing by that name in the book.</p>
      ) : (
        createSpellTable()
      )}
    </div>
  );
}
