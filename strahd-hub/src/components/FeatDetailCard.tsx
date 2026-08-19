import { ReactNode } from "react";
import { featCategoryLabel, type Feat } from "../services/feats";
// The card's look lives in feats.css (the feat-detail-* classes). Imported here
// so the card carries its own styling wherever it's used, rather than depending
// on each caller to have imported that sheet first. The bundler dedupes it
// against the Feats page's own import.
import "../pages/campaign/feats.css";

/**
 * The feat inspect card, shared by the Feats page and the character sheet's
 * feat list so a feat reads the same on both. `footer` is the page-specific
 * slot: the character panel drops a "Remove from this character" button into
 * it, the catalogue leaves it empty.
 *
 * Modelled on SpellDetailCard rather than ItemDetailCard — that card is styled
 * by where it sits in the tree (.shop > div:nth-of-type(2) > div), which is why
 * its doc comment has to warn that its position is load-bearing, and why it
 * could not be dropped onto a page that isn't the Shop. The colours here come
 * from the --sh-* tokens on :root rather than the --bone/--blood properties,
 * which are scoped to .feats and .ch and would resolve to different values
 * under each parent.
 *
 * Stops click propagation so a click inside the card doesn't reach the backdrop
 * that would dismiss it.
 */
export function FeatDetailCard({
  feat,
  onClose,
  footer,
}: {
  feat: Feat;
  onClose: () => void;
  footer?: ReactNode;
}) {
  return (
    <div className="feat-detail-card" onClick={(e) => e.stopPropagation()}>
      <button className="feat-detail-close" onClick={onClose}>
        ×
      </button>
      <div className="feat-detail-header">
        <span className="feat-detail-name">{feat.name}</span>
        {/* A tag, not a stat row: it is one bit, and a "Repeatable: no" line
            would be filler on forty of the forty-two. It says what the book
            says; 041's unique constraint still means the sheet can only hold
            one, which is recorded in KNOWN_ISSUES.md rather than here. */}
        {feat.repeatable && <span className="feat-tag">repeatable</span>}
      </div>
      <p className="feat-detail-category">{featCategoryLabel(feat.category)}</p>

      {/* The spell card always has stats to show; this one has at most the
          prerequisite, so the whole block goes rather than printing a lone
          "Prerequisite: none" — itemStats' rule about no N/A filler. */}
      {feat.prerequisite && (
        <dl className="feat-detail-stats">
          <div className="feat-detail-stat">
            <dt>Prerequisite</dt>
            <dd>{feat.prerequisite}</dd>
          </div>
        </dl>
      )}

      <p className="feat-detail-text">{feat.description}</p>

      {/* Defaulted to '{}' by 039, so this is an emptiness check and never a
          null check. The heading only exists when there is a list under it. */}
      {feat.benefits.length > 0 && (
        <>
          <h4 className="feat-detail-heading">Benefits</h4>
          <ul className="feat-detail-benefits">
            {feat.benefits.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>
        </>
      )}

      {/* feat.tags is not shown, matching the spell card's treatment of its
          own: they are search and grouping metadata, and the category is
          already the line under the name. */}

      {footer}
    </div>
  );
}
