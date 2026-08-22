import { SubmitEvent, useId, useState } from "react";
import { errorMessage } from "../lib/errors";
import type { CustomDescription } from "../services/characterDescriptions";
import "./customDescription.css";

/**
 * The block that goes where a detail card's description paragraph used to be,
 * when that card is showing something a character owns rather than something in
 * the catalogue: the player's own telling on top, the book's text one click
 * behind it, and the editor that writes the first of those.
 *
 * Shared by SpellDetailCard and ItemDetailCard through their `descriptionSlot`
 * prop, so a spell and a sword read the same way. It owns all of the state the
 * feature needs — whether the original is showing, whether the editor is open,
 * the draft, the save — which is what keeps both cards' own signatures down to
 * two optional props and leaves Shop and the grimoire untouched.
 *
 * Its stylesheet is its own rather than a page's, unlike SpellDetailCard (which
 * borrows spells.css) and ItemDetailCard (shop.css). Those classes each have a
 * page they came from; these don't, and copying them into two page sheets would
 * be two places to keep in step. Colours come from the --sh-* tokens on :root,
 * never --bone/--blood, which are scoped to .shop and .ch and would resolve to
 * different values under each parent.
 */
export function CustomDescriptionBlock({
  subject,
  original,
  custom,
  canEdit,
  onSave,
  onClear,
}: {
  // What the thing is, for labels and the confirm: "spell" or "item".
  subject: string;
  // The catalogue text. Always reachable, never overwritten — the whole point
  // of the disclosure rather than a replacement.
  original: string;
  // null when this character has written nothing. Never a blank string: the
  // service turns an empty draft into a delete.
  custom: CustomDescription | null;
  canEdit: boolean;
  onSave: (fields: CustomDescription) => Promise<unknown>;
  onClear: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const hasCustom =
    custom !== null &&
    (custom.customName !== null || custom.customDescription !== null);
  // The only thing that decides the LAYOUT: words of their own standing in
  // front of the book's. A rename alone doesn't — the card header already shows
  // it, and the description below is still the book's, so putting it behind a
  // "Show the original" disclosure would be hiding the only description there
  // is behind a button that claims something else is in front of it.
  const ownWords = custom?.customDescription ?? null;

  if (editing) {
    return (
      <CustomDescriptionEditor
        subject={subject}
        custom={custom}
        onSave={onSave}
        onClear={onClear}
        onClose={() => setEditing(false)}
      />
    );
  }

  if (ownWords === null) {
    return (
      <>
        {/* Exactly what the card rendered before this component existed, which
            is also what a player sees on someone else's sheet. The class is
            paired onto .item-detail-text / .spell-detail-text in the card
            sheets, so this really is the card's own description rather than a
            near-copy of it — see customDescription.css. */}
        <p className="custom-desc__original-text">{original}</p>
        {/* No empty "Your telling" frame standing open — an invitation shaped
            like content is worse than no invitation. Just a door. */}
        {canEdit && (
          <button
            type="button"
            className="custom-desc__start"
            onClick={() => setEditing(true)}
          >
            {hasCustom ? "Edit" : "Make it yours"}
          </button>
        )}
      </>
    );
  }

  return (
    <div className="custom-desc">
      <div className="custom-desc__own">
        <span className="custom-desc__label">Your telling</span>
        <p className="custom-desc__text">{ownWords}</p>
      </div>

      {/* A real button carrying aria-expanded, with the caret drawn off that
          attribute in CSS — Recaps' accordion, which does it this way because
          the state is already in the DOM for screen readers and costs no extra
          markup to show. */}
      <button
        type="button"
        className="custom-desc__reveal"
        aria-expanded={showOriginal}
        onClick={() => setShowOriginal((open) => !open)}
      >
        {showOriginal ? "Hide the original" : "Show the original"}
      </button>

      {/* __revealed, not __original-text: out from behind the disclosure it is
          no longer the card's description, so it takes the quieter treatment
          this component owns rather than the card's own. */}
      {showOriginal && <p className="custom-desc__revealed">{original}</p>}

      {canEdit && (
        <button
          type="button"
          className="custom-desc__start"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
      )}
    </div>
  );
}

// Separate component so the draft lives and dies with the form: unmounting it
// IS cancel, and there is no stale draft to clear on the way back in. The shape
// is NPC.tsx's DmNotesEditor, including staying open and holding the text when
// a save fails — closing there would throw away words the database never took.
function CustomDescriptionEditor({
  subject,
  custom,
  onSave,
  onClear,
  onClose,
}: {
  subject: string;
  custom: CustomDescription | null;
  onSave: (fields: CustomDescription) => Promise<unknown>;
  onClear: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [name, setName] = useState(custom?.customName ?? "");
  const [description, setDescription] = useState(
    custom?.customDescription ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // InvitePanel's pattern. Only one card is open at a time today, but a fixed
  // string here would be a duplicate id the moment that stops being true, and
  // the label would start pointing at the wrong field rather than at nothing.
  const nameId = useId();
  const textId = useId();

  const hasCustom =
    custom !== null &&
    (custom.customName !== null || custom.customDescription !== null);

  // SubmitEvent from "react", not FormEvent. @types/react v19 exports a generic
  // React.SubmitEvent<T> and deprecates FormEvent; this is correct on 19.2 and
  // is not to be "fixed" (CLAUDE.md).
  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // Blanking both fields and saving is a clear — the service turns it into
      // a delete, because 046/047 make a row that overrides nothing
      // unrepresentable. So the form never has to police the constraint.
      await onSave({ customName: name, customDescription: description });
      onClose();
    } catch (err) {
      console.error(`Problem saving this ${subject} description:`, err);
      setError(errorMessage(err, "Couldn't save your description"));
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!window.confirm(`Go back to the book's own words for this ${subject}?`))
      return;

    setSaving(true);
    setError(null);
    try {
      await onClear();
      onClose();
    } catch (err) {
      console.error(`Problem clearing this ${subject} description:`, err);
      setError(errorMessage(err, "Couldn't clear your description"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="custom-desc-edit" onSubmit={handleSubmit}>
      <label className="custom-desc-edit__label" htmlFor={nameId}>
        What you call it
      </label>
      <input
        id={nameId}
        className="custom-desc-edit__name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={saving}
        maxLength={60}
        placeholder="Leave blank to keep the book's name"
        autoFocus
      />

      <label className="custom-desc-edit__label" htmlFor={textId}>
        Your telling
      </label>
      <textarea
        id={textId}
        className="custom-desc-edit__field"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={saving}
        maxLength={2000}
        rows={5}
        placeholder="Leave blank to keep the book's description"
      />

      <div className="custom-desc-edit__actions">
        {/* Only offered when there is something to go back from. */}
        {hasCustom && (
          <button
            type="button"
            className="custom-desc-edit__btn custom-desc-edit__btn--danger"
            onClick={handleClear}
            disabled={saving}
          >
            Clear
          </button>
        )}
        <button
          type="button"
          className="custom-desc-edit__btn"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="custom-desc-edit__btn custom-desc-edit__btn--save"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {error && <p className="custom-desc-edit__error">{error}</p>}
    </form>
  );
}
