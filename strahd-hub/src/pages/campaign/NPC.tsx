import { SubmitEvent, useState } from "react";
import { useAuth } from "../../services/AuthContext";
import { useCampaign } from "../../components/CampaignLayout";
import { useNpcs } from "../../hooks/useNpcs";
import { useLocations } from "../../hooks/useLocations";
import { Npc, NpcEdit } from "../../services/npcs";
import { errorMessage } from "../../lib/errors";
import "./npc.css";

// Portraits are bundled, not served from a public path: the glob gives every
// file a content hash and turns a missing one into a lookup that returns
// undefined instead of a 404 painted into the layout. The row stores a bare
// uuid, and this is the only place that knows it means a file.
const PORTRAITS = import.meta.glob<string>("../../assets/portraits/*.webp", {
  eager: true,
  import: "default",
});

function portraitSrc(portraitKey: string | null): string | null {
  if (!portraitKey) return null;
  return PORTRAITS[`../../assets/portraits/${portraitKey}.webp`] ?? null;
}

export function Npcs() {
  const { loading: authLoading } = useAuth();
  // Non-null by construction — this route sits under CampaignLayout.
  const campaign = useCampaign();
  // campaign.isDm, not profile.role: the policies behind these controls ask
  // is_campaign_dm, so a global DM who is only a player here must not be shown
  // buttons the database would then refuse. This gate and the RLS agree.
  const isDm = campaign.isDm;
  const {
    data: npcs = [],
    isLoading: npcsLoading,
    error,
    saveNpc,
    saveDmNotes,
    toggleVisibility,
    toggleVisibilityError,
  } = useNpcs(campaign.id);
  // Only for the DM's location picker. Players never open the editor, and the
  // list renders the location name that came back on the NPC itself.
  const { data: locations = [] } = useLocations(campaign.id);

  // Held by id rather than as a copied object, so an open editor re-renders
  // from the list and shows the saved value instead of a stale snapshot.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notesId, setNotesId] = useState<string | null>(null);
  const [showVisibilityPanel, setShowVisibilityPanel] = useState(false);

  if (authLoading || npcsLoading) return <p>Loading...</p>;
  if (error) return <p>{error.message}</p>;

  // No reveal filter. RLS already dropped hidden rows from a player's response,
  // so this list is exactly what this user may see. isDm survives to show the
  // DM's controls and to mark rows the party cannot see yet; dmNotes needs no
  // check at all, since RLS left that key absent for everyone else.
  return (
    <div className="npcs">
      <div className="npcs-header">
        <h2 className="npcs-title">Characters of Barovia</h2>
        {isDm && (
          <button
            className="npcs-visibility-toggle"
            onClick={() => setShowVisibilityPanel(!showVisibilityPanel)}
            title={
              showVisibilityPanel
                ? "Hide visibility panel"
                : "Show visibility panel"
            }
          >
            👁️ Visibility
          </button>
        )}
      </div>

      {npcs.length === 0 && (
        <p className="npc-card__empty">No one has made themselves known yet.</p>
      )}

      <div className="npc-list">
        {npcs.map((npc) => {
          const portrait = portraitSrc(npc.portraitKey);
          return (
            <article
              key={npc.id}
              className={"npc-card" + (!npc.isRevealed ? " is-hidden" : "")}
            >
              {portrait && (
                <img
                  className="npc-card__portrait"
                  src={portrait}
                  alt={npc.name}
                />
              )}

              <div className="npc-card__body">
                {editingId === npc.id ? (
                  // key: a fresh editor per NPC, so a draft can never carry
                  // over from the last one it was opened on.
                  <NpcEditor
                    key={npc.id}
                    npc={npc}
                    locations={locations}
                    onSave={saveNpc}
                    onClose={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <h3 className="npc-card__name">
                      {npc.name}
                      {!npc.isRevealed && (
                        <span className="npc-card__hidden-tag">hidden</span>
                      )}
                    </h3>
                    <div className="npc-card__rule"></div>
                    {npc.locationName && (
                      <p className="npc-card__location">{npc.locationName}</p>
                    )}
                    <p className="npc-card__desc">
                      {npc.description ?? (
                        <span className="npc-card__empty">
                          No description yet.
                        </span>
                      )}
                    </p>
                    {isDm && (
                      <div className="npc-card__actions">
                        <button
                          className="npc-card__edit"
                          onClick={() => setEditingId(npc.id)}
                        >
                          Edit
                        </button>
                        <button
                          className="npc-card__edit"
                          onClick={() =>
                            setNotesId(notesId === npc.id ? null : npc.id)
                          }
                        >
                          {notesId === npc.id ? "Close notes" : "DM notes"}
                        </button>
                      </div>
                    )}
                  </>
                )}

                {notesId === npc.id ? (
                  <DmNotesEditor
                    key={npc.id}
                    npc={npc}
                    onSave={saveDmNotes}
                    onClose={() => setNotesId(null)}
                  />
                ) : (
                  npc.dmNotes && (
                    <p className="npc-card__dm">DM notes: {npc.dmNotes}</p>
                  )
                )}
              </div>
            </article>
          );
        })}
      </div>

      {isDm && showVisibilityPanel && (
        <aside className="visibility-panel">
          <div className="visibility-panel__header">
            <h3>NPC Visibility</h3>
            <button
              className="visibility-panel__close"
              aria-label="Close"
              onClick={() => setShowVisibilityPanel(false)}
            >
              ×
            </button>
          </div>
          <div className="visibility-panel__list">
            {npcs.map((npc) => (
              <div key={npc.id} className="visibility-panel__item">
                <button
                  className="visibility-panel__toggle"
                  onClick={() =>
                    toggleVisibility({ id: npc.id, isRevealed: !npc.isRevealed })
                  }
                  title={
                    npc.isRevealed ? "Hide from players" : "Show to players"
                  }
                >
                  {npc.isRevealed ? "👁️" : "👁️‍🗨️"}
                </button>
                <span className="visibility-panel__name">{npc.name}</span>
              </div>
            ))}
          </div>
          {toggleVisibilityError && (
            <p className="visibility-panel__error">
              {errorMessage(toggleVisibilityError, "Problem updating visibility")}
            </p>
          )}
        </aside>
      )}
    </div>
  );
}

// The DM's editor for the three fields that travel together. Draft, saving and
// error state live here rather than in Npcs, so unmounting it is the whole of
// "cancel" — nothing to reset — and a keystroke re-renders the form, not the
// roster.
function NpcEditor({
  npc,
  locations,
  onSave,
  onClose,
}: {
  npc: Npc;
  locations: { id: string; name: string }[];
  onSave: (vars: { id: string; fields: NpcEdit }) => Promise<unknown>;
  onClose: () => void;
}) {
  const [name, setName] = useState(npc.name);
  const [description, setDescription] = useState(npc.description ?? "");
  const [locationId, setLocationId] = useState(npc.locationId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: npc.id,
        fields: {
          // Sent untrimmed on purpose: the database trims it, and reading the
          // result back is how the field proves what was actually stored.
          name,
          // Sent as typed, blank included. updateNpc is where a cleared
          // description becomes null, so the card shows "No description yet"
          // no matter which caller did the clearing.
          description,
          // "" is the placeholder option, and it means no known home.
          location_id: locationId === "" ? null : locationId,
        },
      });
      onClose();
    } catch (err) {
      // Stay open holding the draft: closing here would throw away text the DM
      // just wrote and the database never took.
      console.error("Problem saving NPC:", err);
      setError(errorMessage(err, "Problem saving NPC"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="npc-edit" onSubmit={handleSubmit}>
      <label className="npc-edit__label" htmlFor={`npc-name-${npc.id}`}>
        Name
      </label>
      <input
        id={`npc-name-${npc.id}`}
        className="npc-edit__field"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={saving}
        maxLength={60}
        required
        autoFocus
      />

      <label className="npc-edit__label" htmlFor={`npc-loc-${npc.id}`}>
        Location
      </label>
      <select
        id={`npc-loc-${npc.id}`}
        className="npc-edit__field"
        value={locationId}
        onChange={(e) => setLocationId(e.target.value)}
        disabled={saving}
      >
        <option value="">No known home</option>
        {locations.map((loc) => (
          <option key={loc.id} value={loc.id}>
            {loc.name}
          </option>
        ))}
      </select>

      <label className="npc-edit__label" htmlFor={`npc-desc-${npc.id}`}>
        Description
      </label>
      <textarea
        id={`npc-desc-${npc.id}`}
        className="npc-edit__field"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={saving}
        rows={5}
      />

      <div className="npc-edit__actions">
        <button
          type="button"
          className="npc-edit__btn"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="npc-edit__btn npc-edit__btn--save"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {error && <p className="npc-edit__error">{error}</p>}
    </form>
  );
}

// Separate from NpcEditor because it writes to a different table through a
// different policy: this one can fail on its own while the NPC itself saves
// fine, and the error belongs next to the field that caused it.
function DmNotesEditor({
  npc,
  onSave,
  onClose,
}: {
  npc: Npc;
  onSave: (vars: { id: string; notes: string }) => Promise<unknown>;
  onClose: () => void;
}) {
  // "" when there is no note, which is also what an emptied note stores. There
  // is no sentinel to strip out first.
  const [draft, setDraft] = useState(npc.dmNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({ id: npc.id, notes: draft });
      onClose();
    } catch (err) {
      console.error("Problem saving DM notes:", err);
      setError(errorMessage(err, "Problem saving DM notes"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="npc-edit npc-edit--notes" onSubmit={handleSubmit}>
      <label className="npc-edit__label" htmlFor={`npc-notes-${npc.id}`}>
        DM notes
      </label>
      <textarea
        id={`npc-notes-${npc.id}`}
        className="npc-edit__field"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={saving}
        rows={4}
        autoFocus
      />
      <div className="npc-edit__actions">
        <button
          type="button"
          className="npc-edit__btn"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="npc-edit__btn npc-edit__btn--save"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save notes"}
        </button>
      </div>
      {error && <p className="npc-edit__error">{error}</p>}
    </form>
  );
}
