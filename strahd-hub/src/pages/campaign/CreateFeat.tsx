import { Navigate, useNavigate } from "react-router-dom";
import { SubmitEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCampaign } from "../../components/CampaignLayout";
import {
  createFeat,
  featCategories,
  featCategoryLabel,
  type FeatCategory,
  type NewFeat,
} from "../../services/feats";
import { errorMessage } from "../../lib/errors";
import "./createFeat.css";

/**
 * The DM's homebrew feat form, CreateItem's smaller sibling: no discriminated
 * union and no kind-conditional sections, because a feat is a feat.
 *
 * The guard uses bare campaign.isDm rather than the Feats page's showDmUi. A
 * DM who toggles "View as player" while standing on this page should lose the
 * link that got them here, not be thrown off the page mid-draft — so preview
 * hides the affordance and this decides the route. Either way 039's INSERT
 * policy is the thing actually saying no.
 */
export function CreateFeat() {
  const campaign = useCampaign();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (!campaign.isDm)
    return <Navigate to={`/campaign/${campaign.id}`} replace />;

  async function handleCreate(input: NewFeat) {
    await createFeat(campaign.id, input);
    // Called directly rather than through useFeats, the way Shop's
    // AddToPartyInventory calls addToPartyInventory: this page has no reason to
    // hold the catalogue query, only to invalidate it on the way out.
    await queryClient.invalidateQueries({ queryKey: ["feats", campaign.id] });
    navigate(`/campaign/${campaign.id}/Feats`);
  }

  return (
    <div className="create-feat">
      <p className="create-feat__eyebrow">⚒ The Forge ⚒</p>
      <h1>New Homebrew Feat</h1>
      <p className="create-feat__sub">
        Saved into this campaign's catalogue only — you'll land in the Feats
        book when it's made.
      </p>
      <HomebrewFeatForm onCreate={handleCreate} />
    </div>
  );
}

function HomebrewFeatForm({
  onCreate,
}: {
  onCreate: (input: NewFeat) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<FeatCategory>("general");
  const [prerequisite, setPrerequisite] = useState("");
  const [description, setDescription] = useState("");
  const [benefitsInput, setBenefitsInput] = useState("");
  const [repeatable, setRepeatable] = useState(false);
  const [tagsInput, setTagsInput] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (!description.trim()) {
      setError("Description is required");
      return;
    }

    // One bullet per line, blank lines dropped — the array shape without a
    // repeater widget. The same split CreateItem uses for tags, on \n instead
    // of a comma, because a benefit is a sentence and sentences contain commas.
    const benefits = benefitsInput
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const input: NewFeat = {
      name: name.trim(),
      category,
      // Blank becomes undefined, which createFeat writes as null: the column's
      // "open to anyone" is an absent value, not an empty string, and a stray
      // "" would render as an empty Prerequisite row on the card.
      prerequisite: prerequisite.trim() || undefined,
      description: description.trim(),
      benefits,
      repeatable,
      tags,
    };

    setSaving(true);
    setError(null);
    try {
      await onCreate(input);
    } catch (err) {
      console.error("Problem creating homebrew feat:", err);
      setError(errorMessage(err, "Couldn't create this feat"));
      setSaving(false);
    }
  }

  return (
    <form className="create-feat-form" onSubmit={handleSubmit}>
      <fieldset className="create-feat-section">
        <legend>The Feat</legend>

        <label className="create-feat-label" htmlFor="feat-name">
          Name *
        </label>
        <input
          id="feat-name"
          className="create-feat-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={saving}
          required
        />

        <label className="create-feat-label" htmlFor="feat-category">
          Category *
        </label>
        <select
          id="feat-category"
          className="create-feat-select"
          value={category}
          onChange={(e) => setCategory(e.target.value as FeatCategory)}
          disabled={saving}
        >
          {featCategories.map((c) => (
            <option key={c} value={c}>
              {featCategoryLabel(c)}
            </option>
          ))}
        </select>

        <label className="create-feat-label" htmlFor="feat-prerequisite">
          Prerequisite{" "}
          <span className="create-feat-hint">
            (leave blank for open to anyone — nothing enforces this)
          </span>
        </label>
        <input
          id="feat-prerequisite"
          className="create-feat-input"
          type="text"
          value={prerequisite}
          onChange={(e) => setPrerequisite(e.target.value)}
          disabled={saving}
          placeholder="e.g. Strength 13 or higher"
        />

        <label className="create-feat-label" htmlFor="feat-description">
          Description *
        </label>
        <textarea
          id="feat-description"
          className="create-feat-input create-feat-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={saving}
          required
          rows={4}
        />
      </fieldset>

      <fieldset className="create-feat-section">
        <legend>What It Does</legend>

        <label className="create-feat-label" htmlFor="feat-benefits">
          Benefits <span className="create-feat-hint">(one per line)</span>
        </label>
        <textarea
          id="feat-benefits"
          className="create-feat-input create-feat-textarea create-feat-textarea--benefits"
          value={benefitsInput}
          onChange={(e) => setBenefitsInput(e.target.value)}
          disabled={saving}
          rows={6}
          placeholder={
            "You gain a +1 bonus to AC while wielding a shield.\nOnce per turn you may shove as a bonus action."
          }
        />

        <label className="create-feat-checkbox-label">
          <input
            type="checkbox"
            checked={repeatable}
            onChange={(e) => setRepeatable(e.target.checked)}
            disabled={saving}
          />
          Can be taken more than once
        </label>

        <label className="create-feat-label" htmlFor="feat-tags">
          Tags <span className="create-feat-hint">(comma-separated)</span>
        </label>
        <input
          id="feat-tags"
          className="create-feat-input"
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          disabled={saving}
          placeholder="e.g. melee, reaction, barovian"
        />
      </fieldset>

      <div className="create-feat-actions">
        <button
          type="submit"
          className="create-feat-btn"
          disabled={saving || !name.trim() || !description.trim()}
        >
          {saving ? "Forging..." : "Create Feat"}
        </button>
      </div>

      {error && <p className="create-feat-error">{error}</p>}
    </form>
  );
}
