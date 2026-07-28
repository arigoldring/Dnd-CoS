import { SubmitEvent, useState } from "react";
import { useAuth } from "../services/AuthContext";
import { useRecaps } from "../Hooks/useRecaps";
import { Recap } from "../services/recaps";
import "./recaps.css";

// What the header says under the title. Note this reads lastEditedAt, not
// lastEditedByName, to decide whether the recap has been touched: the name is
// also null when the editor's profile has since been deleted, so on its own it
// can't tell "nobody has edited this" from "edited by someone since gone".
function byline(recap: Recap): string {
  if (!recap.lastEditedAt) return "no edits yet";
  const who = recap.lastEditedByName ?? "unknown";
  const when = new Date(recap.lastEditedAt).toLocaleDateString();
  return `last edited by ${who} · ${when}`;
}

export function Recaps() {
  const { profile, loading: authLoading } = useAuth();
  const isDm = profile?.role === "dm";
  const { recaps, loading, error, addRecap, saveRecap, removeRecap } =
    useRecaps();

  // One id, not a flag per card — that's what makes this an accordion rather
  // than a pile of independently open panels. editingId is tracked separately
  // so opening a different recap can't leave a stale editor mounted behind it.
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (authLoading || loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  // The list is sorted by session number descending, so the head of it is the
  // highest number so far. Purely a suggestion for the form — the DM can type
  // over it to backfill a session that was never written up.
  const suggestedNumber = (recaps[0]?.sessionNumber ?? -1) + 1;

  return (
    <div className="recaps">
      <h1 className="recaps__heading">Session Recaps</h1>

      {isDm &&
        (creating ? (
          <NewRecapForm
            suggestedNumber={suggestedNumber}
            onCreate={addRecap}
            onClose={() => setCreating(false)}
          />
        ) : (
          <button
            className="recaps__new"
            onClick={() => setCreating(true)}
          >
            New recap
          </button>
        ))}

      {recaps.length === 0 ? (
        <p className="recaps__empty">
          No recaps yet.{isDm && " Write up the first session above."}
        </p>
      ) : (
        recaps.map((recap) => (
          <RecapCard
            key={recap.id}
            recap={recap}
            isDm={isDm}
            isOpen={openId === recap.id}
            isEditing={editingId === recap.id}
            onToggle={() => {
              // Collapsing or switching cards drops any open editor with it, so
              // an unsaved draft can never bleed onto the next recap.
              setEditingId(null);
              setOpenId((cur) => (cur === recap.id ? null : recap.id));
            }}
            onEdit={() => setEditingId(recap.id)}
            onStopEditing={() => setEditingId(null)}
            onSave={saveRecap}
            onDelete={removeRecap}
          />
        ))
      )}
    </div>
  );
}

function RecapCard({
  recap,
  isDm,
  isOpen,
  isEditing,
  onToggle,
  onEdit,
  onStopEditing,
  onSave,
  onDelete,
}: {
  recap: Recap;
  isDm: boolean;
  isOpen: boolean;
  isEditing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onStopEditing: () => void;
  onSave: (id: string, title: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  // Delete state lives per card so a failure reports next to the recap that
  // failed, rather than as one page-level message that doesn't say which.
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm(`Delete ${recap.displayTitle}? This cannot be undone.`))
      return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(recap.id);
      // No setState after this point: a successful delete unmounts this card.
    } catch (err) {
      console.error("Problem deleting recap:", err);
      setDeleteError(
        err instanceof Error ? err.message : "Problem deleting recap",
      );
      setDeleting(false);
    }
  }

  return (
    <article className="recap">
      {/* A real button, not a styled div: that's what gives the accordion
          Enter/Space and focus handling for free, and aria-expanded is what
          tells a screen reader the header controls something. */}
      <h2 className="recap__heading">
        <button
          className="recap__header"
          aria-expanded={isOpen}
          onClick={onToggle}
        >
          <span className="recap__title">{recap.displayTitle}</span>
          <span className="recap__byline">{byline(recap)}</span>
        </button>
      </h2>

      {isOpen &&
        (isEditing ? (
          // key: a fresh editor per recap, so its draft can never carry over
          // from the last recap it was opened on.
          <RecapEditor
            key={recap.id}
            recap={recap}
            onSave={onSave}
            onClose={onStopEditing}
          />
        ) : (
          <div className="recap__panel">
            <p className="recap__body">
              {recap.body.trim() === "" ? (
                <span className="recap__empty">No write-up yet.</span>
              ) : (
                recap.body
              )}
            </p>
            <div className="recap__actions">
              {/* Editing is open to every player on purpose — the campaign
                  log belongs to the table, not to whoever typed it first. */}
              <button className="recap__btn" onClick={onEdit}>
                Edit
              </button>
              {isDm && (
                <button
                  className="recap__btn recap__btn--danger"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
            {deleteError && <p className="recap__error">{deleteError}</p>}
          </div>
        ))}
    </article>
  );
}

// DM only. The session number is set here and nowhere else — the trigger in
// 007_recaps.sql pins it on every UPDATE, so this form is the only chance to
// choose it.
function NewRecapForm({
  suggestedNumber,
  onCreate,
  onClose,
}: {
  suggestedNumber: number;
  onCreate: (sessionNumber: number, title: string, body: string) => Promise<void>;
  onClose: () => void;
}) {
  // Held as a string, not a number: a number-typed state can't represent the
  // empty box you get midway through clearing and retyping the field.
  const [numberDraft, setNumberDraft] = useState(String(suggestedNumber));
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();

    // We chose not to add a `check (session_number >= 0)` to the table, so this
    // is the only guard against a negative or fractional session number.
    const sessionNumber = Number(numberDraft);
    if (!Number.isInteger(sessionNumber) || sessionNumber < 0) {
      setError("Session number must be a whole number, 0 or higher");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onCreate(sessionNumber, title, body);
      onClose();
    } catch (err) {
      // Stay open holding the draft. This is where a duplicate session number
      // lands, and closing would throw away a write-up over a fixable typo.
      console.error("Problem creating recap:", err);
      setError(err instanceof Error ? err.message : "Problem creating recap");
      setSaving(false);
    }
  }

  return (
    <form className="recap-form" onSubmit={handleSubmit}>
      <label className="recap-form__label" htmlFor="new-number">
        Session number
      </label>
      <input
        id="new-number"
        className="recap-form__number"
        type="number"
        min={0}
        step={1}
        required
        value={numberDraft}
        onChange={(e) => setNumberDraft(e.target.value)}
        disabled={saving}
      />

      <label className="recap-form__label" htmlFor="new-title">
        Title <span className="recap-form__hint">(optional)</span>
      </label>
      <input
        id="new-title"
        className="recap-form__field"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        // Placeholder, never a value: leaving this blank must send null so the
        // recap keeps naming itself after its number.
        placeholder={`Session ${numberDraft}`}
        disabled={saving}
      />

      <label className="recap-form__label" htmlFor="new-body">
        What happened
      </label>
      <textarea
        id="new-body"
        className="recap-form__field"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={10}
        disabled={saving}
      />

      <div className="recap-form__actions">
        <button
          type="button"
          className="recap__btn"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="recap__btn recap__btn--primary"
          disabled={saving}
        >
          {saving ? "Creating..." : "Create recap"}
        </button>
      </div>
      {error && <p className="recap__error">{error}</p>}
    </form>
  );
}

// Open to every authenticated player. No session-number field: the trigger
// pins that column on update, so showing one would be a lie.
function RecapEditor({
  recap,
  onSave,
  onClose,
}: {
  recap: Recap;
  onSave: (id: string, title: string, body: string) => Promise<void>;
  onClose: () => void;
}) {
  // recap.title, NOT recap.displayTitle. Seeding this with the derived
  // "Session 3" would silently convert an auto-named recap into a hard-coded
  // one the first time anyone saved an edit to its body.
  const [title, setTitle] = useState(recap.title ?? "");
  const [body, setBody] = useState(recap.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(recap.id, title, body);
      onClose();
    } catch (err) {
      // Stay open on failure, holding the draft: closing here would discard
      // text the player just wrote and that the database never took.
      console.error("Problem saving recap:", err);
      setError(err instanceof Error ? err.message : "Problem saving recap");
      setSaving(false);
    }
  }

  return (
    <form className="recap-form" onSubmit={handleSubmit}>
      <label className="recap-form__label" htmlFor={`title-${recap.id}`}>
        Title <span className="recap-form__hint">(blank to use the number)</span>
      </label>
      <input
        id={`title-${recap.id}`}
        className="recap-form__field"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={`Session ${recap.sessionNumber}`}
        disabled={saving}
      />

      <label className="recap-form__label" htmlFor={`body-${recap.id}`}>
        What happened
      </label>
      <textarea
        id={`body-${recap.id}`}
        className="recap-form__field"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={12}
        disabled={saving}
        autoFocus
      />

      <div className="recap-form__actions">
        <button
          type="button"
          className="recap__btn"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="recap__btn recap__btn--primary"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {error && <p className="recap__error">{error}</p>}
    </form>
  );
}
