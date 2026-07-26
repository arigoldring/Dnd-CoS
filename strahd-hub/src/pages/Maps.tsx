import { useCallback, useEffect, useRef, useState } from "react";
import barovia_map from "../assets/Maps/Spoiler Free Map.png";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { useAuth } from "../services/AuthContext";
import "./maps.css";

interface MapLocation {
  id: string;
  name: string;
  x: number; // percent across image
  y: number; // percent down image
  description: string;
  is_revealed: boolean;
  dm_notes?: string;
}

const locations: MapLocation[] = [
  {
    id: "loc-1",
    name: "Village of Barovia",
    x: 78.5,
    y: 61.3,
    description: "Cursed Town",
    is_revealed: true,
  },
  {
    id: "loc-2",
    name: "Tser Falls",
    x: 56.8,
    y: 55.9,
    description: "Thundering falls above the Vistani camp at Tser Pool.",
    is_revealed: true,
  },
  {
    id: "loc-3",
    name: "Vallaki",
    x: 39.8,
    y: 33.4,
    description: "Walled town ruled by a paranoid baron.",
    is_revealed: true,
  },
  {
    id: "loc-4",
    name: "Krezk",
    x: 11.2,
    y: 29.9,
    description: "Remote walled village guarding the Abbey of Saint Markovia.",
    is_revealed: true,
  },
  {
    id: "loc-5",
    name: "Castle Ravenloft",
    x: 71,
    y: 51.2,
    description: "Strahd's mountaintop fortress, seat of the land's curse.",
    is_revealed: true,
    dm_notes: "Strahd is home. The Heart of Sorrow beats in the north tower.",
  },
  {
    id: "loc-6",
    name: "Abbey of Saint Markovia",
    x: 8.4,
    y: 22.6,
    description: "Ruined abbey on the heights above Krezk.",
    is_revealed: false,
    dm_notes: "The Abbot dwells here with his mongrelfolk flock.",
  },
];

const DWELL = 600; // ms of hover before the peek appears
// Vertical room the peek needs above a marker (panel height + tether gap).
// Below this, the peek flips to render underneath the marker instead.
const PEEK_CLEARANCE = 150;

type Peek = { loc: MapLocation; left: number; top: number; below: boolean };

export function Maps() {
  const { profile, loading } = useAuth();
  const isDm = profile?.role === "dm";
  const [selected, setSelected] = useState<MapLocation | null>(null);
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
  const startDwell = (loc: MapLocation, el: HTMLElement) => {
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

  if (loading) return <p>Loading...</p>;
  // DMs see every location (including hidden ones, styled differently below);
  // players see only what's been revealed to them.
  const visible = isDm
    ? locations
    : locations.filter((l) => l.is_revealed);

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
              {visible.map((loc) => (
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
                    (!loc.is_revealed ? " is-hidden" : "")
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
            {isDm && selected.dm_notes && (
              <p className="loc-panel__dm">DM notes: {selected.dm_notes}</p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
