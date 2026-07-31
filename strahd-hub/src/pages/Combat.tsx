import {
  CSSProperties,
  MouseEvent,
  SubmitEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "../services/AuthContext";
import "./combat.css";

/* =========================================================
   Combat map — a paintable grid with tokens that occupy whole squares.

   Local-only on purpose: the whole map lives in this browser's
   localStorage, not in Postgres. This exists to find out whether the
   idea is worth a table at all, so there is deliberately no service,
   no hook and no RLS policy yet. Consequence to keep in mind while
   testing: a player opening this page sees THEIR OWN empty storage,
   not the DM's map. isDm below only decides which controls render,
   matching the rest of the app, but it is not sharing.
   ========================================================= */

const STORAGE_KEY = "strahd-hub:combat-grid";
const MAX_DIM = 30;
const FEET_PER_SQUARE = 5;

// Terrain presets. Stored as hex literals rather than var(--stone-2) strings
// because these values get written into the saved map and handed straight to
// an inline background-color — a CSS variable name would survive neither.
const PALETTE: { name: string; color: string }[] = [
  { name: "Stone floor", color: "#4a4442" },
  { name: "Stone wall", color: "#241d20" },
  { name: "Grass", color: "#3d4a2f" },
  { name: "Water", color: "#2b3a4a" },
  { name: "Dirt", color: "#4d3b28" },
  { name: "Wood", color: "#5c4633" },
  { name: "Blood", color: "#6a0a0a" },
  { name: "Fog", color: "#8b8578" },
];

type Tool = "paint" | "erase" | "token";

const TOOL_LABELS: Record<Tool, string> = {
  paint: "Paint",
  erase: "Erase",
  token: "Tokens",
};

// Squares filled per click. Anchored at the square you click and growing down
// and right, so a big brush near an edge fills less rather than wrapping.
const BRUSHES = [1, 2, 4] as const;
type Brush = (typeof BRUSHES)[number];

// A token covers size x size squares: 1 for anything Medium or smaller, 2 for
// a Large creature, which is 10 ft across on a 5 ft grid.
type TokenSize = 1 | 2;

interface CombatToken {
  id: string;
  label: string;
  color: string;
  row: number; // 0-based, top-left square of the token
  col: number; // 0-based
  size: TokenSize;
}

interface CombatGridDoc {
  version: 1;
  cols: number;
  rows: number;
  // Flat and row-major: index = row * cols + col. A 2D array would mean
  // cloning a row inside a cloned grid on every painted square, and it
  // serializes to noisier JSON for nothing.
  cells: (string | null)[];
  tokens: CombatToken[]; // invariant: no two tokens share a square
}

function isDim(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_DIM;
}

function isIndex(n: unknown, limit: number): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n < limit;
}

function feet(squares: number): string {
  return `${squares * FEET_PER_SQUARE} ft`;
}

// Where the map is read back in. A prototype's saved grid is disposable, so
// anything unrecognisable resolves to null — the DM just gets the size prompt
// again. That's the opposite of lib/parse.ts, which throws loudly, because a
// malformed DB row is a bug worth surfacing and a stale localStorage blob is not.
function validateDoc(value: unknown): CombatGridDoc | null {
  if (typeof value !== "object" || value === null) return null;
  const doc = value as Record<string, unknown>;
  if (doc.version !== 1) return null;

  const { cols, rows } = doc;
  if (!isDim(cols) || !isDim(rows)) return null;

  const cells = doc.cells;
  if (!Array.isArray(cells) || cells.length !== cols * rows) return null;
  if (!cells.every((c: unknown) => c === null || typeof c === "string")) {
    return null;
  }

  const rawTokens = doc.tokens;
  if (!Array.isArray(rawTokens)) return null;

  // Rebuilt entry by entry rather than cast wholesale: that drops any stray
  // fields from an older shape and enforces the no-overlap invariant the editor
  // relies on when deciding whether a square is free.
  const tokens: CombatToken[] = [];
  const taken = new Set<number>();
  for (const raw of rawTokens as unknown[]) {
    if (typeof raw !== "object" || raw === null) return null;
    const t = raw as Record<string, unknown>;
    const { id, label, color, row, col } = t;
    if (typeof id !== "string" || typeof label !== "string") return null;
    if (typeof color !== "string") return null;
    if (!isIndex(row, rows) || !isIndex(col, cols)) return null;

    // Anything that isn't exactly 2 reads as a 1x1 token, which is also how
    // maps saved before large tokens existed load without being thrown away.
    const size: TokenSize = t.size === 2 ? 2 : 1;
    if (row + size > rows || col + size > cols) return null;

    for (let r = row; r < row + size; r++) {
      for (let c = col; c < col + size; c++) {
        const at = r * cols + c;
        if (taken.has(at)) return null;
        taken.add(at);
      }
    }
    tokens.push({ id, label, color, row, col, size });
  }

  return { version: 1, cols, rows, cells: cells as (string | null)[], tokens };
}

