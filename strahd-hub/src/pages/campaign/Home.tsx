import { Link } from "react-router-dom";
import { useCampaign } from "../../components/CampaignLayout";
import { usePlayerPreview } from "../../components/PlayerPreviewContext";
import { useRecaps } from "../../hooks/useRecaps";
import { useLocations } from "../../hooks/useLocations";
import { usePartyInventory } from "../../hooks/usePartyInventory";
import { useParty } from "../../hooks/useParty";
import { Recap } from "../../services/recaps";
import barovia from "../../assets/Maps/barovia.webp";
import "./home.css";
// After home.css: the band is a .desk-panel and this sheet only adds the seat
// grid inside it, so the panel has to be declared first.
import "./atTheTable.css";

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
  const { previewing } = usePlayerPreview();
  // The dashboard is the page a DM lands on after toggling, which makes it the
  // page a leak is least likely to be noticed on. Two things have to move
  // together here, and neither is correct alone:
  //
  //   asPlayer below   without it the map thumbnail draws a pin at the true
  //                    coordinates of every unrevealed location, and Roads
  //                    Known reads 4 / 17 where a player sees 4 / 4.
  //
  //   showDmUi         with asPlayer but without this, `hidden` and `annotated`
  //                    both collapse to 0 — because the rows they count are no
  //                    longer in the list — and the DM band starts reporting
  //                    "Every road revealed" while ten locations are hidden.
  //                    A confident lie is worse than the leak it replaced.
  const showDmUi = campaign.isDm && !previewing;
  const {
    data: recaps = [],
    isLoading: recapsLoading,
    error: recapsError,
  } = useRecaps(campaign.id);
  const {
    data: locations = [],
    isLoading: locationsLoading,
    error: locationsError,
  } = useLocations(campaign.id, { asPlayer: previewing });
  const {
    data: entries = [],
    isLoading: hoardLoading,
    error: hoardError,
  } = usePartyInventory(campaign.id);
  // Deliberately not in the loading gate or the error line below. Those two
  // decide whether the desk has anything to show at all, and the band is one
  // panel of it — a slow party read should let the rest of the dashboard paint
  // and fill in after, and a failed one should cost the band, not the page.
  // The empty default is what makes that safe: `[]` hides the band entirely.
  const { data: party = [] } = useParty(campaign.id);

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
            {/* Only ever non-zero for a DM who is not previewing: a player's
                response never carried the unrevealed rows, and useLocations'
                select drops them again from a previewing DM's — so in both
                cases `hidden` is 0 and there is nothing to say. */}
            {showDmUi && hidden > 0 && (
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

        {/* At the table — one column per character, below the Hoard. Who is
            here, who plays them, and how much each is hauling: the three
            things the row already carries, and nothing this band has to go
            and ask for. What each stack actually is stays the Inventory
            page's job. Hidden entirely on a campaign nobody has rolled up
            in: an empty band on a fresh campaign is a gap, not information.

            The count is a plain character count rather than the design's
            "4 of 5". The denominator would be the campaign's member count, and
            013's SELECT policy on campaign_members is `user_id = auth.uid()` —
            the only membership row anyone can read is their own, so the
            fraction is a fact we don't have. */}
        {party.length > 0 && (
          <section className="desk-panel desk-panel--full at-table">
            <div className="at-table__head">
              <p className="at-table__title">At the Table</p>
              <span className="at-table__count">
                {party.length} {party.length === 1 ? "character" : "characters"}
              </span>
            </div>
            <div className="at-table__grid">
              {party.map((character) => (
                <div className="at-table__seat" key={character.id}>
                  <p className="at-table__name">{character.name}</p>
                  <p className="at-table__player">
                    played by {character.playerName ?? "someone since departed"}
                  </p>
                  <div className="at-table__rule" />
                  {/* carried, not stacks: the seat leads with how many things
                      they are hauling, not how many kinds of thing. Both come
                      off the one useParty read — getPartyCharacters computes
                      them side by side for exactly this, and the band was the
                      only caller that never spent them. A seat with nothing
                      still shows its 0, dimmed: an empty pack on a Tuesday
                      night is the useful fact, not a gap to hide. */}
                  <p className="at-table__carried">
                    <span
                      className={
                        character.carried === 0
                          ? "at-table__carried-count at-table__carried-count--none"
                          : "at-table__carried-count"
                      }
                    >
                      {character.carried}
                    </span>
                    <span className="at-table__carried-label">
                      {character.carried === 1
                        ? "thing carried"
                        : "things carried"}
                    </span>
                  </p>
                  {/* Two names and a remainder, not the pack: the band answers
                      who is here and roughly what with, and the Inventory page
                      is where a stack is actually read. items arrives sorted by
                      name, so the two shown are stable between renders rather
                      than whichever the embed happened to return first. */}
                  {character.stacks === 0 ? (
                    <p className="at-table__nothing">Carries nothing yet.</p>
                  ) : (
                    <p className="at-table__items">
                      {character.items
                        .slice(0, 2)
                        .map((item) => item.name)
                        .join(", ")}
                      {character.stacks > 2 && (
                        <span className="at-table__more">
                          {" "}
                          +{character.stacks - 2} more
                        </span>
                      )}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* showDmUi, not campaign.isDm. The band is captioned "For the DM's
            eyes only" and would otherwise stay up in player view — and worse,
            it reads its two numbers off a list that preview has already
            filtered, so it would sit there under that caption stating the
            opposite of the truth. */}
        {showDmUi && (
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
