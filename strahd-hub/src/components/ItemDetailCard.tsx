import { ReactNode } from "react";
import { Item } from "../services/items";
// The card's look lives in shop.css (the item-detail-* classes). Imported here
// so the card carries its own styling wherever it's used, rather than depending
// on each caller to have imported that sheet first. Same file the pages import;
// the bundler dedupes it.
import "../pages/shop.css";

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

/**
 * The item inspect card, shared by Shop and PartyInventory so an item reads the
 * same on both. `footer` is the page-specific slot: Shop drops an "Add to party
 * inventory" button into it, PartyInventory leaves it empty.
 *
 * Rendered as the direct child <div> of the overlay backdrop on both pages, and
 * that position is load-bearing: shop.css styles this card by where it sits
 * (.shop > div:nth-of-type(2) > div), not by the item-detail-card class alone.
 * It also stops click propagation so a click inside the card doesn't reach the
 * backdrop that would dismiss it.
 */
export function ItemDetailCard({
  item,
  onClose,
  footer,
}: {
  item: Item;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const stats = itemStats(item);
  return (
    <div className="item-detail-card" onClick={(e) => e.stopPropagation()}>
      <button className="item-detail-close" onClick={onClose}>
        ×
      </button>
      <div className="item-detail-header">
        <span className="item-detail-name">{item.name}</span>
        <span className="item-detail-price">{item.price} gold</span>
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
      <p>{item.description}</p>
      {item.tags.length > 0 && (
        <div className="item-detail-tags">
          {item.tags.map((tag) => (
            <span className="item-tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      )}
      {footer}
    </div>
  );
}
