import { Link } from "react-router-dom";
import { useAuth } from "../../services/AuthContext";
import { useCampaign } from "../../components/CampaignLayout";
import { usePlayerPreview } from "../../components/PlayerPreviewContext";
import { useMaps } from "../../hooks/useMaps";
import { errorMessage } from "../../lib/errors";
import "./maps.css";

/**
 * The map shelf: every map this campaign has, one card each, DM reveal
 * controls included. Opening a card moves to MapView.tsx, its own route —
 * this page only ever decides which maps exist to open.
 */
export function Maps() {
  const { loading: authLoading } = useAuth();
  // Non-null by construction — this route sits under CampaignLayout.
  const campaign = useCampaign();
  const { previewing } = usePlayerPreview();
  const showDmUi = campaign.isDm && !previewing;
  // See MapView.tsx's identical comment: the registry has no RLS behind it, so
  // this flag is the only thing keeping a hidden map's card off a player's
  // screen.
  const mapsAsPlayer = !campaign.isDm || previewing;
  const {
    data: maps = [],
    isLoading: mapsLoading,
    error,
    toggleReveal,
    toggleRevealError,
  } = useMaps(campaign.id, { asPlayer: mapsAsPlayer });

  if (authLoading || mapsLoading) return <p>Loading...</p>;
  if (error) return <p>{error.message}</p>;

  // Only ever non-zero for a DM who isn't previewing: a player's response
  // never carried a hidden map's card at all, and the asPlayer select drops it
  // again from a previewing DM's — so in both cases there's nothing to count.
  const hidden = maps.filter((m) => !m.isRevealed).length;

  return (
    <div className="maps maps-index">
      <div className="maps-header">
        <p className="maps-title">Maps</p>
        <p className="maps-count">
          {maps.length} {maps.length === 1 ? "map" : "maps"}
          {showDmUi && hidden > 0 && (
            <>
              {" · "}
              <b>{hidden} not yet revealed</b>
            </>
          )}
        </p>
      </div>

      <div className="map-list">
        {maps.map((m) => (
          <article
            key={m.id}
            className={"map-card" + (!m.isRevealed ? " is-hidden" : "")}
          >
            {/* A link, not a button with navigate(): this is a destination, so
                it should open in a new tab and show its URL on hover, the same
                reasoning CampaignPicker gives its campaign-row links. */}
            <Link className="map-card__open" to={m.id}>
              <img className="map-card__thumb" src={m.image} alt="" />
              <h3 className="map-card__title">
                {m.title}
                {!m.isRevealed && (
                  <span className="map-card__hidden-tag">hidden</span>
                )}
              </h3>
              <div className="map-card__rule"></div>
              <p className="map-card__subtitle">{m.subtitle}</p>
            </Link>
            {/* Sibling of the Link, never inside it — a <button> nested in an
                <a> is invalid markup and the two clicks fight. */}
            {showDmUi && (
              <button
                className="map-card__reveal"
                onClick={() =>
                  toggleReveal({ mapKey: m.id, isRevealed: !m.isRevealed })
                }
                title={m.isRevealed ? "Hide from players" : "Show to players"}
              >
                {m.isRevealed ? "Shown" : "Hidden"}
              </button>
            )}
          </article>
        ))}
      </div>

      {toggleRevealError && (
        <p className="maps-error">
          {errorMessage(toggleRevealError, "Problem updating map visibility")}
        </p>
      )}
    </div>
  );
}
