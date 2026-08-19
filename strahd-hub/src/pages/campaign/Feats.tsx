import { useState } from "react";
import { Link } from "react-router-dom";
import { useSearchBar } from "../../hooks/useSearchBar";
import { useFeats } from "../../hooks/useFeats";
import { useCampaign } from "../../components/CampaignLayout";
import { usePlayerPreview } from "../../components/PlayerPreviewContext";
import { FeatDetailCard } from "../../components/FeatDetailCard";
import {
  featCategories,
  featCategoryLabel,
  type Feat,
  type FeatCategory,
} from "../../services/feats";
import "./feats.css";

export function Feats() {
  // Resolved by CampaignLayout above this route; scopes the catalogue to shared
  // plus this campaign's homebrew, same as the grimoire and the Shop.
  const campaign = useCampaign();
  const { previewing } = usePlayerPreview();
  const { data: feats = [], isLoading: loading, error } = useFeats(campaign.id);
  const [categoryFilter, setCategoryFilter] = useState<FeatCategory | null>(null);
  const { setSearch, filtered: searchFiltered } = useSearchBar(feats);
  const filtered = searchFiltered.filter(
    (feat) => categoryFilter === null || feat.category === categoryFilter,
  );
  // Held by id, not the Feat itself — Shop's reasoning for panelId: a refetch
  // replaces the object, so a stored one would leave the card showing a stale
  // feat beside a fresh table row.
  const [panelId, setPanelId] = useState<string | null>(null);

  // Gates the authoring link only. The route guard on CreateFeat itself uses
  // bare campaign.isDm, because a guard that tripped on preview would bounce a
  // DM out of a page they had already navigated to before toggling.
  const showDmUi = campaign.isDm && !previewing;

  if (loading) return <p>Loading feats...</p>;
  if (error) return <p>Couldn't load feats: {error.message}</p>;

  const panel = feats.find((feat) => feat.id === panelId) ?? null;

  function createFeatTable() {
    return (
      <table className="feats">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Prerequisite</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((feat: Feat) => (
            <tr key={feat.id}>
              <td>
                <button
                  className="feats__open"
                  onClick={() => setPanelId(feat.id)}
                >
                  {feat.name}
                </button>
                {feat.repeatable && (
                  <span className="feat-tag">repeatable</span>
                )}
              </td>
              <td>{featCategoryLabel(feat.category)}</td>
              <td>
                {feat.prerequisite ?? (
                  <span className="feats__no-prereq">—</span>
                )}
              </td>
              <td>{feat.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="feats">
      <div className="feats__head">
        <div>
          <p className="feats__eyebrow">⚔ Hard-Won Talents ⚔</p>
          <h1>Feats</h1>
        </div>
        <input
          className="feats__search"
          type="text"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search for a feat"
        />
      </div>

      {/* Category stands in for the grimoire's level row. The order is
          featCategories', not alphabetical — the same sequence the picker's
          optgroups and the sheet's group headers use. */}
      <div className="feats__filters">
        <p className="feats__filters-label">Category</p>
        <button
          className={categoryFilter === null ? "active" : ""}
          onClick={() => setCategoryFilter(null)}
        >
          All
        </button>
        {featCategories.map((category) => (
          <button
            key={category}
            className={categoryFilter === category ? "active" : ""}
            onClick={() => setCategoryFilter(category)}
          >
            {featCategoryLabel(category)}
          </button>
        ))}
        <span className="feats__count">
          {filtered.length} of {feats.length}
        </span>
        {/* The DM's way into CreateFeat. Not a nav entry: the rail already
            carries one authoring link, and a second starts a list in something
            that is otherwise for destinations. */}
        {showDmUi && (
          <Link className="feats__forge" to="../CreateFeat">
            Forge a new feat
          </Link>
        )}
      </div>

      {/* Click-outside backdrop. feats.css promotes it to a fixed overlay only
          while it holds a card, so with nothing selected it stays an inert
          empty div; the card stops propagation so clicking inside doesn't
          dismiss it. The table below keeps its two-line clamp — that is the
          right shape for a row now that there is a way to read the rest. */}
      <div className="feat-detail-backdrop" onClick={() => setPanelId(null)}>
        {panel && (
          <FeatDetailCard
            key={panel.id}
            feat={panel}
            onClose={() => setPanelId(null)}
          />
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="feats__empty">No such talent has been recorded.</p>
      ) : (
        createFeatTable()
      )}
    </div>
  );
}
