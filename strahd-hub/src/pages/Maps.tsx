import { useCallback, useEffect, useRef, useState } from "react";
import barovia_map from "../assets/Maps/Spoiler Free Map.png";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { useAuth } from "../services/AuthContext";
import { useLocations } from "../Hooks/useLocations";
import { Location } from "../services/locations";
import "./maps.css";

const DWELL = 600; // ms of hover before the peek appears
// Vertical room the peek needs above a marker (panel height + tether gap).
// Below this, the peek flips to render underneath the marker instead.
const PEEK_CLEARANCE = 150;

type Peek = { loc: Location; left: number; top: number; below: boolean };

export function Maps() {
  const { profile, loading: authLoading } = useAuth();
  const isDm = profile?.role === "dm";
  const { locations, loading: locationsLoading, error } = useLocations();
  const [selected, setSelected] = useState<Location | null>(null);
  const [peek, setPeek] = useState<Peek | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dwell = useRef<number | undefined>(undefined);

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
      const left = Math.min(
        Math.max(m.left + m.width / 2 - s.left, 140),
        s.width - 140,
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
      setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearPeek]);

  if (authLoading || locationsLoading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  // No reveal filter here anymore: RLS already dropped hidden rows from a
  // player's response, so `locations` is exactly what this user may see.
  // isDm survives only to STYLE the hidden pins a DM still receives.
  return (
    <div className="maps has-peek">
      <p>Maps</p>
      <div className="map-stage" ref={stageRef}>
        <TransformWrapper
          minScale={1}
          maxScale={6}
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
                    setSelected((cur) => (cur?.id === loc.id ? null : loc));
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
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            <h2 className="loc-panel__name">{selected.name}</h2>
            <div className="loc-panel__rule"></div>
            <p className="loc-panel__desc">{selected.description}</p>
            {isDm && selected.dmNotes && (
              <p className="loc-panel__dm">DM notes: {selected.dmNotes}</p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