function loadDoc(): CombatGridDoc | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const doc = validateDoc(JSON.parse(raw));
    if (!doc) console.warn("Discarding a saved combat map we can't read.");
    return doc;
  } catch (err) {
    // Bad JSON, or storage blocked outright by the browser.
    console.error("Ignoring unreadable saved combat map:", err);
    return null;
  }
}

// crypto.randomUUID only exists in a secure context, and `vite dev --host`
// opened from a tablet at the table is plain http on a LAN address. The
// fallback keeps token placement from throwing there; ids only have to be
// unique within one saved map.
function newTokenId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Every square a token sits on, not just its anchor — that's what makes a 2x2
// token clickable and collidable across all four of its squares.
function squaresUnder(token: CombatToken, cols: number): number[] {
  const out: number[] = [];
  for (let r = token.row; r < token.row + token.size; r++) {
    for (let c = token.col; c < token.col + token.size; c++) out.push(r * cols + c);
  }
  return out;
}

function tokensByIndex(doc: CombatGridDoc): Map<number, CombatToken> {
  const map = new Map<number, CombatToken>();
  for (const token of doc.tokens) {
    for (const at of squaresUnder(token, doc.cols)) map.set(at, token);
  }
  return map;
}

// A large token grows down and right from the square you click, so a click near
// the bottom or right edge is pulled back just far enough to fit rather than
// doing nothing at all.
function fitAnchor(
  doc: CombatGridDoc,
  row: number,
  col: number,
  size: TokenSize,
): { row: number; col: number } {
  return {
    row: Math.max(0, Math.min(row, doc.rows - size)),
    col: Math.max(0, Math.min(col, doc.cols - size)),
  };
}

// exceptId is what lets a large token be nudged one square: its new block
// overlaps its old one, and it must not collide with itself.
function blockIsFree(
  doc: CombatGridDoc,
  row: number,
  col: number,
  size: TokenSize,
  exceptId: string | null,
): boolean {
  if (row < 0 || col < 0 || row + size > doc.rows || col + size > doc.cols) {
    return false; // only reachable on a grid smaller than the token
  }
  const taken = new Set<number>();
  for (const token of doc.tokens) {
    if (token.id === exceptId) continue;
    for (const at of squaresUnder(token, doc.cols)) taken.add(at);
  }
  for (let r = row; r < row + size; r++) {
    for (let c = col; c < col + size; c++) {
      if (taken.has(r * doc.cols + c)) return false;
    }
  }
  return true;
}

function withoutToken(doc: CombatGridDoc, id: string): CombatGridDoc {
  return { ...doc, tokens: doc.tokens.filter((token) => token.id !== id) };
}

