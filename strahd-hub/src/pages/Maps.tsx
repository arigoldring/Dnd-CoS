import { useCallback, useEffect, useRef, useState } from "react";
import barovia_map from "../assets/Maps/Spoiler Free Map.png";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
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
];

const DWELL = 600; // ms of hover before the peek appears

type Peek = { loc: MapLocation; left: number; top: number };

export function Maps() {
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
      setPeek({ loc, left, top: m.top - s.top });
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

  const revealed = locations.filter((l) => l.is_revealed);

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
          <TransformComponent wrapperStyle={{ width: "100%", height: "80vh" }}>
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
                style={{ display: "block", width: "800px", height: "auto" }}
              />
              {revealed.map((loc) => (
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
                    (selected?.id === loc.id ? " is-active" : "")
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
            className="loc-panel loc-panel--popover loc-panel--peek"
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
            className="loc-panel loc-panel--drawer"
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
          </aside>
        )}
      </div>
    </div>
  );
}
