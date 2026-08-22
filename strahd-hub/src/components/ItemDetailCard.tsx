import { ReactNode } from "react";
import { Item } from "../services/items";
// The card's look lives in shop.css (the item-detail-* classes). Imported here
// so the card carries its own styling wherever it's used, rather than depending
// on each caller to have imported that sheet first. Same file the pages import;
// the bundler dedupes it.
import "../pages/campaign/shop.css";
// .detail-alias — the catalogue name under a custom one — lives with the rest
// of the 046/047 classes rather than being copied into both card sheets.
// Imported here for the same reason as the line above: the card carries its own
// styling wherever it is used rather than depending on a sibling component
// having been rendered first.
import "./customDescription.css";

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
 * The item inspect card, shared by Shop, the party's hoard and a character's own
 * pack, so an item reads the same on all three. `footer` is the page-specific
 * slot: Shop drops an "Add to party inventory" button into it, the other two
 * leave it empty.
 *
 * Styled entirely from its own classes as of 047. It used to be styled by where
 * it sat in the tree (.shop > div:nth-of-type(2) > div), which meant it had no
 * frame anywhere but the Shop — see shop.css for what that cost the hoard rail.
 *
 * Stops click propagation so a click inside the card doesn't reach the backdrop
 * that would dismiss it.
 *
 * The two optional props are how a character's copy of an item differs from the
 * catalogue's, and both default to undefined so Shop and the hoard render
 * exactly as they did before 047 existed:
 *
 *   customName        what this character calls it. Leads the header, with the
 *                     catalogue name kept underneath — every list, picker and
 *                     search still works off the catalogue name, so hiding it
 *                     would make the sheet unreadable to anyone but its owner.
 *   descriptionSlot   replaces the catalogue description paragraph. The pack
 *                     passes a CustomDescriptionBlock, which puts the player's
 *                     words here and the catalogue text behind a disclosure.
 */
export function ItemDetailCard({
  item,
  onClose,
  footer,
  customName,
  descriptionSlot,
}: {
  item: Item;
  onClose: () => void;
  footer?: ReactNode;
  customName?: string | null;
  descriptionSlot?: ReactNode;
}) {
  const stats = itemStats(item);
  return (
    <div className="item-detail-card" onClick={(e) => e.stopPropagation()}>
      <button className="item-detail-close" onClick={onClose}>
        ×
      </button>
      <div className="item-detail-header">
        <span className="item-detail-name">
          {customName ?? item.name}
          {customName && <span className="detail-alias">{item.name}</span>}
        </span>
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
      {descriptionSlot ?? (
        <p className="item-detail-text">{item.description}</p>
      )}
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
