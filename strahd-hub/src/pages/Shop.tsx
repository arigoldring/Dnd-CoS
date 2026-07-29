import { useState } from "react";
import { useItems } from "../hooks/useItems";
import { Item } from "../services/items";
import "./shop.css";
import { useSearchBar } from "../hooks/useSearchBar";

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// One row per fact worth showing in the detail panel. Kind-specific so a
// GeneralItem just renders an empty list instead of "N/A" filler.
function itemStats(item: Item): { label: string; value: string }[] {
  switch (item.kind) {
    case "weapon": {
      const stats = [
        { label: "Type", value: `${capitalize(item.category)} weapon` },
        { label: "Damage", value: `${item.damageDice} ${item.damageType}` },
      ];
      if (item.properties.length > 0) {
        stats.push({
          label: "Properties",
          value: item.properties.map(capitalize).join(", "),
        });
      }
      if (item.versatileDice) {
        stats.push({ label: "Versatile", value: item.versatileDice });
      }
      if (item.rangeNormal) {
        stats.push({
          label: "Range",
          value: item.rangeLong
            ? `${item.rangeNormal}/${item.rangeLong} ft.`
            : `${item.rangeNormal} ft.`,
        });
      }
      return stats;
    }
    case "armor": {
      const stats = [
        { label: "Type", value: `${capitalize(item.category)} armor` },
        { label: "Armor Class", value: `${item.baseArmorClass}` },
      ];
      if (item.strengthRequirement) {
        stats.push({
          label: "Strength Required",
          value: `${item.strengthRequirement}`,
        });
      }
      if (item.stealthDisadvantage) {
        stats.push({ label: "Stealth", value: "Disadvantage" });
      }
      return stats;
    }
    case "general":
      return [];
  }
}

export function Shop() {
  const { items, loading, error } = useItems();
  const [panel, setPanel] = useState<Item | null>(null);
  const { filter, setFilter, setSearch, filtered } = useSearchBar(
    items,
    (item, filter) => item.kind === filter,
  );
  if (loading) return <p>Loading Items...</p>;
  if (error) return <p>Couldn't load items: {error}</p>;
  const stats = panel ? itemStats(panel) : [];
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
    <>
      <p className="shop-eyebrow">— Village of Barovia —</p>
      <h1 className="shop-title">Bildrath's Mercantile</h1>
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
        <div onClick={() => setPanel(null)}>
          {panel && (
            <div
              className="item-detail-card"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="item-detail-close"
                onClick={() => setPanel(null)}
              >
                ×
              </button>
              <div className="item-detail-header">
                <span className="item-detail-name">{panel.name}</span>
                <span className="item-detail-price">{panel.price} gold</span>
              </div>
              {stats.length > 0 && (
                <dl className="item-detail-stats">
                  {stats.map((stat) => (
                    <div className="item-detail-stat" key={stat.label}>
                      <dt>{stat.label}</dt>
                      <dd>{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p>{panel.description}</p>
              {panel.tags.length > 0 && (
                <div className="item-detail-tags">
                  {panel.tags.map((tag) => (
                    <span className="item-tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
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
