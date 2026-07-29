import { SubmitEvent, useCallback, useEffect, useRef, useState } from "react";
import barovia_map from "../assets/Maps/Spoiler Free Map.png";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { useAuth } from "../services/AuthContext";
import { useLocations } from "../hooks/useLocations";
import { Location } from "../services/locations";
import "./maps.css";

const DWELL = 600; // ms of hover before the peek appears
// Vertical room the peek needs above a marker (panel height + tether gap).
// Below this, the peek flips to render underneath the marker instead.
const PEEK_CLEARANCE = 150;
// Half the peek's width (230px in maps.css) plus a small edge margin. The
// inline `left` is a CENTRE, not an edge — .loc-panel--popover translates
// itself -50% — so this is how far the centre must stay from either side.
const PEEK_HALF_WIDTH = 140;

type Peek = { loc: Location; left: number; top: number; below: boolean };

export function Maps() {
  const { profile, loading: authLoading } = useAuth();
  const isDm = profile?.role === "dm";
  const {
    locations,
    loading: locationsLoading,
    error,
    saveDescription,
  } = useLocations();
  // The open location is held by id, not as a copied Location object: the
  // drawer then re-renders straight from the list, so a saved edit shows up
  // instead of a stale snapshot taken at click time.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [peek, setPeek] = useState<Peek | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dwell = useRef<number | undefined>(undefined);

  const selected = locations.find((loc) => loc.id === selectedId) ?? null;

  const closePanel = useCallback(() => {
    setSelectedId(null);
    setEditing(false);
  }, []);

  const clearPeek = useCallback(() => {
    window.clearTimeout(dwell.current);
    setPeek(null);
  }, []);

  // The peek is rendered OUTSIDE the zoom transform and positioned from the
  // marker's live screen rect, so it stays a constant size at any zoom level
  // while still pointing at the right spot.
  const startDwell = (loc: Location, el: HTMLElement) => {
    window.clearTimeout(dwell.current);
    dwell.current = window.setTimeout(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const s = stage.getBoundingClientRect();
      const m = el.getBoundingClientRect();
      // Keep the panel inside the stage by clamping its centre. Guard the
      // narrow-stage case first: below twice the margin the bounds cross
      // (min > max) and a bare min/max would pin the peek hard left — or
      // negative — instead of clipping evenly. Centring is the graceful answer.
      const centre = m.left + m.width / 2 - s.left;
      const left =
        s.width < PEEK_HALF_WIDTH * 2
          ? s.width / 2
          : Math.min(
              Math.max(centre, PEEK_HALF_WIDTH),
              s.width - PEEK_HALF_WIDTH,
            );
      // The peek renders above the marker by default. For markers near the top
      // of the stage there isn't room — it would be clipped by the stage's
      // overflow:hidden — so flip it below the marker instead.
      const top = m.top - s.top;
      const bottom = m.bottom - s.top;
      const below = top < PEEK_CLEARANCE;
      setPeek({ loc, left, top: below ? bottom : top, below });
    }, DWELL);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      clearPeek();
      // Back out one layer at a time: an open editor first, then the drawer —
      // so Escape on a half-typed description doesn't also close the panel.
      if (editing) setEditing(false);
      else setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearPeek, editing]);

  if (authLoading || locationsLoading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  // No reveal filter here anymore: RLS already dropped hidden rows from a
  // player's response, so `locations` is exactly what this user may see.
  // isDm has one job left: showing the edit button. The hidden-pin styling
  // reads loc.isRevealed, not the role, and dmNotes needs no check at all —
  // RLS already left that key absent for players.
  return (
    <div className="maps has-peek">
      <p>Maps</p>
      <div className="map-stage" ref={stageRef}>
        <TransformWrapper
          minScale={1}
          maxScale={3}
          doubleClick={{ disabled: true }}
          onPanningStart={clearPeek}
          onZoomStart={clearPeek}
        >
          <TransformComponent
            wrapperStyle={{ width: "100%" }}
            contentStyle={{
              width: "100%",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{ position: "relative", display: "inline-block" }}
              // TEMP: uncomment to find the next hotspot's x%/y% in the console.
              // onMouseDownCapture={(e) => {
              //   const img = imgRef.current;
              //   if (!img) return;
              //   const r = img.getBoundingClientRect();
              //   const x = ((e.clientX - r.left) / r.width) * 100;
              //   const y = ((e.clientY - r.top) / r.height) * 100;
              //   console.log("MAP COORDS:", x.toFixed(1), y.toFixed(1));
              // }}
            >
              <img
                ref={imgRef}
                src={barovia_map}
                alt="Map of Barovia"
                style={{
                  display: "block",
                  maxWidth: "100%",
                  maxHeight: "82vh",
                  width: "auto",
                  height: "auto",
                }}
              />
              {locations.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => {
                    clearPeek();
                    // Moving to another location drops any open editor with it,
                    // so an unsaved draft can never bleed onto the next panel.
                    setEditing(false);
                    setSelectedId((cur) => (cur === loc.id ? null : loc.id));
                  }}
                  onMouseEnter={(e) => startDwell(loc, e.currentTarget)}
                  onMouseLeave={clearPeek}
                  onFocus={(e) => startDwell(loc, e.currentTarget)}
                  onBlur={clearPeek}
                  aria-label={loc.name}
                  title={loc.name}
                  className={
                    "map-hotspot" +
                    (selected?.id === loc.id ? " is-active" : "") +
                    (!loc.isRevealed ? " is-hidden" : "")
                  }
                  style={{
                    position: "absolute",
                    left: `${loc.x}%`,
                    top: `${loc.y}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              ))}
            </div>
          </TransformComponent>
        </TransformWrapper>

        {peek && peek.loc.id !== selected?.id && (
          <aside
            className={
              "loc-panel loc-panel--popover loc-panel--peek" +
              (peek.below ? " loc-panel--below" : "")
            }
            style={{ left: peek.left, top: peek.top }}
            aria-hidden="true"
          >
            <h2 className="loc-panel__name">{peek.loc.name}</h2>
            <div className="loc-panel__rule"></div>
            <p className="loc-panel__desc">{peek.loc.description}</p>
            <span className="loc-panel__more">click to read on</span>
          </aside>
        )}

        {selected && (
          <aside
            // Open on the side away from the marker so the drawer never covers
            // the pin you just clicked (and its gold is-active ring).
            className={
              "loc-panel loc-panel--drawer" +
              (selected.x > 50 ? " loc-panel--left" : "")
            }
            role="dialog"
            aria-label={selected.name}
          >
            <button
              className="loc-panel__close"
              aria-label="Close"
              onClick={closePanel}
            >
              ×
            </button>
            <h2 className="loc-panel__name">{selected.name}</h2>
            <div className="loc-panel__rule"></div>

            {editing ? (
              // key: a fresh editor per location, so its draft can never carry
              // over from the last one it was opened on.
              <DescriptionEditor
                key={selected.id}
                location={selected}
                onSave={saveDescription}
                onClose={() => setEditing(false)}
              />
            ) : (
              <>
                <p className="loc-panel__desc">
                  {selected.description ?? (
                    <span className="loc-panel__empty">
                      No description yet.
                    </span>
                  )}
                </p>
                {isDm && (
                  <button
                    className="loc-panel__edit"
                    onClick={() => setEditing(true)}
                  >
                    Edit description
                  </button>
                )}
              </>
            )}

            {selected.dmNotes && (
              <p className="loc-panel__dm">DM notes: {selected.dmNotes}</p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

// The DM's description editor. Draft/saving/error state lives here rather than
// in Maps so that unmounting it is the whole of "cancel" — nothing to reset —
// and a keystroke in the textarea re-renders the form, not the map.
function DescriptionEditor({
  location,
  onSave,
  onClose,
}: {
  location: Location;
  onSave: (id: string, description: string) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(location.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(location.id, draft);
      onClose();
    } catch (err) {
      // Stay open on failure, holding the draft: closing here would throw away
      // text the DM just wrote and that the database never took.
      console.error("Problem saving description:", err);
      setError(
        err instanceof Error ? err.message : "Problem saving description",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="loc-edit" onSubmit={handleSubmit}>
      <label className="loc-edit__label" htmlFor="loc-desc">
        Description
      </label>
      <textarea
        id="loc-desc"
        className="loc-edit__field"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={saving}
        rows={7}
        autoFocus
      />
      <div className="loc-edit__actions">
        <button
          type="button"
          className="loc-edit__btn"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="loc-edit__btn loc-edit__btn--save"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {error && <p className="loc-edit__error">{error}</p>}
    </form>
  );
}