export function Combat() {
  const { profile, loading: authLoading } = useAuth();
  const isDm = profile?.role === "dm";

  // doc is the state machine: null means "no map yet" and renders the size
  // prompt, anything else renders the board. Read synchronously on mount so
  // there's no empty flash before the saved map appears.
  const [doc, setDoc] = useState<CombatGridDoc | null>(() => loadDoc());
  const [tool, setTool] = useState<Tool>("paint");
  const [brush, setBrush] = useState<Brush>(1);
  const [paintColor, setPaintColor] = useState(PALETTE[0].color);
  // A token that has been named but not yet dropped on the board.
  const [pending, setPending] = useState<{
    label: string;
    color: string;
    size: TokenSize;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The square under the cursor, so the brush outline can show what a click is
  // about to change. This does mean a re-render per square crossed; see the
  // note on the board in combat.css if a 30x30 grid ever feels sluggish.
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // A token being dragged, with the offset from its anchor to the square it was
  // grabbed by — that's what keeps a 2x2 token from jumping when you pick it up
  // anywhere other than its top-left square.
  const [drag, setDrag] = useState<{ id: string; dr: number; dc: number } | null>(
    null,
  );

  // A ref, not state: the paint latch changes on every mousedown/mouseup and
  // nothing renders differently for it, so re-rendering the grid would be waste.
  const paintingRef = useRef(false);

  useEffect(() => {
    try {
      if (doc) localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
      else localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error("Problem saving the combat map:", err);
    }
  }, [doc]);

  // On window, not on the board: a drag very often ends with the pointer off the
  // grid, and a mouseup there still has to end it. React's own listeners sit on
  // #root, inside window, so a cell's onMouseUp has already run and committed a
  // token move by the time this fires — here it only clears the state, which
  // makes "released outside the board" mean "dropped nowhere".
  useEffect(() => {
    function endGesture() {
      paintingRef.current = false;
      setDrag(null);
    }
    window.addEventListener("mouseup", endGesture);
    return () => window.removeEventListener("mouseup", endGesture);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isDm) return;

      // Typing in the token form stays typing — without this, Backspace while
      // fixing a label would delete the selected token instead of a character.
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }

      if (e.key === "Escape") {
        // One layer at a time, like the Maps drawer: abandon a drag in
        // progress, then the armed token, and only then the selection.
        if (drag) setDrag(null);
        else if (pending) setPending(null);
        else setSelectedId(null);
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault(); // Backspace is "back" in some browsers
        setDoc((d) => (d ? withoutToken(d, selectedId) : d));
        setSelectedId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDm, drag, pending, selectedId]);

  if (authLoading) return <p>Loading...</p>;

  if (!doc) {
    return (
      <div className="combat">
        <h1>Combat Map</h1>
        {isDm ? (
          <SetupForm
            onCreate={(cols, rows) =>
              setDoc({
                version: 1,
                cols,
                rows,
                cells: Array.from({ length: cols * rows }, () => null),
                tokens: [],
              })
            }
          />
        ) : (
          <p className="combat__empty">
            The DM has not set up a combat map yet.
          </p>
        )}
      </div>
    );
  }

  // The nullable state, narrowed once into a plain const. TypeScript won't
  // carry the `if (!doc)` check above into the closures below, and everything
  // from here on is only reachable with a map present.
  const board = doc;
  const { cols } = board;

  // One lookup that both the render and the occupancy rules read, so "there's a
  // circle in that square" and "that square is taken" can never disagree.
  const tokenByIndex = tokensByIndex(board);
  const selected = board.tokens.find((token) => token.id === selectedId);

  function selectTool(next: Tool) {
    setTool(next);
    // Nothing stays armed across a tool change — an unnoticed pending token or
    // selection is how you end up moving the wrong circle later.
    setPending(null);
    setSelectedId(null);
  }

  function chooseColor(color: string) {
    setPaintColor(color);
    selectTool("paint");
  }

  function paintFrom(index: number) {
    const value = tool === "erase" ? null : paintColor;
    setDoc((d) => {
      if (!d) return d;
      const row0 = Math.floor(index / d.cols);
      const col0 = index % d.cols;
      // Cloned only once something actually changes. A drag re-enters the same
      // squares constantly, and without this every crossing would rewrite the
      // whole grid and hit storage again.
      let cells: (string | null)[] | null = null;
      for (let r = row0; r < Math.min(row0 + brush, d.rows); r++) {
        for (let c = col0; c < Math.min(col0 + brush, d.cols); c++) {
          const at = r * d.cols + c;
          if (d.cells[at] === value) continue;
          if (!cells) cells = d.cells.slice();
          cells[at] = value;
        }
      }
      return cells ? { ...d, cells } : d;
    });
  }

  function isPainting() {
    return isDm && (tool === "paint" || tool === "erase");
  }

  // Where a dragged token's top-left square lands, given the square the cursor
  // is over and how far into the token it was grabbed.
  function anchorFromGrab(index: number, size: TokenSize, dr: number, dc: number) {
    return fitAnchor(board, Math.floor(index / cols) - dr, (index % cols) - dc, size);
  }

  function handleCellMouseDown(e: MouseEvent<HTMLButtonElement>, index: number) {
    if (!isDm) return;

    if (tool === "token") {
      // While a token is armed, a press is for placing it, not for grabbing
      // something else.
      if (pending) return;
      const token = tokenByIndex.get(index);
      if (!token) return;
      e.preventDefault();
      setDrag({
        id: token.id,
        dr: Math.floor(index / cols) - token.row,
        dc: (index % cols) - token.col,
      });
      return;
    }

    if (!isPainting()) return;
    e.preventDefault(); // no focus ring, no text selection while dragging
    paintingRef.current = true;
    paintFrom(index);
  }

  // Mouse events, not pointer events: the pressed element captures the pointer
  // by default, so onPointerEnter would never fire on the squares you drag ONTO.
  // The buttons check catches a mouseup that happened off-window; the ref
  // catches a drag that started outside the grid entirely.
  function handleCellMouseEnter(e: MouseEvent<HTMLButtonElement>, index: number) {
    if (!isDm) return;
    setHoverIndex(index);
    if (!isPainting()) return;
    if (paintingRef.current && e.buttons === 1) paintFrom(index);
  }

  function handleCellMouseUp(index: number) {
    if (!drag) return;
    const token = board.tokens.find((t) => t.id === drag.id);
    setDrag(null);
    if (!token) return;

    const at = anchorFromGrab(index, token.size, drag.dr, drag.dc);
    // Dropped where it started: leave the doc alone and let the click that
    // follows read as a plain select/deselect. (A drag that ends on a different
    // square fires no click at all, since the press and release targets differ.)
    if (at.row === token.row && at.col === token.col) return;
    if (!blockIsFree(board, at.row, at.col, token.size, token.id)) return;

    setDoc((d) =>
      d
        ? {
            ...d,
            tokens: d.tokens.map((t) =>
              t.id === token.id ? { ...t, row: at.row, col: at.col } : t,
            ),
          }
        : d,
    );
    setSelectedId(null);
  }

  function handleCellClick(index: number) {
    if (!isDm || tool !== "token") return;
    const row = Math.floor(index / cols);
    const col = index % cols;
    const token = tokenByIndex.get(index);

    if (pending) {
      const at = fitAnchor(board, row, col, pending.size);
      // Occupied or too big for the grid — the hint already explains the rule.
      if (!blockIsFree(board, at.row, at.col, pending.size, null)) return;
      const placed: CombatToken = {
        id: newTokenId(),
        label: pending.label,
        color: pending.color,
        row: at.row,
        col: at.col,
        size: pending.size,
      };
      setDoc((d) => (d ? { ...d, tokens: [...d.tokens, placed] } : d));
      setPending(null);
      return;
    }

    // A click on some other token switches the selection to it.
    if (token && token.id !== selectedId) {
      setSelectedId(token.id);
      return;
    }

    if (selected) {
      // Deliberately reachable from the selected token's own squares: that's
      // the only way to nudge a 2x2 token one square, since its destination
      // block necessarily overlaps where it already stands.
      const at = fitAnchor(board, row, col, selected.size);
      if (at.row === selected.row && at.col === selected.col) {
        setSelectedId(null); // clicked where it already is — read as "done"
        return;
      }
      if (!blockIsFree(board, at.row, at.col, selected.size, selected.id)) return;
      setDoc((d) =>
        d
          ? {
              ...d,
              tokens: d.tokens.map((t) =>
                t.id === selected.id ? { ...t, row: at.row, col: at.col } : t,
              ),
            }
          : d,
      );
      // Deselect after a move: leaving it armed makes the next stray click
      // teleport the token again.
      setSelectedId(null);
    }
  }

  function handleNewGrid() {
    if (
      !window.confirm("Delete this combat map and start over? This cannot be undone.")
    ) {
      return;
    }
    setDoc(null);
    setPending(null);
    setSelectedId(null);
  }

  function hint(): string {
    if (drag) return "Drop it on a free square. Release outside the board to cancel.";
    if (pending) {
      const size = pending.size === 2 ? " It covers 2×2 squares." : "";
      return `Click a square to place "${pending.label}".${size}`;
    }
    if (selected) {
      return `${selected.label} selected — click a square to move it there, or press Delete to remove it.`;
    }
    if (tool === "token") {
      return "Drag a token to move it, or name a new one and click a square to place it.";
    }
    const verb = tool === "erase" ? "clear" : "paint";
    const tail = tool === "erase" ? " Tokens are left alone." : "";
    if (brush === 1) return `Click or drag across the grid to ${verb}.${tail}`;
    return `Click or drag to ${verb} ${brush}×${brush} blocks, filling down and right from the square you click.${tail}`;
  }

  // Everything the overlay needs to draw the drag in progress. dragAt is null
  // once the cursor leaves the board, which is what makes the token snap back
  // to where it still officially stands.
  const dragged = drag ? board.tokens.find((t) => t.id === drag.id) : undefined;
  const dragAt =
    drag && dragged && hoverIndex !== null
      ? anchorFromGrab(hoverIndex, dragged.size, drag.dr, drag.dc)
      : null;
  const dragBlocked =
    dragged !== undefined &&
    dragAt !== null &&
    !blockIsFree(board, dragAt.row, dragAt.col, dragged.size, dragged.id);

  // The outline that shows what the next click will affect. It has to clamp the
  // same way the action it previews clamps, and those differ: a brush truncates
  // at the edge and fills fewer squares, while a token slides back to fit.
  // Skipped mid-drag, where the token itself is already the preview.
  const ghost = pending
    ? { size: pending.size, exceptId: null }
    : selected
      ? { size: selected.size, exceptId: selected.id }
      : null;

  let outline:
    | { row: number; col: number; spanCols: number; spanRows: number; blocked: boolean }
    | null = null;
  if (isDm && !drag && hoverIndex !== null) {
    const row = Math.floor(hoverIndex / cols);
    const col = hoverIndex % cols;
    if (ghost) {
      const at = fitAnchor(board, row, col, ghost.size);
      outline = {
        row: at.row,
        col: at.col,
        spanCols: ghost.size,
        spanRows: ghost.size,
        blocked: !blockIsFree(board, at.row, at.col, ghost.size, ghost.exceptId),
      };
    } else {
      const span = isPainting() ? brush : 1;
      outline = {
        row,
        col,
        spanCols: Math.min(span, cols - col),
        spanRows: Math.min(span, board.rows - row),
        blocked: false,
      };
    }
  }

  return (
    <div
      className={
        "combat" + (isDm ? " combat--dm" : "") + (drag ? " combat--dragging" : "")
      }
    >
      <h1>Combat Map</h1>

      {isDm && (
        <>
          <div className="combat__toolbar">
            <div className="combat__group">
              {(Object.keys(TOOL_LABELS) as Tool[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={"combat__btn" + (tool === t ? " is-active" : "")}
                  aria-pressed={tool === t}
                  onClick={() => selectTool(t)}
                >
                  {TOOL_LABELS[t]}
                </button>
              ))}
            </div>

            <div className="combat__group">
              <span className="combat__grouplabel">Brush</span>
              {BRUSHES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={"combat__btn" + (brush === size ? " is-active" : "")}
                  aria-pressed={brush === size}
                  title={`${size}×${size} squares — ${feet(size)} across`}
                  onClick={() => setBrush(size)}
                >
                  {size}×{size}
                </button>
              ))}
            </div>

            <div className="combat__group">
              {PALETTE.map((swatch) => (
                <button
                  key={swatch.color}
                  type="button"
                  className={
                    "combat__swatch" +
                    (tool === "paint" && paintColor === swatch.color
                      ? " is-active"
                      : "")
                  }
                  style={{ backgroundColor: swatch.color }}
                  title={swatch.name}
                  aria-label={swatch.name}
                  onClick={() => chooseColor(swatch.color)}
                />
              ))}
              <input
                className="combat__custom"
                type="color"
                value={paintColor}
                title="Custom color"
                aria-label="Custom color"
                onChange={(e) => chooseColor(e.target.value)}
              />
            </div>

            <button
              type="button"
              className="combat__btn combat__btn--danger combat__push"
              onClick={handleNewGrid}
            >
              New grid
            </button>
          </div>

          {tool === "token" && (
            <div className="combat__tokenbar">
              <TokenForm
                onArm={(label, color, size) => {
                  setPending({ label, color, size });
                  setSelectedId(null);
                }}
              />
              {selected && (
                <button
                  type="button"
                  className="combat__btn combat__btn--danger"
                  onClick={() => {
                    setDoc((d) => (d ? withoutToken(d, selected.id) : d));
                    setSelectedId(null);
                  }}
                >
                  Remove {selected.label}
                </button>
              )}
            </div>
          )}

          <p className="combat__hint">{hint()}</p>
        </>
      )}

      {/* --cols and --rows drive both grids below: the squares, and the
          overlay of tokens and outlines sitting on top of them. */}
      <div
        className="combat__board"
        style={{ "--cols": cols, "--rows": board.rows } as CSSProperties}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {board.cells.map((color, i) => {
          const token = tokenByIndex.get(i);
          return (
            <button
              key={i}
              type="button"
              // Real buttons for the hit target and cursor handling, but kept
              // out of the tab order: a 30x30 grid would otherwise bury the
              // rest of the page behind 900 tab stops. Painting is
              // pointer-driven in this prototype.
              tabIndex={-1}
              className={
                "combat__cell" +
                (token && tool === "token" && !pending ? " is-grabbable" : "")
              }
              style={color ? { backgroundColor: color } : undefined}
              title={token?.label}
              onMouseDown={(e) => handleCellMouseDown(e, i)}
              onMouseEnter={(e) => handleCellMouseEnter(e, i)}
              onMouseUp={() => handleCellMouseUp(i)}
              onClick={() => handleCellClick(i)}
            />
          );
        })}

        {/* Tokens live in their own grid stacked over the squares rather than
            inside them, because a 2x2 token has to span four cells that are
            four separate buttons. combat.css makes this layer transparent to
            the mouse, so every click still lands on the square underneath and
            the squares stay paintable under a token. */}
        <div className="combat__overlay">
          {board.tokens.map((token) => {
            // A token being dragged renders at the square it would land on
            // rather than where it still lives in the doc, so it follows the
            // cursor and shows plainly when the drop is blocked.
            const dragging = dragAt !== null && dragged?.id === token.id;
            const at = dragging ? dragAt : token;
            return (
              <span
                key={token.id}
                className={
                  "combat__token" +
                  (token.size === 2 ? " combat__token--lg" : "") +
                  (token.id === selectedId ? " is-selected" : "") +
                  (dragging ? " is-dragging" : "") +
                  (dragging && dragBlocked ? " is-blocked" : "")
                }
                style={{
                  backgroundColor: token.color,
                  gridColumn: `${at.col + 1} / span ${token.size}`,
                  gridRow: `${at.row + 1} / span ${token.size}`,
                }}
              >
                {token.label.slice(0, 2).toUpperCase()}
              </span>
            );
          })}

          {/* What the next click will change — see the `outline` block above
              for which squares that is in each mode. */}
          {outline && (
            <span
              className={
                "combat__brushbox" +
                (tool === "erase" ? " combat__brushbox--erase" : "") +
                (outline.blocked ? " is-blocked" : "")
              }
              style={{
                gridColumn: `${outline.col + 1} / span ${outline.spanCols}`,
                gridRow: `${outline.row + 1} / span ${outline.spanRows}`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// DM only, and only until a map exists. Dimensions are fixed once the grid is
// built — resizing would have to decide what happens to painted squares and
// tokens outside the new bounds, which is not worth answering in a prototype.
function SetupForm({
  onCreate,
}: {
  onCreate: (cols: number, rows: number) => void;
}) {
  // Strings, not numbers, for the same reason NewRecapForm does it: a
  // number-typed state can't hold the empty box you get halfway through
  // clearing and retyping the field.
  const [colsDraft, setColsDraft] = useState("20");
  const [rowsDraft, setRowsDraft] = useState("20");
  const [error, setError] = useState<string | null>(null);

  const cols = Number(colsDraft);
  const rows = Number(rowsDraft);
  const valid = isDim(cols) && isDim(rows);

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    // min/max on the inputs are a hint, not a guarantee — a typed-in 99 or 2.5
    // still arrives here.
    if (!valid) {
      setError(`Width and height must be whole numbers from 1 to ${MAX_DIM}`);
      return;
    }
    onCreate(cols, rows);
  }

  return (
    <form className="combat-form" onSubmit={handleSubmit}>
      <p className="combat__lead">
        How big is this fight? Up to {MAX_DIM} squares each way.
      </p>

      <div className="combat-form__row">
        <span className="combat-form__cell">
          <label className="combat-form__label" htmlFor="grid-cols">
            Width
          </label>
          <input
            id="grid-cols"
            className="combat-form__number"
            type="number"
            min={1}
            max={MAX_DIM}
            step={1}
            required
            value={colsDraft}
            onChange={(e) => setColsDraft(e.target.value)}
          />
        </span>
        <span className="combat-form__cell">
          <label className="combat-form__label" htmlFor="grid-rows">
            Height
          </label>
          <input
            id="grid-rows"
            className="combat-form__number"
            type="number"
            min={1}
            max={MAX_DIM}
            step={1}
            required
            value={rowsDraft}
            onChange={(e) => setRowsDraft(e.target.value)}
          />
        </span>
      </div>

      <p className="combat-form__note">
        Each square is {FEET_PER_SQUARE} ft
        {valid && (
          <>
            , so that&rsquo;s{" "}
            <strong>
              {feet(cols)} × {feet(rows)}
            </strong>{" "}
            of battlefield
          </>
        )}
        .
      </p>

      <button type="submit" className="combat__btn combat__btn--primary">
        Build grid
      </button>
      {error && <p className="combat__error">{error}</p>}
    </form>
  );
}

// Arms a token for placement rather than placing one directly: the square it
// goes in is chosen by clicking the board, not typed into a form.
function TokenForm({
  onArm,
}: {
  onArm: (label: string, color: string, size: TokenSize) => void;
}) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#c9b27a");
  const [size, setSize] = useState<TokenSize>(1);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = label.trim();
    if (trimmed === "") {
      setError("Give the token a name");
      return;
    }
    setError(null);
    // The label, color and size stay in the form after arming, so a second
    // goblin is two keystrokes rather than a re-fill.
    onArm(trimmed, color, size);
  }

  return (
    <form className="combat-form combat-form--inline" onSubmit={handleSubmit}>
      <label className="combat-form__label" htmlFor="token-label">
        Token
      </label>
      <input
        id="token-label"
        className="combat-form__field"
        type="text"
        value={label}
        placeholder="Strahd"
        onChange={(e) => setLabel(e.target.value)}
      />
      <input
        className="combat__custom"
        type="color"
        value={color}
        title="Token color"
        aria-label="Token color"
        onChange={(e) => setColor(e.target.value)}
      />
      <button
        type="button"
        className={"combat__btn" + (size === 1 ? " is-active" : "")}
        aria-pressed={size === 1}
        title={`Medium or smaller — ${feet(1)} across`}
        onClick={() => setSize(1)}
      >
        1×1
      </button>
      <button
        type="button"
        className={"combat__btn" + (size === 2 ? " is-active" : "")}
        aria-pressed={size === 2}
        title={`Large — ${feet(2)} across`}
        onClick={() => setSize(2)}
      >
        2×2
      </button>
      <button type="submit" className="combat__btn combat__btn--primary">
        Place
      </button>
      {error && <p className="combat__error">{error}</p>}
    </form>
  );
}
