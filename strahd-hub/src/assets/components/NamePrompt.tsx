import { SubmitEvent, useState } from "react";
import { setDisplayName } from "../../services/profiles";
import { useAuth } from "../../services/AuthContext";

export function NamePrompt() {
  const { refetchProfile } = useAuth();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError(null);
    try {
      await setDisplayName(trimmed);
      await refetchProfile();
    } catch (err) {
      console.error("Problem setting display name:", err);
      setError(
        err instanceof Error ? err.message : "Problem setting display name",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Type Display Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
        />
        <button type="submit" disabled={submitting || !name.trim()}>
          {submitting ? "Saving..." : "Submit"}
        </button>
      </form>
      {error && <p>{error}</p>}
    </div>
  );
}
