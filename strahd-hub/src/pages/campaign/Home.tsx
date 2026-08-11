import { Link } from "react-router-dom";
import { useCampaign } from "../../components/CampaignLayout";
import { useRecaps } from "../../hooks/useRecaps";
import { useLocations } from "../../hooks/useLocations";
import { usePartyInventory } from "../../hooks/usePartyInventory";
import { Recap } from "../../services/recaps";
import barovia from "../../assets/Maps/barovia.webp";
import "./home.css";

// Same semantics as the byline in Recaps.tsx: lastEditedAt, not the name,
// decides whether the recap has been touched — the name is also null when the
// editor's profile has since been deleted.
function byline(recap: Recap): string {
  if (!recap.lastEditedAt) return "no edits yet";
  const who = recap.lastEditedByName ?? "unknown";
  const when = new Date(recap.lastEditedAt).toLocaleDateString();
  return `last edited by ${who} · ${when}`;
}

export function Home() {
  const campaign = useCampaign();
  const {
    data: recaps = [],
    isLoading: recapsLoading,
    error: recapsError,
  } = useRecaps(campaign.id);
  const {
    data: locations = [],
    isLoading: locationsLoading,
    error: locationsError,
  } = useLocations(campaign.id);
  const {
    data: entries = [],
    isLoading: hoardLoading,
    error: hoardError,
  } = usePartyInventory(campaign.id);

  if (recapsLoading || locationsLoading || hoardLoading)
    return <p>Loading...</p>;
  const error =
    recapsError?.message ?? locationsError?.message ?? hoardError?.message;
  if (error) return <p>{error}</p>;

  // recaps arrive sorted by session number descending, so the head of the list
  // is the latest session. `?? -1` matches suggestedNumber in Recaps.tsx: a
  // fresh campaign's first session is 0, and this heading must agree with the
  // number the New-recap form will suggest.
  const last = recaps[0];
  const nextSession = (last?.sessionNumber ?? -1) + 1;
  const revealed = locations.filter((l) => l.isRevealed).length;
  const hidden = locations.length - revealed;
  const annotated = locations.filter((l) => l.dmNotes).length;

  return (
    <div className="desk">
      <div className="desk__head">
        <div>
          <p className="desk__eyebrow">Tonight</p>
          <h1>Session {nextSession}</h1>
        </div>
        <div className="desk__head-right">
          <p className="desk__note">
            {recaps.length} written up · none tonight yet
          </p>
          <Link className="desk__cta" to="Recaps">
            New recap
          </Link>
        </div>
      </div>

      <div className="desk__grid">
        {/* last session — spans two columns */}
        <section className="desk-panel desk-panel--wide desk-chronicle">
          <div className="desk-panel__head">
            <p className="desk-panel__title">Last Session</p>
            <span className="desk-panel__count">
              {String(last?.sessionNumber ?? 0).padStart(2, "0")}
            </span>
          </div>
          {last ? (
            <>
              <h2>{last.displayTitle}</h2>
              <p className="desk-chronicle__body">{last.body}</p>
              <div className="desk-panel__foot">
                <span className="desk-panel__byline">{byline(last)}</span>
                <Link to="Recaps">All recaps →</Link>
              </div>
            </>
          ) : (
            <p className="desk-chronicle__empty">
              Nothing written down yet. The chronicle starts after session one.
            </p>
          )}
        </section>

        {/* roads known — map thumbnail over a count */}
        <section className="desk-panel desk-map">
          <Link className="desk-map__thumb" to="Maps">
            <img src={barovia} alt="" />
            {locations.map((loc) => (
              <span
                key={loc.id}
                className={`desk-map__pin${loc.isRevealed ? "" : " desk-map__pin--hidden"}`}
                style={{ left: `${loc.x}%`, top: `${loc.y}%` }}
              />
            ))}
          </Link>
          <div className="desk-map__body">
            <p className="desk-panel__title">Roads Known</p>
            <p className="desk-map__count">
              {revealed}
              <span> / {locations.length}</span>
            </p>
            {campaign.isDm && hidden > 0 && (
              <p className="desk-map__hidden">
                {hidden} hidden from the party
              </p>
            )}
          </div>
        </section>

        {/* the party's hoard — full width */}
        <section className="desk-panel desk-panel--full desk-hoard">
          <div className="desk-panel__head">
            <p className="desk-panel__title">The Party's Hoard</p>
            <span className="desk-panel__count">{entries.length} stacks</span>
          </div>
          <ul className="desk-hoard__list">
            {/* entryId, not id: the same catalog item can appear as several
                stacks, so the item id isn't unique here */}
            {entries.slice(0, 6).map((entry) => (
              <li key={entry.entryId}>
                <span>{entry.name}</span>
                <span className="desk-hoard__qty">×{entry.quantity}</span>
              </li>
            ))}
          </ul>
        </section>

        {campaign.isDm && (
          <section className="desk-dm">
            <p className="desk-dm__label">
              For the DM's
              <br />
              eyes only
            </p>
            <div className="desk-dm__stat">
              <span className="desk-dm__stat-label">Still in the mists</span>
              <span className="desk-dm__stat-value">
                {hidden === 0
                  ? "Every road revealed"
                  : `${hidden} of ${locations.length} locations unrevealed`}
              </span>
            </div>
            <div className="desk-dm__stat">
              <span className="desk-dm__stat-label">Notes on file</span>
              <span className="desk-dm__stat-value">
                {annotated === 0
                  ? "No location notes yet"
                  : `${annotated} ${annotated === 1 ? "location" : "locations"} annotated`}
              </span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
