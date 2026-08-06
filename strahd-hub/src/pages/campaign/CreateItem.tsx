import { Navigate, useNavigate } from "react-router-dom";
import { SubmitEvent, useState } from "react";
import { useCampaign } from "../../components/CampaignLayout";
import { usePartyInventory } from "../../hooks/usePartyInventory";
import {
  type NewItem,
  armorCategories,
  damageTypes,
  weaponCategories,
  weaponProperties,
} from "../../services/items";
import { errorMessage } from "../../lib/errors";
import "./createItem.css";

export function CreateItem() {
  const campaign = useCampaign();
  const navigate = useNavigate();
  const { createHomeBrewItem } = usePartyInventory(campaign.id);

  if (!campaign.isDm)
    return <Navigate to={`/campaign/${campaign.id}`} replace />;

  async function handleCreate(input: NewItem) {
    await createHomeBrewItem(input);
    navigate(`/campaign/${campaign.id}/Inventory`);
  }

  return (
    <div className="create-item">
      <p className="create-item__eyebrow">⚒ The Forge ⚒</p>
      <h1>New Homebrew Item</h1>
      <p className="create-item__sub">
        Saved straight into this campaign's hoard — you'll land in the Inventory
        when it's made.
      </p>
      <HomebrewItemForm onCreate={handleCreate} />
    </div>
  );
}

