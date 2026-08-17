import { ReactNode } from "react";
import { spellLevelLine, type Spell } from "../services/spells";
// The card's look lives in spells.css (the spell-detail-* classes). Imported
// here so the card carries its own styling wherever it's used, rather than
// depending on each caller to have imported that sheet first. The bundler
// dedupes it against the Spells page's own import.
import "../pages/campaign/spells.css";

// "V, S, M (a pinch of sulfur)". The material goes in parentheses after the M
// rather than on a row of its own, which is how a stat block prints it — and
// this is the only place in the app that shows materialComponent at all.
//
// Null rather than an empty string when a spell has no components: the caller
// drops the row instead of printing a blank one.
function componentsLine(spell: Spell): string | null {
  const parts: string[] = [];
  if (spell.verbal) parts.push("V");
  if (spell.somatic) parts.push("S");
  if (spell.material) {
    parts.push(spell.materialComponent ? `M (${spell.materialComponent})` : "M");
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

// One row per fact worth showing, itemStats' rule — no "N/A" filler. Ordered as
// a stat block orders them, which puts components between range and duration.
function spellStats(spell: Spell): { label: string; value: string }[] {
  const stats = [
    { label: "Casting Time", value: spell.castingTime },
    { label: "Range", value: spell.range },
  ];

  const components = componentsLine(spell);
  if (components) stats.push({ label: "Components", value: components });

  stats.push({ label: "Duration", value: spell.duration });
  return stats;
}

/**
 * The spell inspect card, shared by the grimoire and the character sheet's
 * spell list so a spell reads the same on both. `footer` is the page-specific
 * slot: the character panel drops a "Remove from this character" button into
 * it, the grimoire leaves it empty.
 *
 * Styled entirely from its own classes, unlike ItemDetailCard — that card is
 * styled by where it sits in the tree (.shop > div:nth-of-type(2) > div), which
 * is why its doc comment has to warn that its position is load-bearing, and why
 * it could not be dropped onto a page that isn't the Shop. The colours here come
 * from the --sh-* tokens on :root rather than the --bone/--blood properties,
 * which are scoped to .shop and .ch and would resolve to different values under
 * each parent.
 *
 * Stops click propagation so a click inside the card doesn't reach the backdrop
 * that would dismiss it.
 */
export function SpellDetailCard({
  spell,
  onClose,
  footer,
}: {
  spell: Spell;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const stats = spellStats(spell);
  return (
    <div className="spell-detail-card" onClick={(e) => e.stopPropagation()}>
      <button className="spell-detail-close" onClick={onClose}>
        ×
      </button>
      <div className="spell-detail-header">
        <span className="spell-detail-name">{spell.name}</span>
        {/* Tags, not stat rows: they are one bit each, and a "Concentration: no"
            row would be filler on most of the book. */}
        {spell.concentration && <span className="spell-tag">conc</span>}
        {spell.ritual && <span className="spell-tag">ritual</span>}
      </div>
      <p className="spell-detail-level">{spellLevelLine(spell)}</p>

      <dl className="spell-detail-stats">
        {stats.map((stat) => (
          <div className="spell-detail-stat" key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>

      <p className="spell-detail-text">{spell.description}</p>

      {/* Optional on Spell, and absent from every cantrip, so the heading only
          exists when there is something under it. */}
      {spell.higherLevels && (
        <>
          <h4 className="spell-detail-heading">At Higher Levels</h4>
          <p className="spell-detail-text">{spell.higherLevels}</p>
        </>
      )}

      {/* classes earns its row: it is the one thing here that isn't derivable
          from the rest of the card. spell.tags is not shown — it holds the level
          and the school again plus a loose role word, and the first two are
          already the line under the name. */}
      {spell.classes.length > 0 && (
        <div className="spell-detail-classes">
          {spell.classes.map((className) => (
            <span className="spell-detail-class" key={className}>
              {className}
            </span>
          ))}
        </div>
      )}

      {footer}
    </div>
  );
}