function HomebrewItemForm({
  onCreate,
}: {
  onCreate: (input: NewItem) => Promise<void>;
}) {
  const [kind, setKind] = useState<"general" | "weapon" | "armor">("general");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  const [weaponCategory, setWeaponCategory] = useState<"simple" | "martial">(
    "simple",
  );
  const [damageDice, setDamageDice] = useState("");
  const [damageType, setDamageType] = useState<
    | "acid"
    | "bludgeoning"
    | "cold"
    | "fire"
    | "force"
    | "lightning"
    | "necrotic"
    | "piercing"
    | "poison"
    | "psychic"
    | "radiant"
    | "slashing"
    | "thunder"
  >("piercing");
  const [properties, setProperties] = useState<Set<string>>(new Set());
  const [versatileDice, setVersatileDice] = useState("");
  const [rangeNormal, setRangeNormal] = useState("");
  const [rangeLong, setRangeLong] = useState("");

  const [armorCategory, setArmorCategory] = useState<
    "light" | "medium" | "heavy" | "shield"
  >("light");
  const [baseArmorClass, setBaseArmorClass] = useState("");
  const [strengthRequirement, setStrengthRequirement] = useState("");
  const [stealthDisadvantage, setStealthDisadvantage] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleProperty(prop: string) {
    const newSet = new Set(properties);
    if (newSet.has(prop)) {
      newSet.delete(prop);
    } else {
      newSet.add(prop);
    }
    setProperties(newSet);
  }

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

    if (!price || isNaN(Number(price)) || Number(price) < 0) {
      setError("Price must be a valid non-negative number");
      return;
    }

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    let input: NewItem;

    if (kind === "weapon") {
      if (!damageDice.trim()) {
        setError("Damage dice is required for weapons");
        return;
      }

      input = {
        kind: "weapon",
        name: name.trim(),
        description: description.trim(),
        price: Number(price),
        tags,
        category: weaponCategory,
        damageDice: damageDice.trim(),
        damageType,
        properties: Array.from(properties) as any[],
        versatileDice: versatileDice.trim() || undefined,
        rangeNormal: rangeNormal ? Number(rangeNormal) : undefined,
        rangeLong: rangeLong ? Number(rangeLong) : undefined,
      };
    } else if (kind === "armor") {
      if (!baseArmorClass || isNaN(Number(baseArmorClass))) {
        setError("Armor Class is required and must be a number");
        return;
      }

      input = {
        kind: "armor",
        name: name.trim(),
        description: description.trim(),
        price: Number(price),
        tags,
        category: armorCategory,
        baseArmorClass: Number(baseArmorClass),
        strengthRequirement: strengthRequirement
          ? Number(strengthRequirement)
          : undefined,
        stealthDisadvantage,
      };
    } else {
      input = {
        kind: "general",
        name: name.trim(),
        description: description.trim(),
        price: Number(price),
        tags,
      };
    }

    setSaving(true);
    setError(null);
    try {
      await onCreate(input);
    } catch (err) {
      console.error("Problem creating homebrew item:", err);
      setError(errorMessage(err, "Couldn't create this item"));
      setSaving(false);
    }
  }

  return (
    <form className="create-item-form" onSubmit={handleSubmit}>
      <fieldset className="create-item-section">
        <legend>Basic Info</legend>

        <label className="create-item-label" htmlFor="name">
          Name *
        </label>
        <input
          id="name"
          className="create-item-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={saving}
          required
        />

        <label className="create-item-label" htmlFor="description">
          Description *
        </label>
        <textarea
          id="description"
          className="create-item-input create-item-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={saving}
          required
          rows={4}
        />

        <label className="create-item-label" htmlFor="price">
          Price (gold) *
        </label>
        <input
          id="price"
          className="create-item-input"
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          disabled={saving}
          required
        />

        <label className="create-item-label" htmlFor="tags">
          Tags <span className="create-item-hint">(comma-separated)</span>
        </label>
        <input
          id="tags"
          className="create-item-input"
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          disabled={saving}
          placeholder="e.g. consumable, potion, rare"
        />
      </fieldset>

      <fieldset className="create-item-section">
        <legend>Type</legend>

        <div className="create-item-kind-selector">
          {["general", "weapon", "armor"].map((k) => (
            <label key={k} className="create-item-radio-label">
              <input
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={(e) =>
                  setKind(e.target.value as "general" | "weapon" | "armor")
                }
                disabled={saving}
              />
              {k.charAt(0).toUpperCase() + k.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "weapon" && (
        <fieldset className="create-item-section">
          <legend>Weapon Stats</legend>

          <label className="create-item-label" htmlFor="weapon-category">
            Category *
          </label>
          <select
            id="weapon-category"
            className="create-item-select"
            value={weaponCategory}
            onChange={(e) =>
              setWeaponCategory(e.target.value as "simple" | "martial")
            }
            disabled={saving}
          >
            {weaponCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>

          <label className="create-item-label" htmlFor="damage-dice">
            Damage Dice *
          </label>
          <input
            id="damage-dice"
            className="create-item-input"
            type="text"
            value={damageDice}
            onChange={(e) => setDamageDice(e.target.value)}
            disabled={saving}
            placeholder="e.g. 1d8, 2d6"
            required
          />

          <label className="create-item-label" htmlFor="damage-type">
            Damage Type *
          </label>
          <select
            id="damage-type"
            className="create-item-select"
            value={damageType}
            onChange={(e) => setDamageType(e.target.value as any)}
            disabled={saving}
          >
            {damageTypes.map((dt) => (
              <option key={dt} value={dt}>
                {dt.charAt(0).toUpperCase() + dt.slice(1)}
              </option>
            ))}
          </select>

          <fieldset className="create-item-checkboxes">
            <legend>Properties</legend>
            {weaponProperties.map((prop) => (
              <label key={prop} className="create-item-checkbox-label">
                <input
                  type="checkbox"
                  checked={properties.has(prop)}
                  onChange={() => toggleProperty(prop)}
                  disabled={saving}
                />
                {prop.charAt(0).toUpperCase() + prop.slice(1)}
              </label>
            ))}
          </fieldset>

          <label className="create-item-label" htmlFor="versatile-dice">
            Versatile Dice
          </label>
          <input
            id="versatile-dice"
            className="create-item-input"
            type="text"
            value={versatileDice}
            onChange={(e) => setVersatileDice(e.target.value)}
            disabled={saving}
            placeholder="e.g. 1d10"
          />

          <label className="create-item-label" htmlFor="range-normal">
            Range (normal)
          </label>
          <input
            id="range-normal"
            className="create-item-input"
            type="number"
            min="0"
            value={rangeNormal}
            onChange={(e) => setRangeNormal(e.target.value)}
            disabled={saving}
            placeholder="feet"
          />

          <label className="create-item-label" htmlFor="range-long">
            Range (long)
          </label>
          <input
            id="range-long"
            className="create-item-input"
            type="number"
            min="0"
            value={rangeLong}
            onChange={(e) => setRangeLong(e.target.value)}
            disabled={saving}
            placeholder="feet"
          />
        </fieldset>
      )}

      {kind === "armor" && (
        <fieldset className="create-item-section">
          <legend>Armor Stats</legend>

          <label className="create-item-label" htmlFor="armor-category">
            Category *
          </label>
          <select
            id="armor-category"
            className="create-item-select"
            value={armorCategory}
            onChange={(e) =>
              setArmorCategory(
                e.target.value as "light" | "medium" | "heavy" | "shield",
              )
            }
            disabled={saving}
          >
            {armorCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>

          <label className="create-item-label" htmlFor="base-ac">
            Armor Class *
          </label>
          <input
            id="base-ac"
            className="create-item-input"
            type="number"
            min="1"
            value={baseArmorClass}
            onChange={(e) => setBaseArmorClass(e.target.value)}
            disabled={saving}
            required
          />

          <label className="create-item-label" htmlFor="strength-req">
            Strength Requirement
          </label>
          <input
            id="strength-req"
            className="create-item-input"
            type="number"
            min="1"
            max="20"
            value={strengthRequirement}
            onChange={(e) => setStrengthRequirement(e.target.value)}
            disabled={saving}
            placeholder="e.g. 15"
          />

          <label className="create-item-checkbox-label">
            <input
              type="checkbox"
              checked={stealthDisadvantage}
              onChange={(e) => setStealthDisadvantage(e.target.checked)}
              disabled={saving}
            />
            Stealth Disadvantage
          </label>
        </fieldset>
      )}

      <div className="create-item-actions">
        <button
          type="submit"
          className="create-item-btn create-item-btn--primary"
          disabled={saving}
        >
          {saving ? "Creating..." : "Create Item"}
        </button>
      </div>

      {error && <p className="create-item-error">{error}</p>}
    </form>
  );
}
